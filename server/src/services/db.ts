import { PrismaClient } from '@prisma/client';

// Singleton Prisma client to avoid connection explosions in serverless / hot reload.
export const prisma = new PrismaClient();

