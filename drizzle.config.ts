import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Point at the schema file so drizzle-kit can introspect it
  schema: "./src/lib/schema.ts",

  // Output folder for generated SQL migration files
  out: "./drizzle/migrations",

  dialect: "postgresql",

  dbCredentials: {
    // drizzle-kit reads this at CLI time (not edge runtime), so process.env is fine
    url: process.env.DATABASE_URL!,
  },

  // Emit verbose SQL so migrations are easy to audit before applying
  verbose: true,
  strict: true,
});
