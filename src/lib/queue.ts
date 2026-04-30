import { Queue, Worker, Job } from 'bullmq';
import { prisma } from './prisma';

// Reuse the same Redis connection config
const connection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
};

export interface ClickJobData {
  urlId: number;
  ip: string;
  userAgent: string;
}

// Queue — producers call this
export const analyticsQueue = new Queue<ClickJobData>('analytics', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100, // keep last 100 completed jobs for debugging
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

// Worker — runs in the same process; fine for this scale
// For high traffic, extract to a separate worker process
const worker = new Worker<ClickJobData>(
  'analytics',
  async (job: Job<ClickJobData>) => {
    const { urlId, ip, userAgent } = job.data;
    await prisma.click.create({
      data: { urlId, ip, userAgent },
    });
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error(`[analytics:worker] job ${job?.id} failed:`, err.message);
});

export default analyticsQueue;
