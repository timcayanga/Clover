import { z } from "zod";

const envSchema = z.object({
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  GUMROAD_WEBHOOK_SECRET: z.string().min(1).optional(),
  GUMROAD_PRO_PRODUCT_ID: z.string().min(1).optional(),
  GUMROAD_PRO_PRODUCT_PERMALINK: z.string().min(1).optional(),
  GUMROAD_UPGRADE_URL: z.string().url().optional(),
  STAGING_BASIC_AUTH_USERNAME: z.string().min(1).optional(),
  STAGING_BASIC_AUTH_PASSWORD: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const getEnv = (): AppEnv => envSchema.parse(process.env);
