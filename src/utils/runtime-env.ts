import type { APIContext } from "astro";

export interface RuntimeEnv {
  FINANZAS_KV?: { get(key: string, type: "text"): Promise<string | null>; put(key: string, value: string, options?: Record<string, unknown>): Promise<void> };
  FINANZAS_ALLOWED_EMAILS?: string;
  FINANZAS_ALLOW_ALL_ACCESS?: string;
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  [key: string]: unknown;
}

export function getRuntimeEnv(context: APIContext | { locals: unknown }): RuntimeEnv {
  const locals = context.locals as { runtime?: { env?: RuntimeEnv } };
  const platform = context as { platform?: { env?: RuntimeEnv } };
  return locals?.runtime?.env ?? platform?.platform?.env ?? {};
}
