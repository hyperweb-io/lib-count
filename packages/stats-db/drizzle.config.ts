import type { Config } from "drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "sqlite.db",
  },
} satisfies Config;
