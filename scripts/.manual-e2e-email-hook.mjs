const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  if (String(input).startsWith("https://api.brevo.com/v3/smtp/email")) {
    const body = JSON.parse(String(init.body ?? "{}"));
    const otp = String(body.textContent ?? "").match(/code is: (\d{6})/)?.[1];
    if (otp) await import("node:fs/promises").then(({ writeFile }) => writeFile(".manual-e2e-otp", otp));
    return new Response(JSON.stringify({ messageId: "manual-e2e-mocked-email" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }
  return originalFetch(input, init);
};
