import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "server/prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres",
  },
});
