import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import robotsTxt from "astro-robots-txt";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  integrations: [tailwind(), robotsTxt()],
  output: "hybrid",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
