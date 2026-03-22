import type { APIRoute } from "astro";
import { requireFinanzasAccess } from "@/utils/finanzas-access";
import { getRuntimeEnv } from "@/utils/runtime-env";

export const prerender = false;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface KvNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface SyncPayload {
  snapshots?: JsonValue;
  targets?: JsonValue;
  targetsMeta?: JsonValue;
  expectedLastModified?: string | null;
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

function getKvOrError(context: Parameters<APIRoute>[0]): { kv: KvNamespace | null; error: Response | null } {
  const env = getRuntimeEnv(context);
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isSnapshotAsset(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 8 &&
      isString(value[0]) &&
      isString(value[1]) &&
      isString(value[2]) &&
      isFiniteNumber(value[3]) &&
      isFiniteNumber(value[4]) &&
      isFiniteNumber(value[5]) &&
      isFiniteNumber(value[6]) &&
      isFiniteNumber(value[7]);
  }

  if (!isObject(value)) {
    return false;
  }

  return isString(value.name) &&
    isString(value.term) &&
    isString(value.category) &&
    isFiniteNumber(value.purchasePrice) &&
    isFiniteNumber(value.quantity) &&
    isFiniteNumber(value.currentPrice) &&
    isFiniteNumber(value.purchaseValue) &&
    isFiniteNumber(value.currentValue);
}

function isSnapshotRecord(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  if (!isFiniteNumber(value.id) || !isString(value.date) || !Array.isArray(value.assets)) {
    return false;
  }

  if (!value.assets.every(isSnapshotAsset)) {
    return false;
  }

  if (Object.hasOwn(value, "tag") && value.tag !== undefined && value.tag !== null && !isString(value.tag)) {
    return false;
  }

  if (Object.hasOwn(value, "note") && value.note !== undefined && value.note !== null && !isString(value.note)) {
    return false;
  }

  return true;
}

function isTargetsRecord(value: unknown): boolean {
  if (!isObject(value) || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => {
    if (!isObject(entry) || Array.isArray(entry)) {
      return false;
    }

    if (Object.hasOwn(entry, "target") && entry.target !== undefined && !isFiniteNumber(entry.target)) {
      return false;
    }

    if (Object.hasOwn(entry, "monthly") && entry.monthly !== undefined && !isFiniteNumber(entry.monthly)) {
      return false;
    }

    return true;
  });
}

function isTargetsMetaRecord(value: unknown): boolean {
  if (!isObject(value) || Array.isArray(value)) {
    return false;
  }

  if (Object.hasOwn(value, "monthlyBudget") && value.monthlyBudget !== undefined && !isFiniteNumber(value.monthlyBudget)) {
    return false;
  }

  if (
    Object.hasOwn(value, "adjustmentHardness") &&
    value.adjustmentHardness !== undefined &&
    (!isFiniteNumber(value.adjustmentHardness) || value.adjustmentHardness < 0 || value.adjustmentHardness > 1)
  ) {
    return false;
  }

  if (
    Object.hasOwn(value, "lastObjectiveUpdateAt") &&
    value.lastObjectiveUpdateAt !== undefined &&
    value.lastObjectiveUpdateAt !== null &&
    !isString(value.lastObjectiveUpdateAt)
  ) {
    return false;
  }

  return true;
}

function buildPayload(body: unknown): { payload: SyncPayload; error: string | null } {
  if (!isObject(body)) {
    return {
      payload: {},
      error: "Invalid sync payload",
    };
  }

  const payload: SyncPayload = {};

  if (Object.hasOwn(body, "snapshots")) {
    if (body.snapshots !== null && (!Array.isArray(body.snapshots) || !body.snapshots.every(isSnapshotRecord))) {
      return { payload, error: "Invalid snapshots payload" };
    }
    payload.snapshots = body.snapshots as JsonValue;
  }

  if (Object.hasOwn(body, "targets")) {
    if (body.targets !== null && !isTargetsRecord(body.targets)) {
      return { payload, error: "Invalid targets payload" };
    }
    payload.targets = body.targets as JsonValue;
  }

  if (Object.hasOwn(body, "targetsMeta")) {
    if (body.targetsMeta !== null && !isTargetsMetaRecord(body.targetsMeta)) {
      return { payload, error: "Invalid targets metadata payload" };
    }
    payload.targetsMeta = body.targetsMeta as JsonValue;
  }

  if (Object.hasOwn(body, "expectedLastModified")) {
    if (body.expectedLastModified !== null && !isString(body.expectedLastModified)) {
      return { payload, error: "Invalid sync precondition" };
    }
    payload.expectedLastModified = body.expectedLastModified as string | null;
  }

  return { payload, error: null };
}

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const authError = requireFinanzasAccess(context.request, env);
  if (authError) {
    return authError;
  }

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
  const env = getRuntimeEnv(context);
  const authError = requireFinanzasAccess(context.request, env);
  if (authError) {
    return authError;
  }

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

  const { payload, error: payloadError } = buildPayload(body);
  if (payloadError) {
    return jsonResponse({ error: payloadError }, 400);
  }

  const { snapshots, targets, targetsMeta, expectedLastModified } = payload;

  try {
    const currentLastModified = await kv.get(KV_KEYS.lastModified, "text");
    const hasDataChanges = snapshots !== undefined || targets !== undefined || targetsMeta !== undefined;

    if (!hasDataChanges) {
      return jsonResponse({
        ok: true,
        skipped: true,
        lastModified: currentLastModified ?? null,
      });
    }

    if ((currentLastModified ?? null) !== (expectedLastModified ?? null)) {
      return jsonResponse({
        error: "Conflicto de sincronización. Hay cambios remotos más recientes.",
        lastModified: currentLastModified ?? null,
      }, 409);
    }

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
