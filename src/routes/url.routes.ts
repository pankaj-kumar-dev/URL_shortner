import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { encodeBase62 } from '../lib/base62';
import redis from '../lib/redis';
import { rateLimiter } from '../lib/rateLimiter';
import { validateUrl } from '../lib/urlValidator';
import analyticsQueue from '../lib/queue';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// POST /shorten — rate limited + auth + malicious URL check
router.post('/shorten', rateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  // Malicious URL validation
  const validation = validateUrl(url);
  if (!validation.valid) {
    res.status(400).json({ error: validation.reason });
    return;
  }

  try {
    const record = await prisma.url.create({
      data: { originalUrl: url, shortCode: '', userId: req.userId! },
    });

    const shortCode = encodeBase62(record.id);
    const updated = await prisma.url.update({
      where: { id: record.id },
      data: { shortCode },
    });

    // Warm cache on create — first redirect is always a cache hit
    await redis.set(`url:${shortCode}`, updated.originalUrl, 'EX', CACHE_TTL_SECONDS);

    res.status(201).json({
      shortCode: updated.shortCode,
      shortUrl: `${req.protocol}://${req.get('host')}/${updated.shortCode}`,
      originalUrl: updated.originalUrl,
    });
  } catch (err) {
    console.error('[POST /shorten]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:code/stats — auth required, returns click analytics
router.get('/:code/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { code } = req.params;

  try {
    const record = await prisma.url.findUnique({
      where: { shortCode: code },
      include: { clicks: true },
    });

    if (!record) {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    if (record.userId !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const totalClicks = record.clicks.length;

    const uniqueIPs = new Set(record.clicks.map((c) => c.ip)).size;

    const uaCounts: Record<string, number> = {};
    for (const click of record.clicks) {
      uaCounts[click.userAgent] = (uaCounts[click.userAgent] ?? 0) + 1;
    }
    const topUserAgents = Object.entries(uaCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([userAgent, count]) => ({ userAgent, count }));

    res.json({
      shortCode: code,
      originalUrl: record.originalUrl,
      totalClicks,
      uniqueIPs,
      topUserAgents,
    });
  } catch (err) {
    console.error('[GET /:code/stats]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:code — Redis-first lookup + async analytics
router.get('/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  const cacheKey = `url:${code}`;

  try {
    // 1. Cache hit
    const cached = await redis.get(cacheKey);
    if (cached) {
      // Fire-and-forget — do NOT await, must not block redirect
      // We need urlId for Click record; cache only stores originalUrl.
      // Look up urlId async alongside the enqueue (non-blocking path).
      enqueueClick(code, req).catch(() => {}); // swallow errors — analytics is non-critical
      res.redirect(301, cached);
      return;
    }

    // 2. Cache miss — hit DB
    const record = await prisma.url.findUnique({
      where: { shortCode: code },
    });

    if (!record) {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    // 3. Populate cache
    await redis.set(cacheKey, record.originalUrl, 'EX', CACHE_TTL_SECONDS);

    // Fire-and-forget analytics
    analyticsQueue.add('click', {
      urlId: record.id,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    }).catch(() => {}); // swallow — analytics must never break redirect

    res.redirect(301, record.originalUrl);
  } catch (err) {
    console.error('[GET /:code]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolves urlId from DB (cheap: indexed lookup) then enqueues — used on cache-hit path
async function enqueueClick(code: string, req: Request): Promise<void> {
  const record = await prisma.url.findUnique({
    where: { shortCode: code },
    select: { id: true },
  });
  if (!record) return;

  await analyticsQueue.add('click', {
    urlId: record.id,
    ip: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });
}

export default router;
