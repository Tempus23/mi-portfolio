# CLAUDE.md - mi-portfolio

Comprehensive guide for AI assistants working in this codebase.

## Project Overview

Personal portfolio website for a software engineer, built with **Astro**, **Tailwind CSS**, and **TypeScript**. Deployed on **Cloudflare Pages** with hybrid SSR/static output.

Two embedded sub-features:
- **Local AI chat widget** ("Carlos IA") — client-side inference via Transformers.js
- **Finance tracker** (`/finanzas/`) — portfolio management with Cloudflare KV persistence

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Astro 4.4.5 (hybrid output) |
| Styling | Tailwind CSS 3.4.1 |
| Language | TypeScript (strict mode) |
| Platform | Cloudflare Pages + KV |
| Local AI | `@huggingface/transformers` (Transformers.js) |
| Server AI | OpenAI SDK |
| Email | Resend |
| Font | Onest (variable, `@fontsource-variable/onest`) |

---

## Development Commands

```bash
npm run dev        # Start local dev server (http://localhost:4321)
npm run build      # astro check + production build (runs type checking)
npm run preview    # Preview production build locally
```

`npm run build` runs `astro check` first, which validates TypeScript and Astro templates. **Always run this before committing** — there is no separate test suite.

---

## Directory Structure

```
src/
├── components/
│   ├── icons/          # SVG icons as single .astro components
│   ├── layout/         # Header.astro, Footer.astro (page-level structure)
│   ├── sections/       # Full-width page sections (Hero, Experience, Skills, etc.)
│   └── ui/             # Atomic reusable components (Badge, Card, Button, etc.)
├── data/
│   ├── cv_data.json         # English CV/professional data
│   ├── cv_data_es.json      # Spanish CV/professional data (keep in sync with EN)
│   ├── translations.json    # UI strings for both languages
│   └── asset_registry.json  # Finance tracker asset definitions
├── layouts/
│   └── Layout.astro    # Root HTML wrapper used by all pages
├── pages/
│   ├── index.astro     # Main portfolio page (composes all sections)
│   ├── components.astro # Component showcase/testing page
│   └── api/
│       ├── send-email.ts        # POST: contact form via Resend
│       ├── chat.ts              # POST: general AI chat (OpenAI)
│       └── finanzas/
│           ├── chat.ts          # Finance-specific AI chat
│           ├── analyze.ts       # Portfolio analysis
│           ├── prices.ts        # Asset price fetching with KV cache
│           └── sync.ts          # KV data synchronization
├── scripts/
│   └── initLanguage.ts  # Language initialization on page load
└── utils/
    ├── i18n.ts              # Returns CV data for current language
    ├── languageStore.ts     # Language state (en/es)
    └── local-chat/
        ├── ai-logic.ts      # Local inference logic
        ├── constants.ts     # Model names (mobile vs desktop)
        ├── dom-utils.ts     # DOM manipulation helpers
        └── types.ts         # TypeScript types (ChatMessage, ActionCard, etc.)

public/
├── finanzas/           # Finance tracker static files (standalone sub-project)
└── projects/           # Project showcase images

.github/workflows/
└── deploy.yml          # Cloudflare Pages deployment via Wrangler
```

---

## Architecture Patterns

### Astro Component Structure

Every `.astro` file follows this three-part structure:

```astro
---
// Frontmatter: imports, TypeScript logic, props interface
import SomeIcon from "@/components/icons/SomeIcon.astro";
import data from "@/data/cv_data.json";

interface Props {
  title: string;
  variant?: "primary" | "secondary";
}
const { title, variant = "primary" } = Astro.props;
---

<!-- Template: HTML with Astro expressions -->
<section>
  <h2>{title}</h2>
</section>

<script>
  // Client-side JavaScript (runs in browser, scoped to this component)
  document.addEventListener("astro:page-load", () => { /* ... */ });
</script>

<style>
  /* Scoped CSS (applies only to this component) */
</style>
```

### Path Alias

Always use `@/` for imports from `src/`:

```typescript
// Good
import { getTranslation } from "@/utils/i18n";
import cvData from "@/data/cv_data.json";

// Avoid
import { getTranslation } from "../../utils/i18n";
```

### Data Flow

1. Static data lives in `src/data/*.json`
2. Imported in component frontmatter
3. Rendered in the template via `{expression}` or `.map()`

### Client Interactivity

- **Vanilla TypeScript** in `<script>` tags for simple interactions (typewriter, scroll effects)
- Listen for `astro:page-load` instead of `DOMContentLoaded` for Astro compatibility
- Use Astro `client:*` directives for framework component islands (none currently)

### API Endpoints

API routes export named HTTP method handlers:

```typescript
// src/pages/api/example.ts
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env; // Cloudflare bindings (KV, secrets)
  const body = await request.json();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

Access Cloudflare KV and environment variables via `locals.runtime.env`.

---

## Component Conventions

### Props Interface

Always define `interface Props` in the frontmatter for typed props:

```astro
---
interface Props {
  label: string;
  href?: string;
  class?: string;
}
const { label, href, class: className } = Astro.props;
---
```

### Conditional Classes

Use `class:list` for conditional/dynamic classes:

```astro
<div class:list={[
  "base-class",
  { "active": isActive },
  className
]}>
```

### Component Placement

- **New icon?** → `src/components/icons/MyIcon.astro`
- **New page section?** → `src/components/sections/MySection.astro`, then import in `src/pages/index.astro`
- **New reusable UI element?** → `src/components/ui/MyComponent.astro`

---

## Styling Conventions

### Approach

Tailwind utility classes are the primary styling mechanism. Add scoped `<style>` only for things Tailwind cannot express (e.g., `animation-timeline: scroll()`).

### Design Tokens (`tailwind.config.mjs`)

```javascript
colors: {
  primary: '#6366F1',    // Indigo 500
  secondary: '#8B5CF6',  // Violet 500
  dark: '#1A202C',
  light: '#F7FAFC',
}
```

### Dark Mode

Dark mode is toggled via the `.dark` class on `<html>`. Use `dark:` prefix variants:

```html
<div class="bg-white dark:bg-gray-900 text-black dark:text-white">
```

### Layout Patterns

- Sections use `<SectionContainer>` wrapper for consistent padding
- Responsive with `sm:`, `md:` breakpoints
- Grid and Flexbox (`grid`, `flex`) for component layouts
- Glass-morphism: `backdrop-blur-md`, `bg-white/10`

---

## Internationalization (i18n)

The site supports **English** and **Spanish**.

### Files

| File | Purpose |
|---|---|
| `src/data/cv_data.json` | EN professional data (experience, projects, skills) |
| `src/data/cv_data_es.json` | ES professional data (keep in sync with EN) |
| `src/data/translations.json` | UI strings: `{ "en": {...}, "es": {...} }` |
| `src/utils/i18n.ts` | Helper that returns data for current language |
| `src/utils/languageStore.ts` | Language state management |
| `src/scripts/initLanguage.ts` | Reads browser language on page load |

### Rules

- **Always update both** `cv_data.json` AND `cv_data_es.json` when adding/changing content
- **Always update both** language keys in `translations.json` for new UI strings
- Use the `i18n.ts` utility to get language-aware data; do not import JSON files directly in components

---

## Data Management

Professional/CV data is in `src/data/`:

- `cv_data.json` — experience, projects, skills, education (English)
- `cv_data_es.json` — same structure in Spanish
- `asset_registry.json` — finance tracker asset definitions (ticker, name, type)

When modifying professional data, update both language files.

---

## Environment Variables

Set in Cloudflare Pages dashboard (production) or `.env` file (local development):

| Variable | Used By |
|---|---|
| `OPENAI_API_KEY` | `src/pages/api/chat.ts` |
| `RESEND_API_KEY` | `src/pages/api/send-email.ts` |
| `FINANZAS_KV` | KV binding (configured in `wrangler.jsonc`, not `.env`) |

`.env` is gitignored. Never commit secrets.

---

## Cloudflare-Specific Notes

- **KV binding**: `FINANZAS_KV` defined in `wrangler.jsonc`; accessed in API routes via `locals.runtime.env.FINANZAS_KV`
- **Local KV simulation**: `platformProxy: { enabled: true }` in `astro.config.mjs` enables local KV via Wrangler
- **WebLLM exclusion**: `vite.ssr.external` in `astro.config.mjs` excludes `@mlc-ai/web-llm` from SSR bundling (legacy, Transformers.js is now used)
- **Asset inlining disabled**: Required for WASM/Workers compatibility
- **Redirects**: `/finanzas/` → `/finanzas/index.html` configured in `astro.config.mjs`

---

## Local AI Chat

The "Carlos IA" chat widget is fully client-side:

- **Component**: `src/components/ui/LocalChat.astro`
- **Engine**: `@huggingface/transformers` (Transformers.js, runs in browser)
- **Models** (defined in `src/utils/local-chat/constants.ts`):
  - Mobile: `Qwen2.5-0.5B` (smaller, faster)
  - Desktop: larger Qwen variant
- **Logic**: `src/utils/local-chat/ai-logic.ts`
- **Types**: `src/utils/local-chat/types.ts` — `ChatMessage`, `ActionCard`, `IntentResult`

No server requests are made for local chat; all inference runs in the user's browser via WebWorkers.

---

## Deployment

- **CI/CD**: `.github/workflows/deploy.yml` triggers on push to `master`
- **Platform**: Cloudflare Pages
- **Build output**: `./dist`
- **Adapter**: `@astrojs/cloudflare` (configured in `astro.config.mjs`)
- **Wrangler config**: `wrangler.jsonc` — KV namespace ID and compatibility date

---

## Git Conventions

Conventional commit format:

```
type: short description
```

Types used in this repo:

| Type | When |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring without behavior change |
| `perf:` | Performance improvement |
| `docs:` | Documentation changes |

---

## No Test Suite

There are no automated tests. Quality is enforced by:

1. **TypeScript strict mode** — catches type errors at compile time
2. **`astro check`** — validates Astro templates and types (runs as part of `npm run build`)

Always run `npm run build` before committing to catch issues early.
