import { PrismaClient } from '@prisma/client';

// Singleton pattern — avoids exhausting DB connections in dev (hot reload creates new instances)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['error'] });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
