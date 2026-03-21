# Portfolio de Carlos Hernández Martínez

<div align="center">
  <img src="./public/porfolio.webp" alt="Captura del portfolio">
  <p></p>
</div>

<div align="center">

  ![Astro Badge](https://img.shields.io/badge/Astro-FF3E00?logo=astro&logoColor=fff&style=flat)
  ![Tailwind CSS Badge](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=fff&style=flat)
  ![Cloudflare Pages Badge](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflarepages&logoColor=fff&style=flat)
  ![OpenAI Badge](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=fff&style=flat)

</div>

Portfolio personal desarrollado con Astro y Tailwind, desplegado en Cloudflare Pages. Incluye una app principal para presentar experiencia y proyectos, y una subaplicación de finanzas en `/finanzas/` con persistencia en Cloudflare KV y utilidades de análisis.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Estructura del proyecto

```text
src/
├── components/        # UI del portfolio principal
├── data/              # CV, traducciones y registros estáticos
├── layouts/           # Plantillas Astro
├── pages/             # Páginas y APIs serverless
└── utils/             # i18n, chat local y utilidades compartidas
public/
└── finanzas/          # App standalone de finanzas en Vanilla JS
```
