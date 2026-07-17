import type { CircleRole, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

const roleRank: Record<CircleRole, number> = {
  participant: 1,
  member: 2,
  organizer: 3,
};

export class CircleAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CircleAccessError";
    this.status = status;
  }
}

export const getCircleCurrentUser = async (): Promise<User> =>
  getSplitBillCurrentUser();

export const getCircleAccess = async (
  circleId: string,
  userId: string,
  minimumRole: CircleRole = "participant",
) => {
  const circle = await prisma.circle.findFirst({
    where: {
      id: circleId,
      archivedAt: null,
      OR: [
        { ownerUserId: userId },
        { memberships: { some: { userId, status: "active" } } },
      ],
    },
    include: {
      memberships: {
        where: { userId, status: "active" },
        take: 1,
      },
    },
  });

  if (!circle) {
    throw new CircleAccessError(
      "Circle not found or you no longer have access.",
      404,
    );
  }

  const membership = circle.memberships[0] ?? null;
  const role: CircleRole =
    circle.ownerUserId === userId
      ? "organizer"
      : (membership?.role ?? "participant");
  if (roleRank[role] < roleRank[minimumRole]) {
    throw new CircleAccessError(
      "You do not have permission to make that change.",
      403,
    );
  }

  return {
    circle,
    membership,
    role,
    isOwner: circle.ownerUserId === userId,
  };
};

export const getCircleErrorResponse = (error: unknown) => {
  if (error instanceof CircleAccessError) {
    return { message: error.message, status: error.status };
  }

  return {
    message:
      error instanceof Error ? error.message : "Unable to update this Circle.",
    status: 400,
  };
};
