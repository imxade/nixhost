import { z } from "zod";

const envSchema = z.object({
  HOSTNAME: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NIXHOST_PUBLIC_URL: z.string().url().optional().or(z.literal("")),
  NIXHOST_BUILD_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  NIXHOST_GIT_POLL_SECONDS: z.coerce.number().int().min(15).max(86400).default(60),
  NIXHOST_METRICS_SECONDS: z.coerce.number().int().min(2).max(300).default(5),
  NIXHOST_MIN_FREE_DISK_MB: z.coerce.number().int().min(128).default(1024),
  NIXHOST_MIN_FREE_MEMORY_MB: z.coerce.number().int().min(64).default(256),
  NIXHOST_RELEASE_RETENTION: z.coerce.number().int().min(1).max(100).default(5),
  NIXHOST_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  NIXHOST_LOG_MAX_MB: z.coerce.number().int().min(10).max(102400).default(1024),
  NIXHOST_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const config = envSchema.parse(process.env);
