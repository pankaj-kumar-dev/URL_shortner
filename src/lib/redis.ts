import Redis from 'ioredis';

// REDIS_URL takes priority (Upstash/production)
// Falls back to host+port for local Docker
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  : new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err.message);
});

export default redis;
