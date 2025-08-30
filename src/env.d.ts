/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
type Runtime = import("@astrojs/cloudflare").Runtime<{
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL?: string; // si usas AI Gateway
}>;
declare namespace App {
  interface Locals extends Runtime {}
}
