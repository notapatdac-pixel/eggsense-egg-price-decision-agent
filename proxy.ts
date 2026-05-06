import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => {
          cs.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const p = request.nextUrl.pathname
  const PROTECTED = ["/overview", "/ai-agent", "/business-profile", "/news"]
  const AUTH_ONLY = ["/login", "/register"]
  if (PROTECTED.some((r) => p.startsWith(r)) && !user)
    return NextResponse.redirect(new URL("/login", request.url))
  if (AUTH_ONLY.some((r) => p.startsWith(r)) && user)
    return NextResponse.redirect(new URL("/overview", request.url))
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
