import { getAppBuildInfo } from "@/lib/build-info";

export async function GET() {
  return Response.json(
    {
      ok: true,
      build: getAppBuildInfo(),
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function HEAD() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
