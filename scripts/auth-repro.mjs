// Reproduces the "logged out on refresh" report end-to-end in a real browser.
// Creates a throwaway confirmed test user via the Supabase admin API, signs in
// through the real /login UI, then reloads and reports cookie + redirect state.
import { chromium } from "playwright";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const EMAIL = `authtest+${Date.now()}@reelform.test`;
const PASSWORD = "test-password-1234";

async function main() {
  // 1. Throwaway confirmed test user (cleaned up at the end)
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const user = await createRes.json();
  if (!createRes.ok) throw new Error(`test user creation failed: ${JSON.stringify(user)}`);
  console.log(`[setup] test user ${EMAIL} (${user.id})`);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[browser error] ${m.text()}`);
  });

  const dumpCookies = async (label) => {
    const cookies = await context.cookies(APP);
    console.log(
      `[cookies ${label}]`,
      cookies.length === 0
        ? "NONE"
        : cookies.map((c) => `${c.name} (len=${c.value.length}, expires=${c.expires})`).join(" | ")
    );
  };

  // 2. Sign in through the real UI
  await page.goto(`${APP}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await dumpCookies("before submit");
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    console.log("[login] landed on /dashboard");
  } catch {
    console.log(`[login] did NOT reach dashboard — still at ${page.url()}`);
    const err = await page.locator("p.text-danger").textContent().catch(() => null);
    if (err) console.log(`[login] on-page error: ${err}`);
  }
  await dumpCookies("after login");

  // 3. The reported repro: refresh
  await page.reload({ waitUntil: "networkidle" });
  console.log(`[reload 1] url: ${page.url()}`);
  await dumpCookies("after reload 1");

  await page.reload({ waitUntil: "networkidle" });
  console.log(`[reload 2] url: ${page.url()}`);
  await dumpCookies("after reload 2");

  // 4. Fresh navigation (new tab) with same cookie jar
  const page2 = await context.newPage();
  await page2.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  console.log(`[new tab] url: ${page2.url()}`);

  // 5. Visiting /login while signed in should bounce to /dashboard
  await page2.goto(`${APP}/login`, { waitUntil: "networkidle" });
  console.log(`[login while authed] url: ${page2.url()}`);

  await browser.close();

  // 5. Cleanup test user
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  console.log("[cleanup] test user deleted");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
