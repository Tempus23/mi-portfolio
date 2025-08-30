import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import robotsTxt from "astro-robots-txt";

export default defineConfig({
  integrations: [tailwind(), robotsTxt()],
  adapter: cloudflare({
    platformProxy: { enabled: true }, // habilita runtime CF en `astro dev`
  }),
});
