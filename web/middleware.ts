import { NextRequest, NextResponse } from "next/server";

export default function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api(.*)"],
};
