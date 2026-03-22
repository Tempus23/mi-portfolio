import type { APIRoute } from "astro";
import { Resend } from "resend";

const CONTACT_EMAIL = "chermar.pro@gmail.com";
const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_RATE_LIMIT_WINDOW_SECONDS = 300;
const EMAIL_RATE_LIMIT_MAX_REQUESTS = 5;
const JSON_HEADERS = { "Content-Type": "application/json" };

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

interface RuntimeEnv {
  CONTACT_RATE_LIMIT_KV?: KvNamespace;
}

interface SendEmailPayload {
  emailRemitente: string;
  mensaje: string;
  website: string;
}

function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function getClientIdentifier(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function hasKv(kv: unknown): kv is KvNamespace {
  return Boolean(
    kv &&
      typeof kv === "object" &&
      typeof (kv as KvNamespace).get === "function" &&
      typeof (kv as KvNamespace).put === "function",
  );
}

function getRuntimeEnv(locals: unknown): RuntimeEnv {
  const runtime = (locals as { runtime?: { env?: RuntimeEnv } })?.runtime;
  return runtime?.env ?? {};
}

function getMemoryRateLimitStore(): Map<
  string,
  { count: number; expiresAt: number }
> {
  const scopedGlobal = globalThis as typeof globalThis & {
    __contactRateLimitStore?: Map<string, { count: number; expiresAt: number }>;
  };

  if (!scopedGlobal.__contactRateLimitStore) {
    scopedGlobal.__contactRateLimitStore = new Map();
  }

  return scopedGlobal.__contactRateLimitStore;
}

async function isRateLimited(kv: unknown, clientId: string): Promise<boolean> {
  const key = `contact:email:ratelimit:${clientId}`;

  if (hasKv(kv)) {
    try {
      const current = await kv.get(key);
      const nextCount = (Number.parseInt(current || "0", 10) || 0) + 1;
      await kv.put(key, String(nextCount), {
        expirationTtl: EMAIL_RATE_LIMIT_WINDOW_SECONDS,
      });
      return nextCount > EMAIL_RATE_LIMIT_MAX_REQUESTS;
    } catch (error) {
      console.warn(
        "Email rate limit KV unavailable, falling back to memory:",
        error,
      );
    }
  }

  const now = Date.now();
  const store = getMemoryRateLimitStore();
  const current = store.get(key);

  if (!current || current.expiresAt <= now) {
    store.set(key, {
      count: 1,
      expiresAt: now + EMAIL_RATE_LIMIT_WINDOW_SECONDS * 1000,
    });
    return false;
  }

  current.count += 1;
  store.set(key, current);
  return current.count > EMAIL_RATE_LIMIT_MAX_REQUESTS;
}

function parsePayload(body: unknown): SendEmailPayload | null {
  if (!isObject(body)) {
    return null;
  }

  const emailRemitente =
    typeof body.emailRemitente === "string" ? body.emailRemitente.trim() : "";
  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
  const website = typeof body.website === "string" ? body.website.trim() : "";

  if (!emailRemitente || !mensaje) {
    return null;
  }

  return { emailRemitente, mensaje, website };
}

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const resendApiKey = import.meta.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return jsonResponse({ error: "RESEND_API_KEY not configured." }, 500);
    }

    const clientId = getClientIdentifier(request);
    const kv = getRuntimeEnv(locals).CONTACT_RATE_LIMIT_KV;
    if (await isRateLimited(kv, clientId)) {
      return jsonResponse(
        {
          error:
            "Has superado el límite temporal de envíos. Inténtalo de nuevo en unos minutos.",
        },
        429,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const payload = parsePayload(body);
    if (!payload) {
      return jsonResponse(
        { error: "Sender email and message are required." },
        400,
      );
    }

    const { emailRemitente, mensaje, website } = payload;

    if (website) {
      return jsonResponse({ error: "Invalid request." }, 400);
    }

    if (!isValidEmail(emailRemitente)) {
      return jsonResponse({ error: "Sender email is invalid." }, 400);
    }

    if (mensaje.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse(
        { error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` },
        400,
      );
    }

    const resend = new Resend(resendApiKey);
    const fromEmail =
      import.meta.env.RESEND_FROM_EMAIL ||
      "Portfolio Contact <onboarding@resend.dev>";

    await resend.emails.send({
      from: fromEmail,
      to: CONTACT_EMAIL,
      replyTo: emailRemitente,
      subject: `Mensaje de contacto desde el portfolio: ${sanitizeLine(emailRemitente)}`,
      text: [
        `Remitente: ${emailRemitente}`,
        "",
        "Mensaje:",
        mensaje,
      ].join("\n"),
    });

    return jsonResponse({
      success: true,
      message: "Email sent successfully.",
    });
  } catch (error: any) {
    console.error("Error in /api/send-email:", error);
    return jsonResponse(
      {
        error: "Internal Server Error.",
      },
      500,
    );
  }
};
