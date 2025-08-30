// astro.config.mjs
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server", // <-- necesario para usar el adapter en Pages/Workers
  adapter: cloudflare({
    // Opcional: runtime de Cloudflare en `astro dev`
    platformProxy: { enabled: true },
  }),
});
