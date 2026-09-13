import { Prisma, type ContactInquiry, type ContactInquiryStatus } from "@prisma/client";
import { isConfiguredAdminEmail } from "@/lib/admin-access";
import { getAdminDataEnvironment, isAdminUserId } from "@/lib/admin";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
import { prisma } from "@/lib/prisma";

export const contactInquiryStatuses = ["open", "in_progress", "responded", "closed"] as const satisfies readonly ContactInquiryStatus[];

export type ContactInquiryFilters = {
  queue?: string;
  actorId?: string;
  query?: string;
  status?: ContactInquiryStatus | "all";
  page?: number;
  pageSize?: number;
};

export type ContactInquiryUpdateInput = {
  assignedTo?: string | null;
  priority?: string;
  snoozedUntil?: Date | null;
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

export type AdminContactInquiry = Omit<ContactInquiry, "attachment"> & {
  attachment: Omit<ContactInquiryAttachment, "dataUrl"> | null;
};

const normalizeQuery = (value?: string) => value?.trim() ?? "";

const readContactInquiryAttachment = (
  value: Prisma.JsonValue | null,
): ContactInquiryAttachment | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const attachment = value as Record<string, Prisma.JsonValue>;
  if (
    typeof attachment.name !== "string" ||
    typeof attachment.type !== "string" ||
    typeof attachment.size !== "number" ||
    typeof attachment.dataUrl !== "string"
  ) {
    return null;
  }

  return {
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  };
};

export const toAdminContactInquiry = (
  inquiry: ContactInquiry,
): AdminContactInquiry => {
  const attachment = readContactInquiryAttachment(inquiry.attachment);
  return {
    ...inquiry,
    attachment: attachment
      ? {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
        }
      : null,
  };
};

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
      environment: getDeploymentEnvironment(),
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
      environment: getAdminDataEnvironment(),
      ...(filters.queue === "mine" ? { assignedTo: filters.actorId ?? "" } : {}),
      ...(filters.queue === "snoozed" ? { snoozedUntil: { gt: new Date() } } : {}),
      ...(filters.queue === "open" ? { status: { in: ["open", "in_progress"] }, AND: [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] }] } : {}),
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
      contactInquiry.count({ where: { environment: getAdminDataEnvironment(), status: "open" } }),
      contactInquiry.count({ where: { environment: getAdminDataEnvironment(), status: "in_progress" } }),
      contactInquiry.count({ where: { environment: getAdminDataEnvironment(), status: "responded" } }),
    ]);

    return {
      items: items.map(toAdminContactInquiry),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      openCount,
      inProgressCount,
      respondedCount,
    };
  } catch {
    throw new Error("Support storage is unavailable. Please retry.");
  }
}

export async function updateContactInquiry(id: string, input: ContactInquiryUpdateInput, actorId?: string) {
  const contactInquiry = (prisma as unknown as { contactInquiry?: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ContactInquiry> } }).contactInquiry;

  if (!contactInquiry) {
    throw new Error("Contact inquiry storage is unavailable in this database.");
  }

  const inquiry = await prisma.contactInquiry.findFirst({
    where: { id, environment: getAdminDataEnvironment() },
    select: { id: true },
  });
  if (!inquiry) {
    throw new Error("Inquiry not found");
  }

  if (input.assignedTo) {
    const member = await prisma.adminMember.findUnique({ where: { clerkUserId: input.assignedTo } });
    if (member ? (!member.active || !["owner", "admin", "support"].includes(member.role)) : !(isAdminUserId(input.assignedTo) || await isConfiguredAdminEmail(input.assignedTo))) throw new Error("Assign this case to an active Owner, Admin, or Support member.");
  }
  return prisma.$transaction(async tx => {
  const updated = await tx.contactInquiry.update({
    where: { id: inquiry.id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.snoozedUntil !== undefined ? { snoozedUntil: input.snoozedUntil } : {}),
      ...(input.adminReplySubject !== undefined ? { adminReplySubject: input.adminReplySubject?.trim() || null } : {}),
      ...(input.adminReplyBody !== undefined ? { adminReplyBody: input.adminReplyBody?.trim() || null } : {}),
      ...(input.adminReplyAt !== undefined ? { adminReplyAt: input.adminReplyAt } : {}),
      ...(input.adminReplyBy !== undefined ? { adminReplyBy: input.adminReplyBy?.trim() || null } : {}),
    },
  });
    if (actorId && (input.assignedTo !== undefined || input.priority !== undefined || input.snoozedUntil !== undefined)) await tx.adminSupportMessage.create({ data: { inquiryId: updated.id, actorId, kind: "assignment", body: `Assignment: ${updated.assignedTo ?? "Unassigned"}; priority: ${updated.priority}; snoozed until: ${updated.snoozedUntil?.toISOString() ?? "Not snoozed"}`, status: "internal", idempotencyKey: crypto.randomUUID() } });
    return updated;
  });
}

export async function getAdminContactInquiryAttachment(id: string) {
  const inquiry = await prisma.contactInquiry.findFirst({
    where: { id, environment: getAdminDataEnvironment() },
    select: { attachment: true },
  });

  return inquiry ? readContactInquiryAttachment(inquiry.attachment) : null;
}
