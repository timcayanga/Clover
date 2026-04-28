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

const normalizeQuery = (value?: string) => value?.trim() ?? "";

export async function createContactInquiry(input: {
  name: string;
  email: string;
  message: string;
  sourcePage?: string | null;
  userAgent?: string | null;
}) {
  return prisma.contactInquiry.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      message: input.message.trim(),
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

  const [items, total, openCount, respondedCount] = await prisma.$transaction([
    prisma.contactInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contactInquiry.count({ where }),
    prisma.contactInquiry.count({ where: { status: "open" } }),
    prisma.contactInquiry.count({ where: { status: "responded" } }),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    openCount,
    respondedCount,
  };
}

export async function updateContactInquiry(id: string, input: ContactInquiryUpdateInput) {
  return prisma.contactInquiry.update({
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
