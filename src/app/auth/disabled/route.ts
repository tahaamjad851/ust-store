import { NextResponse, type NextRequest } from "next/server";
import { isAccountEnabled } from "@/lib/auth/account-status";
import { createClient } from "@/lib/supabase/server";

// Where the guards send a signed-in user whose account was disabled: end that session, then show
// the sign-in page with an explanation. It only ever signs out an account that really is disabled,
// so a link to it cannot be used to sign somebody else out.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  const to = (path: string) => {
    const url = request.nextUrl.clone();
    const target = new URL(path, "http://placeholder");
    url.pathname = target.pathname;
    url.search = target.search;
    return NextResponse.redirect(url);
  };

  if (!data.user) return to("/login");
  if (await isAccountEnabled(supabase, data.user.id)) return to("/account");

  await supabase.auth.signOut({ scope: "local" });
  return to("/login?error=disabled");
}
