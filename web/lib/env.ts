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
  OPENAI_ADVISER_MODEL: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_MODEL: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_IMAGE_MODEL: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_PDF_MODEL: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_STRONG_MODEL: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_OCR_MODEL: z.string().min(1).optional(),
  OPENAI_IMPORT_PARSER_PRIMARY: z.string().min(1).optional(),
  BRANKAS_ENV: z.enum(["sandbox", "live"]).optional(),
  BRANKAS_STATEMENT_API_KEY: z.string().min(1).optional(),
  BRANKAS_STATEMENT_WEBHOOK_SECRET: z.string().min(1).optional(),
  PAYPAL_ENV: z.enum(["sandbox", "live"]).optional(),
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  PAYPAL_MONTHLY_PLAN_ID: z.string().min(1).optional(),
  PAYPAL_ANNUAL_PLAN_ID: z.string().min(1).optional(),
  PAYPAL_PRO_PLAN_ID: z.string().min(1).optional(),
  PAYPAL_BUYER_COUNTRY: z.string().length(2).optional(),
  ADMIN_USER_IDS: z.string().min(1).optional(),
  STAGING_BASIC_AUTH_USERNAME: z.string().min(1).optional(),
  STAGING_BASIC_AUTH_PASSWORD: z.string().min(1).optional(),
  CLOVER_IMPORT_STORAGE_DIR: z.string().min(1).optional(),
  ZOHO_SMTP_USER: z.string().email().optional(),
  ZOHO_SMTP_PASSWORD: z.string().min(1).optional(),
  ZOHO_SMTP_HOST: z.string().min(1).optional(),
  ZOHO_SMTP_PORT: z.coerce.number().int().positive().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const getEnv = (): AppEnv => envSchema.parse(process.env);
