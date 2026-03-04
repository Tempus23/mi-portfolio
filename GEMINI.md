# GEMINI.md - mi-portfolio

## Project Overview
This project is a personal portfolio website built using **Astro**, **Tailwind CSS**, and **TypeScript**. It serves as a professional showcase and includes advanced features such as a finance tracker and AI-driven insights.

The project is designed to be deployed on **Cloudflare Pages**, utilizing **Cloudflare KV** for data persistence and **OpenAI** for AI capabilities. It also features a multi-language support system (English and Spanish).

### Main Technologies
- **Framework:** [Astro](https://astro.build/) (v4.4.5)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Backend/Platform:** [Cloudflare Pages](https://pages.cloudflare.com/) with [Cloudflare KV](https://developers.cloudflare.com/kv/)
- **AI Integration:** [OpenAI SDK](https://www.npmjs.com/package/openai)
- **Email Service:** [Resend](https://resend.com/)
- **Language:** TypeScript

---

## Building and Running

### Development
To start the local development server:
```bash
npm run dev
```

### Production Build
To check for Astro errors and build the project for production:
```bash
npm run build
```

### Preview
To preview the production build locally:
```bash
npm run preview
```

---

## Architecture & Structure

### Core Directories
- `src/components/`: Reusable Astro components organized into `icons`, `layout`, `sections`, and `ui`.
- `src/pages/`: Application routes, including dynamic API endpoints under `src/pages/api/`.
- `src/data/`: Static data sources (`cv_data.json`, `translations.json`).
- `src/utils/`: Utility functions for i18n and data handling.
- `public/finanzas/`: A standalone sub-project for finance tracking, integrated via redirects.

### Key Features
- **Internationalization (i18n):** Managed through `src/utils/i18n.ts` and `src/data/translations.json`. Supports `en` and `es`.
- **API Layer:**
    - `src/pages/api/chat.ts`: General AI chat functionality.
    - `src/pages/api/finanzas/sync.ts`: Synchronizes finance tracker data with Cloudflare KV.
    - `src/pages/api/send-email.ts`: Handles contact form submissions via Resend.
- **Finance Tracker:** A hybrid part of the site that uses Cloudflare KV to store snapshots and targets.

---

## Development Conventions

### Styling
- Use **Tailwind CSS** classes directly in Astro components.
- Adhere to the design system defined in `tailwind.config.mjs`.

### Data Management
- Professional data (experience, projects, etc.) should be updated in `src/data/cv_data.json` (English) and `src/data/cv_data_es.json` (Spanish).

### Components
- Follow the existing organization:
    - **icons/**: SVG icons as Astro components.
    - **sections/**: Large blocks of the main page (e.g., `Hero.astro`, `Experience.astro`).
    - **ui/**: Atomic components (e.g., `Badge.astro`, `Card.astro`).

### Deployment
- The project is configured for Cloudflare Pages using the `@astrojs/cloudflare` adapter.
- Environment variables (like `OPENAI_API_KEY`, `RESEND_API_KEY`) should be configured in the Cloudflare Pages dashboard.
