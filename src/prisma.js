import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const { PrismaClient } = pkg;

let prisma;

if (!global.prisma) {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    pgOptions:{
      ssl: {
        rejectUnauthorized: false, 
      },
    },
    
  });

  global.prisma = new PrismaClient({
    adapter,
  });
}

prisma = global.prisma;

export default prisma;