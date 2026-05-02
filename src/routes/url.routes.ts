import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { encodeBase62 } from '../lib/base62';
import redis from '../lib/redis';
import { rateLimiter } from '../lib/rateLimiter';
import { validateUrl } from '../lib/urlValidator';
import analyticsQueue from '../lib/queue';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h

interface CacheEntry {
  url: string;
  urlId: number;
  expiresAt: string | null;
}

function buildCacheEntry(url: string, urlId: number, expiresAt: Date | null): string {
  return JSON.stringify({ url, urlId, expiresAt: expiresAt?.toISOString() ?? null });
}

function parseCacheEntry(raw: string): CacheEntry | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'url' in parsed && 'urlId' in parsed) {
      return parsed as CacheEntry;
    }
  } catch {}
  return null;
}

function cacheTTL(expiresAt: Date | null): number {
  if (!expiresAt) return CACHE_TTL_SECONDS;
  const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.min(CACHE_TTL_SECONDS, remaining);
}

// POST /shorten
router.post('/shorten', rateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
  const { url, ttlSeconds } = req.body as { url?: string; ttlSeconds?: unknown };

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const validation = validateUrl(url);
  if (!validation.valid) {
    res.status(400).json({ error: validation.reason });
    return;
  }

  let expiresAt: Date | null = null;
  if (ttlSeconds !== undefined) {
    if (!Number.isInteger(ttlSeconds) || (ttlSeconds as number) < 60) {
      res.status(400).json({ error: 'ttlSeconds must be an integer >= 60' });
      return;
    }
    expiresAt = new Date(Date.now() + (ttlSeconds as number) * 1000);
  }

  try {
    const record = await prisma.url.create({
      data: { originalUrl: url, shortCode: '', userId: req.userId!, expiresAt },
    });

    const shortCode = encodeBase62(record.id);
    const updated = await prisma.url.update({
      where: { id: record.id },
      data: { shortCode },
    });

    const ttl = cacheTTL(updated.expiresAt);
    const cv = buildCacheEntry(updated.originalUrl, updated.id, updated.expiresAt);
    await redis.set('url:' + shortCode, cv, 'EX', ttl);

    res.status(201).json({
      shortCode: updated.shortCode,
      shortUrl: req.protocol + '://' + req.get('host') + '/' + updated.shortCode,
      originalUrl: updated.originalUrl,
      expiresAt: updated.expiresAt ?? null,
    });
  } catch (err) {
    console.error('[POST /shorten]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /my/urls
router.get('/my/urls', authMiddleware, async (req: AuthRequest, res: Response) => {
  const rawLimit = parseInt(req.query.limit as string, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
  const rawCursor = parseInt(req.query.cursor as string, 10);
  const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? rawCursor : undefined;

  try {
    const rows = await prisma.url.findMany({
      where: {
        userId: req.userId!,
        ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        shortCode: true,
        originalUrl: true,
        createdAt: true,
        expiresAt: true,
        _count: { select: { clicks: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    const host = req.protocol + '://' + req.get('host');

    res.json({
      urls: page.map((r) => ({
        id: r.id,
        shortCode: r.shortCode,
        shortUrl: host + '/' + r.shortCode,
        originalUrl: r.originalUrl,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt ?? null,
        clickCount: r._count.clicks,
      })),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('[GET /my/urls]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:code/stats
router.get('/:code/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { code } = req.params;

  try {
    const record = await prisma.url.findUnique({
      where: { shortCode: code },
      select: { id: true, userId: true, originalUrl: true, expiresAt: true },
    });

    if (!record) {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    if (record.userId !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const [totalClicks, uniqueIPRows, topUserAgents] = await Promise.all([
      prisma.click.count({ where: { urlId: record.id } }),
      prisma.click.findMany({
        where: { urlId: record.id },
        distinct: ['ip'],
        select: { ip: true },
      }),
      prisma.click.groupBy({
        by: ['userAgent'],
        where: { urlId: record.id },
        _count: { userAgent: true },
        orderBy: { _count: { userAgent: 'desc' } },
        take: 3,
      }),
    ]);

    res.json({
      shortCode: code,
      originalUrl: record.originalUrl,
      expiresAt: record.expiresAt ?? null,
      totalClicks,
      uniqueIPs: uniqueIPRows.length,
      topUserAgents: topUserAgents.map((r) => ({
        userAgent: r.userAgent,
        count: r._count.userAgent,
      })),
    });
  } catch (err) {
    console.error('[GET /:code/stats]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:code — Redis-first redirect
router.get('/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  const cacheKey = 'url:' + code;

  try {
    const raw = await redis.get(cacheKey);
    if (raw) {
      const entry = parseCacheEntry(raw);
      if (entry) {
        if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
          await redis.del(cacheKey);
          res.status(410).json({ error: 'This link has expired' });
          return;
        }
        analyticsQueue.add('click', {
          urlId: entry.urlId,
          ip: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        }).catch(() => {});
        res.redirect(301, entry.url);
        return;
      }
    }

    const record = await prisma.url.findUnique({ where: { shortCode: code } });

    if (!record) {
      res.status(404).json({ error: 'Short URL not found' });
      return;
    }

    if (record.expiresAt && record.expiresAt <= new Date()) {
      res.status(410).json({ error: 'This link has expired' });
      return;
    }

    const ttl = cacheTTL(record.expiresAt);
    const cv2 = buildCacheEntry(record.originalUrl, record.id, record.expiresAt);
    await redis.set(cacheKey, cv2, 'EX', ttl);

    analyticsQueue.add('click', {
      urlId: record.id,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    }).catch(() => {});

    res.redirect(301, record.originalUrl);
  } catch (err) {
    console.error('[GET /:code]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
