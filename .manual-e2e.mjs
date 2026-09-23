import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  process.env[match[1]] = value;
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const id = crypto.randomUUID();
const email = `playwright-lock-${Date.now()}@example.invalid`;
let browser;
try {
  const { error: insertError } = await admin
    .from("internal_users")
    .insert({
      id,
      email,
      full_name: "Playwright Lockout Test",
      is_active: true,
      is_locked: false,
      must_change_password: false,
    });
  if (insertError) throw insertError;
  console.log("Test fixture created.");

  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:3000/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("DefinitelyWrong!123");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByRole("button", { name: "Sign in" }).click();
    await page
      .getByText("Incorrect email or password", { exact: true })
      .last()
      .waitFor({ timeout: 15000 });
    if (attempt < 5) await page.waitForTimeout(150);
  }
  const { data: locked, error: lockReadError } = await admin
    .from("internal_users")
    .select("is_locked")
    .eq("id", id)
    .single();
  if (lockReadError || locked?.is_locked !== true)
    throw new Error(`Expected lock after 5 failed attempts; got ${JSON.stringify(locked)}`);
  console.log("PASS: five failed password attempts lock the account.");

  await fs.promises.rm(".manual-e2e-otp", { force: true });
  await page.getByLabel("Email", { exact: true }).fill("jayyliteral@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill("Phase2Test!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  const otpInput = page.getByLabel("Six-digit email verification code");
  await otpInput.waitFor({ timeout: 20000 });
  const otpGroup = page
    .locator("form div.w-full.justify-center")
    .filter({ has: page.locator("div.h-9.w-9") })
    .last();
  const [groupBox, formBox] = await Promise.all([
    otpGroup.boundingBox(),
    page.locator("form").boundingBox(),
  ]);
  if (
    !groupBox ||
    !formBox ||
    Math.abs(groupBox.x + groupBox.width / 2 - (formBox.x + formBox.width / 2)) > 3
  ) {
    throw new Error(`OTP input is not centered: ${JSON.stringify({ groupBox, formBox })}`);
  }
  const otpDeadline = Date.now() + 10000;
  while (!fs.existsSync(".manual-e2e-otp") && Date.now() < otpDeadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  if (!fs.existsSync(".manual-e2e-otp"))
    throw new Error("Mock email provider did not capture an OTP.");
  const otp = fs.readFileSync(".manual-e2e-otp", "utf8").trim();
  await otpInput.fill(otp);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL("**/admin", { timeout: 20000 });
  if (pageErrors.length) throw new Error(`Browser runtime errors: ${pageErrors.join("; ")}`);
  console.log("PASS: OTP sends, is centered, verifies, and reaches the admin landing page.");
} finally {
  if (browser) await browser.close();
  await admin.from("login_events").delete().eq("email", email).eq("event_type", "LOGIN_FAILED");
  await admin
    .from("audit_logs")
    .delete()
    .eq("entity_id", id)
    .eq("action", "ACCOUNT_LOCKED_FAILED_LOGIN");
  await admin.from("internal_users").delete().eq("id", id);
  await fs.promises.rm(".manual-e2e-otp", { force: true });
}
