import { Prisma, type ContactInquiry, type ContactInquiryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const contactInquiryStatuses = ["open", "in_progress", "responded", "closed"] as const satisfies readonly ContactInquiryStatus[];

export type ContactInquiryFilters = {
  query?: string;
  status?: ContactInquiryStatus | "all";
  page?: number;
  pageSize?: number;
};

export type ContactInquiryUpdateInput = {
  status?: ContactInquiryStatus;
  adminReplySubject?: string | null;
  adminReplyBody?: string | null;
  adminReplyAt?: Date | null;
  adminReplyBy?: string | null;
};

export type ContactInquiryAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

const normalizeQuery = (value?: string) => value?.trim() ?? "";

export async function createContactInquiry(input: {
  name: string;
  email: string;
  message: string;
  attachment?: ContactInquiryAttachment | null;
  sourcePage?: string | null;
  userAgent?: string | null;
}) {
  const contactInquiry = (prisma as unknown as { contactInquiry?: { create: (args: { data: Record<string, unknown> }) => Promise<ContactInquiry> } }).contactInquiry;

  if (!contactInquiry) {
    return null;
  }

  return contactInquiry.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      message: input.message.trim(),
      attachment: input.attachment ? (input.attachment as Prisma.InputJsonValue) : Prisma.DbNull,
      sourcePage: input.sourcePage?.trim() ? input.sourcePage.trim().slice(0, 255) : null,
      userAgent: input.userAgent?.trim() ? input.userAgent.trim().slice(0, 255) : null,
      status: "open",
    },
  });
}

export async function getAdminContactInquiries(filters: ContactInquiryFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const query = normalizeQuery(filters.query).toLowerCase();
  const contactInquiry = (prisma as unknown as {
    contactInquiry?: {
      findMany: (args: Prisma.ContactInquiryFindManyArgs) => Promise<ContactInquiry[]>;
      count: (args: Prisma.ContactInquiryCountArgs) => Promise<number>;
    };
  }).contactInquiry;

  if (!contactInquiry) {
    return {
      items: [],
      page,
      pageSize,
      total: 0,
      totalPages: 1,
      openCount: 0,
      inProgressCount: 0,
      respondedCount: 0,
    };
  }

  try {
    const where: Prisma.ContactInquiryWhereInput = {
      ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { message: { contains: query, mode: "insensitive" } },
              { sourcePage: { contains: query, mode: "insensitive" } },
              { adminReplySubject: { contains: query, mode: "insensitive" } },
              { adminReplyBody: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, openCount, inProgressCount, respondedCount] = await Promise.all([
      contactInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      contactInquiry.count({ where }),
      contactInquiry.count({ where: { status: "open" } }),
      contactInquiry.count({ where: { status: "in_progress" } }),
      contactInquiry.count({ where: { status: "responded" } }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      openCount,
      inProgressCount,
      respondedCount,
    };
  } catch {
    return {
      items: [],
      page,
      pageSize,
      total: 0,
      totalPages: 1,
      openCount: 0,
      inProgressCount: 0,
      respondedCount: 0,
    };
  }
}

export async function updateContactInquiry(id: string, input: ContactInquiryUpdateInput) {
  const contactInquiry = (prisma as unknown as { contactInquiry?: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ContactInquiry> } }).contactInquiry;

  if (!contactInquiry) {
    throw new Error("Contact inquiry storage is unavailable in this database.");
  }

  return contactInquiry.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.adminReplySubject !== undefined ? { adminReplySubject: input.adminReplySubject?.trim() || null } : {}),
      ...(input.adminReplyBody !== undefined ? { adminReplyBody: input.adminReplyBody?.trim() || null } : {}),
      ...(input.adminReplyAt !== undefined ? { adminReplyAt: input.adminReplyAt } : {}),
      ...(input.adminReplyBy !== undefined ? { adminReplyBy: input.adminReplyBy?.trim() || null } : {}),
    },
  });
}

export type AdminContactInquiry = ContactInquiry;
