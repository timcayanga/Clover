import { storeAdviserAttachment } from "@/lib/adviser-attachments.server";
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  assertTrustedRequestOrigin,
  assertContentLengthWithin,
} from "@/lib/request-security";
import { assertRateLimit } from "@/lib/rate-limit";
import { MAX_ADVISER_FILE_BYTES } from "@/lib/adviser-attachments";
export const runtime = "nodejs";
export const maxDuration = 120;
const respond = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, MAX_ADVISER_FILE_BYTES + 100_000);
    const { userId } = await getSessionContext();
    const user = await getOrCreateCurrentUser(userId);
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return respond({ error: "Choose a Profile first." }, 400);
    await assertWorkspaceAccess(user.clerkUserId, workspaceId);
    try {
      assertRateLimit(`adviser-attachment:${user.id}`, 6, 60_000);
    } catch {
      return respond(
        { error: "Please wait a minute before attaching another file." },
        429,
      );
    }
    // Bound actual multipart bytes even when Content-Length is absent.
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Choose a file." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > MAX_ADVISER_FILE_BYTES + 100_000) {
        await reader.cancel();
        return respond({ error: "Choose a file up to 3.5 MB." }, 413);
      }
      chunks.push(next.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1)
      return respond({ error: "Attach one file at a time." }, 400);
    return respond({
      attachment: await storeAdviserAttachment(file, workspaceId, user.id),
    });
  } catch (error) {
    const message =
      error instanceof Error &&
      /^(No readable text|This file is too long)/.test(error.message)
        ? error.message
        : null;
    if (message) return respond({ error: message }, 422);
    return respond(
      {
        error:
          "The file could not be attached. Check access and try an unlocked PDF, supported spreadsheet, text file or clearer image.",
      },
      400,
    );
  }
}
