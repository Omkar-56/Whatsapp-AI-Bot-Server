import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const { PrismaClient } = pkg;

const globalForPrisma = globalThis;

if (!globalForPrisma.prisma) {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // ssl: true tells pg driver to use SSL but NOT verify the cert chain
    // this is correct for Supabase pooler which uses self-signed certs
    pgOptions: {
      ssl: {
        rejectUnauthorized: false
      }
    }
  });

  globalForPrisma.prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"]
  });
}

export default globalForPrisma.prisma;