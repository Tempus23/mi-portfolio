import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import robotsTxt from "astro-robots-txt";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "hybrid",
  adapter: cloudflare({
    mode: "directory",
  }),
  integrations: [tailwind(), robotsTxt()],
  // QUITA base y site para Pages en raíz
  // hybrid mode enables API routes on Cloudflare Pages
});
