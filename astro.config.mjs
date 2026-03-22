import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import robotsTxt from "astro-robots-txt";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://chermar.dev",
  integrations: [tailwind(), robotsTxt()],
  output: "hybrid",
  vite: {
    worker: {
      format: "es",
    },
    build: {
      assetsInlineLimit: 0, // Ensure workers/wasm are not inlined as base64
    },
    optimizeDeps: {
      exclude: ["@mlc-ai/web-llm"], // Prevent Vite from pre-bundling WebLLM incorrectly
    },
  },
  redirects: {
    "/finanzas/": "/finanzas/index.html",
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
      configPath: "wrangler.jsonc",
      experimentalJsonConfig: true,
    },
  }),
});
