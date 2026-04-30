import { prisma } from './prisma';

export interface ClickJobData {
  urlId: number;
  ip: string;
  userAgent: string;
}

// BullMQ requires Redis >= 5.0; local binary is 3.0.504.
// Simple in-process fire-and-forget worker keeps the same .add() interface.
// Swap back to BullMQ once Redis is upgraded.
const analyticsQueue = {
  add(_name: string, data: ClickJobData): Promise<void> {
    setImmediate(async () => {
      try {
        await prisma.click.create({
          data: { urlId: data.urlId, ip: data.ip, userAgent: data.userAgent },
        });
      } catch (err) {
        console.error('[analytics:worker] failed:', (err as Error).message);
      }
    });
    return Promise.resolve();
  },
};

export default analyticsQueue;
