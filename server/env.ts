// server/env.ts
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

/** Parsed, immutable server environment configuration. */
export const env = Object.freeze(envSchema.parse(process.env));
