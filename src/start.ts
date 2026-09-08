import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const performanceMiddleware = createMiddleware().server(async ({ next }) => {
  if (process.env["PERFORMANCE_LOGGING"] !== "true") return next();
  const startedAt = performance.now();
  const response = await next();
  const request = getRequest();
  console.info(
    `[performance] ${request?.method ?? "REQUEST"} ${request?.url ?? "unknown"} ${Math.round(
      performance.now() - startedAt,
    )}ms`,
  );
  return response;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [performanceMiddleware, errorMiddleware, csrfMiddleware],
}));
