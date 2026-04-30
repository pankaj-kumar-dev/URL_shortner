import { Request, Response, NextFunction } from 'express';
import redis from './redis';

const WINDOW_MS = 60 * 1000;   // 1 minute window
const MAX_REQUESTS = 10;        // 10 requests per IP per window

// Sliding window using Redis sorted set
// Key: rate:<ip> | Member: timestamp | Score: timestamp
// Why sorted set over simple counter: sliding window is more accurate than fixed window
// — avoids burst of 2x limit at window boundary
export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.ip ?? 'unknown';
  const key = `rate:${ip}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  try {
    const pipeline = redis.pipeline();

    // Remove entries outside the current window
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    // Add current request
    pipeline.zadd(key, now, `${now}`);
    // Count requests in window
    pipeline.zcard(key);
    // Set key expiry to auto-cleanup
    pipeline.pexpire(key, WINDOW_MS);

    const results = await pipeline.exec();

    // zcard result is at index 2
    const count = results?.[2]?.[1] as number;

    if (count > MAX_REQUESTS) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(WINDOW_MS / 1000),
      });
      return;
    }

    next();
  } catch (err) {
    // Redis down — fail open (don't block legitimate traffic)
    console.error('[RateLimiter] Redis error, skipping limit:', err);
    next();
  }
}
