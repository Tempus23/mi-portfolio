const JSON_HEADERS = { "Content-Type": "application/json" };
const ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

function jsonResponse(data: object, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function normalizeEmailList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function getAccessEmail(request: Request): string | null {
  const value = request.headers.get(ACCESS_EMAIL_HEADER);
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase() || null;
}

function hasAccessAssertion(request: Request): boolean {
  const jwt = request.headers.get(ACCESS_JWT_HEADER);
  return Boolean(jwt && jwt.trim());
}

export function requireFinanzasAccess(
  request: Request,
  env?: { FINANZAS_ALLOWED_EMAILS?: string; FINANZAS_ALLOW_ALL_ACCESS?: string }
): Response | null {
  if (isLocalRequest(request)) {
    return null;
  }

  const accessEmail = getAccessEmail(request);
  const hasAccessIdentity = hasAccessAssertion(request);
  if (!hasAccessIdentity) {
    return jsonResponse(
      {
        error:
          "Acceso restringido. Inicia sesión mediante Cloudflare Access para usar finanzas.",
      },
      401,
    );
  }

  const allowedEmailsRaw = env?.FINANZAS_ALLOWED_EMAILS;
  const allowedEmails = normalizeEmailList(allowedEmailsRaw);
  if (allowedEmails.length === 0) {
    const allowAllAccessUsers = env?.FINANZAS_ALLOW_ALL_ACCESS === "true";
    if (allowAllAccessUsers) {
      return null;
    }

    return jsonResponse(
      {
        error:
          "Configuración inválida: define FINANZAS_ALLOWED_EMAILS o habilita FINANZAS_ALLOW_ALL_ACCESS.",
      },
      500,
    );
  }

  if (!accessEmail) {
    return jsonResponse(
      { error: "No se pudo validar la identidad autenticada de Cloudflare Access." },
      403,
    );
  }

  if (!allowedEmails.includes(accessEmail)) {
    return jsonResponse(
      { error: "Tu usuario no tiene permisos para acceder a finanzas." },
      403,
    );
  }

  return null;
}
