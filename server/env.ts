// server/env.ts
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5501),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5500"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

/** Parsed, immutable server environment configuration. */
export const env = Object.freeze(envSchema.parse(process.env));
