import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import {
  listAdminRetryFiles,
  previewAdminRetry,
  executeAdminRetry,
} from "@/lib/admin-import-retry";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unable to retry imports.";
  return Response.json(
    { error: message },
    {
      status:
        message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 400,
    },
  );
}
export async function GET() {
  try {
    await requireAdminAuth("operate");
    return Response.json({ files: await listAdminRetryFiles() });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("operate");
    return Response.json(
      await previewAdminRetry(actor.userId, await request.json()),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("operate");
    const input = z
      .object({ previewId: z.string().min(1) })
      .strict()
      .parse(await request.json());
    return Response.json(
      await executeAdminRetry(actor.userId, input.previewId),
    );
  } catch (error) {
    return failure(error);
  }
}
