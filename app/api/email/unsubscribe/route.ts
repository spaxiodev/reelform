import { NextResponse, type NextRequest } from "next/server";
import { setMarketingConsent } from "@/lib/email/send";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

// Turns marketing email off for the account the signed token names.
//
// Two callers:
//   - the button on /email/unsubscribe (a normal form post), which is sent
//     back there with ?done=1
//   - mail clients honouring the List-Unsubscribe-Post header (RFC 8058),
//     which POST `List-Unsubscribe=One-Click` and expect a bare 200
//
// A GET never unsubscribes anyone: link scanners in corporate mail follow
// every URL in a message, and would otherwise unsubscribe people who never
// clicked.
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let token = request.nextUrl.searchParams.get("token");
  let oneClick = false;

  if (contentType.includes("form")) {
    const form = await request.formData();
    token = token ?? (form.get("token") as string | null);
    oneClick = form.get("List-Unsubscribe") === "One-Click";
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    if (oneClick) return new NextResponse("invalid token", { status: 400 });
    return NextResponse.redirect(new URL("/email/unsubscribe?error=invalid", request.nextUrl.origin));
  }

  try {
    await setMarketingConsent(userId, false, "unsubscribe_link");
  } catch (err) {
    console.error("[email/unsubscribe] failed", { userId, err });
    if (oneClick) return new NextResponse("error", { status: 500 });
    return NextResponse.redirect(new URL("/email/unsubscribe?error=failed", request.nextUrl.origin));
  }

  if (oneClick) return new NextResponse("ok", { status: 200 });
  return NextResponse.redirect(
    new URL(`/email/unsubscribe?done=1&token=${encodeURIComponent(token!)}`, request.nextUrl.origin),
    303
  );
}
