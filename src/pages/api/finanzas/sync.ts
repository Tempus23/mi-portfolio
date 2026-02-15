import type { APIRoute } from "astro";

export const prerender = false;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface KvNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface RuntimeEnv {
  FINANZAS_KV?: KvNamespace;
}

interface SyncPayload {
  snapshots?: JsonValue;
  targets?: JsonValue;
  targetsMeta?: JsonValue;
}

const KV_KEYS = {
  snapshots: "snapshots",
  targets: "targets",
  targetsMeta: "targets_meta",
  lastModified: "last_modified",
} as const;

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function getEnv(context: Parameters<APIRoute>[0]): RuntimeEnv {
  const localRuntime = (context.locals as { runtime?: { env?: RuntimeEnv } }).runtime;
  const platform = context as { platform?: { env?: RuntimeEnv } };
  return localRuntime?.env ?? platform.platform?.env ?? {};
}

function getKvOrError(context: Parameters<APIRoute>[0]): { kv: KvNamespace | null; error: Response | null } {
  const env = getEnv(context);
  const kv = env.FINANZAS_KV ?? null;

  if (!kv) {
    return { kv: null, error: jsonResponse({ error: "KV not configured" }, 500) };
  }

  return { kv, error: null };
}

function parseJsonOrNull<T extends JsonValue>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildPayload(body: unknown): SyncPayload {
  if (!isObject(body)) {
    return {};
  }

  const payload: SyncPayload = {};
  if ("snapshots" in body) payload.snapshots = body.snapshots as JsonValue;
  if ("targets" in body) payload.targets = body.targets as JsonValue;
  if ("targetsMeta" in body) payload.targetsMeta = body.targetsMeta as JsonValue;
  return payload;
}

export const GET: APIRoute = async (context) => {
  const { kv, error } = getKvOrError(context);
  if (error || !kv) {
    return error as Response;
  }

  try {
    const [snapshotsRaw, targetsRaw, targetsMetaRaw, lastModified] = await Promise.all([
      kv.get(KV_KEYS.snapshots, "text"),
      kv.get(KV_KEYS.targets, "text"),
      kv.get(KV_KEYS.targetsMeta, "text"),
      kv.get(KV_KEYS.lastModified, "text"),
    ]);

    return jsonResponse({
      snapshots: parseJsonOrNull(snapshotsRaw),
      targets: parseJsonOrNull(targetsRaw),
      targetsMeta: parseJsonOrNull(targetsMetaRaw),
      lastModified: lastModified ?? null,
    });
  } catch {
    return jsonResponse({ error: "Failed to read data" }, 500);
  }
};

export const PUT: APIRoute = async (context) => {
  const { kv, error } = getKvOrError(context);
  if (error || !kv) {
    return error as Response;
  }

  let body: unknown;

  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { snapshots, targets, targetsMeta } = buildPayload(body);

  try {
    const writes: Promise<void>[] = [];

    if (snapshots !== undefined) {
      writes.push(kv.put(KV_KEYS.snapshots, JSON.stringify(snapshots)));
    }
    if (targets !== undefined) {
      writes.push(kv.put(KV_KEYS.targets, JSON.stringify(targets)));
    }
    if (targetsMeta !== undefined) {
      writes.push(kv.put(KV_KEYS.targetsMeta, JSON.stringify(targetsMeta)));
    }

    const now = new Date().toISOString();
    writes.push(kv.put(KV_KEYS.lastModified, now));

    await Promise.all(writes);

    return jsonResponse({ ok: true, lastModified: now });
  } catch {
    return jsonResponse({ error: "Failed to save data" }, 500);
  }
};
