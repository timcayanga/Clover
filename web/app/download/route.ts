export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  let destination = "https://clover.ph/";

  if (/iPhone|iPad|iPod/i.test(userAgent) || /Macintosh.*Mobile\//i.test(userAgent)) {
    destination = "https://apps.apple.com/app/id6811711508";
  } else if (/Android/i.test(userAgent)) {
    destination = "https://play.google.com/store/apps/details?id=ph.clover.app";
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      Vary: "User-Agent",
    },
  });
}
