import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import robotsTxt from "astro-robots-txt";

export default defineConfig({
  integrations: [tailwind(), robotsTxt()],
  // QUITA base y site para Pages en raíz
  // output por defecto ya es "static" en tu build
});
