import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same request-interception role).
// Runs on every page request: refreshes the Supabase session cookies and gates auth (see updateSession).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on every path EXCEPT static assets and the image proxies (/api/*). Auth gating + session
  // refresh happen for pages only; the thumbnail proxy routes stay public so cards still load covers.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
