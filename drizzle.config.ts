import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations run as the table-owning role so RLS policies can be created;
    // the app runtime connects with the (non-owner) DATABASE_URL.
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
