/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly FINANZAS_ALLOWED_EMAILS?: string;
  readonly FINANZAS_ALLOW_ALL_ACCESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
