import { z } from "zod";

const qrImageDataSchema = z
  .string()
  .trim()
  .max(1_500_000)
  .nullable()
  .optional()
  .refine(
    (value) => !value || /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value),
    "QR image must be a PNG, JPEG, or WebP image"
  );

export const splitBillPaymentProfileSchema = z.object({
  label: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(80),
  currency: z.string().trim().min(3).max(8).default("PHP"),
  personName: z.string().trim().max(120).nullable().optional(),
  accountName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(120).nullable().optional(),
  qrPayload: z.string().trim().max(10_000).nullable().optional(),
  qrImageData: qrImageDataSchema,
  isDefault: z.boolean().optional(),
});
