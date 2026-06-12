import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supa = await serverClient();
      const { error } = await supa.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL("/portal/login?error=expired", request.url),
        );
      }
    } catch {
      return NextResponse.redirect(
        new URL("/portal/login?error=expired", request.url),
      );
    }
  } else {
    return NextResponse.redirect(
      new URL("/portal/login?error=expired", request.url),
    );
  }

  return NextResponse.redirect(new URL("/portal", request.url));
}
