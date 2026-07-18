import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getCircleAccess,
  getCircleCurrentUser,
  getCircleErrorResponse,
} from "@/lib/circle-access";
import { circleTypes } from "@/lib/circles";
import {
  assertContentLengthWithin,
  assertTrustedRequestOrigin,
} from "@/lib/request-security";
import { capturePostHogServerEvent } from "@/lib/analytics";

const updateCircleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(circleTypes).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  avatarUrl: z.string().trim().max(200_000).nullable().optional(),
  color: z
    .enum(["teal", "green", "blue", "violet", "coral", "gold"])
    .optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ circleId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, 250_000);
    const user = await getCircleCurrentUser();
    const { circleId } = await params;
    const access = await getCircleAccess(circleId, user.id, "organizer");
    const body = updateCircleSchema.parse(await request.json());

    const circle = await prisma.$transaction(async (tx) => {
      const updated = await tx.circle.update({
        where: { id: circleId },
        data: body,
      });
      await tx.splitBillGroup.updateMany({
        where: { circleId },
        data: {
          name: body.name ?? access.circle.name,
          avatarUrl:
            body.avatarUrl === undefined
              ? access.circle.avatarUrl
              : body.avatarUrl,
        },
      });
      await tx.circleActivity.create({
        data: {
          circleId,
          actorUserId: user.id,
          action: "circle_updated",
          entityType: "circle",
          entityId: circleId,
          summary: `${updated.name} settings were updated.`,
          metadata: { changedFields: Object.keys(body) },
        },
      });
      return updated;
    });

    void capturePostHogServerEvent("circle_updated", user.id, {
      circle_id: circleId,
      changed_field_count: Object.keys(body).length,
    });

    return NextResponse.json({ circle });
  } catch (error) {
    const response = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ circleId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getCircleCurrentUser();
    const { circleId } = await params;
    const access = await getCircleAccess(circleId, user.id, "organizer");
    if (access.circle.ownerUserId !== user.id) {
      return NextResponse.json(
        { error: "Only the Circle owner can delete this Circle." },
        { status: 403 },
      );
    }

    await prisma.circle.delete({ where: { id: circleId } });

    void capturePostHogServerEvent("circle_deleted", user.id, {
      circle_id: circleId,
      deletion_mode: "permanent",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}
