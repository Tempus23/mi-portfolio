/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Cloudflare Runtime types
type CloudflareRuntime = {
  env: {
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    RESEND_API_KEY?: string;
    [key: string]: any;
  };
  cf?: any;
  ctx?: {
    waitUntil: (promise: Promise<any>) => void;
  };
};

declare namespace App {
  interface Locals {
    runtime?: CloudflareRuntime;
  }
}
