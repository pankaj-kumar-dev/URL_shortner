import Redis from 'ioredis';

// Singleton — one connection pool shared across the app
// lazyConnect: true so we don't crash on startup if Redis is temporarily down
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

redis.on('error', (err) => {
  // Log but don't crash — app degrades gracefully to DB-only on Redis failure
  console.error('[Redis] connection error:', err.message);
});

export default redis;
