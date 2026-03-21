import type { APIRoute } from "astro";
import { Resend } from "resend";

const CONTACT_EMAIL = "chermar.pro@gmail.com";
const MAX_MESSAGE_LENGTH = 5000;
const JSON_HEADERS = { "Content-Type": "application/json" };

interface SendEmailPayload {
  emailRemitente: string;
  mensaje: string;
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

function parsePayload(body: unknown): SendEmailPayload | null {
  if (!isObject(body)) {
    return null;
  }

  const emailRemitente =
    typeof body.emailRemitente === "string" ? body.emailRemitente.trim() : "";
  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";

  if (!emailRemitente || !mensaje) {
    return null;
  }

  return { emailRemitente, mensaje };
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const resendApiKey = import.meta.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return jsonResponse({ error: "RESEND_API_KEY not configured." }, 500);
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

    const { emailRemitente, mensaje } = payload;

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
