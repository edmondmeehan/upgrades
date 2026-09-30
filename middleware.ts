import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  // Marketing links like /for-artists?promo=SPRING5 remember the code until the artist is set up.
  const promo = request.nextUrl.searchParams.get("promo");
  if (promo && /^[A-Za-z0-9-]{3,30}$/.test(promo)) {
    response.cookies.set("promo", promo.toUpperCase(), { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", httpOnly: true });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
