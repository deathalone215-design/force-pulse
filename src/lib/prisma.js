import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = global;

const getPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new pg.Pool({
    connectionString,
    // PgBouncer transaction mode: avoid sticky stale sessions
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

const g = globalForPrisma;
if (!g.prisma || g.__prismaUrl !== process.env.DATABASE_URL) {
  g.prisma = getPrismaClient();
  g.__prismaUrl = process.env.DATABASE_URL;
}

export const prisma = g.prisma;
