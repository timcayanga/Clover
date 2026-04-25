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
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_MODEL: z.string().min(1).optional(),
  PAYPAL_ENV: z.enum(["sandbox", "live"]).optional(),
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  PAYPAL_PRO_PLAN_ID: z.string().min(1).optional(),
  PAYPAL_BUYER_COUNTRY: z.string().length(2).optional(),
  STAGING_BASIC_AUTH_USERNAME: z.string().min(1).optional(),
  STAGING_BASIC_AUTH_PASSWORD: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const getEnv = (): AppEnv => envSchema.parse(process.env);
