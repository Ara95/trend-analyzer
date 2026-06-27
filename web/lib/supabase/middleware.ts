import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the user's session cookies on every request AND gates access:
 *  - not signed in + on a protected route        → redirect to /login
 *  - signed in + on /login or /register          → redirect to /search
 *
 * The careful cookie dance (mutating BOTH request and the response we return) is the documented
 * @supabase/ssr pattern — getUser() may rotate the auth cookies and both copies must agree, or the
 * client and server disagree about the session. Do not insert logic between createServerClient and
 * getUser(). Use getUser() (revalidates with the auth server), never getSession().
 */

// Routes reachable without a session. Everything else requires login.
const PUBLIC_PREFIXES = ["/login", "/register", "/auth"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/search";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
