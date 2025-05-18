import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

import robotsTxt from "astro-robots-txt";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), robotsTxt()],
  site: "https://tempus23.github.io",
  base: "/mi-portfolio",
});
