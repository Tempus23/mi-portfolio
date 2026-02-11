import type { APIRoute } from "astro";

export const prerender = false;

// Security is handled by Cloudflare Access — no PIN needed

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// GET - Download data from KV
export const GET: APIRoute = async (context) => {
  const runtime = (context.locals as any)?.runtime;
  const env = runtime?.env ?? (context as any)?.platform?.env;

  console.log("[KV Sync] GET", {
    hasKV: Boolean(env?.FINANZAS_KV),
  });

  if (!env?.FINANZAS_KV) {
    return jsonResponse({ error: "KV not configured" }, 500);
  }

  try {
    const snapshots = await env.FINANZAS_KV.get("snapshots", "text");
    const targets = await env.FINANZAS_KV.get("targets", "text");
    const targetsMeta = await env.FINANZAS_KV.get("targets_meta", "text");
    const lastModified = await env.FINANZAS_KV.get("last_modified", "text");

    return jsonResponse({
      snapshots: snapshots ? JSON.parse(snapshots) : null,
      targets: targets ? JSON.parse(targets) : null,
      targetsMeta: targetsMeta ? JSON.parse(targetsMeta) : null,
      lastModified: lastModified || null,
    });
  } catch (e) {
    return jsonResponse({ error: "Failed to read data" }, 500);
  }
};

// PUT - Upload data to KV
export const PUT: APIRoute = async (context) => {
  const runtime = (context.locals as any)?.runtime;
  const env = runtime?.env ?? (context as any)?.platform?.env;

  console.log("[KV Sync] PUT", {
    hasKV: Boolean(env?.FINANZAS_KV),
  });

  if (!env?.FINANZAS_KV) {
    return jsonResponse({ error: "KV not configured" }, 500);
  }

  try {
    const body = await context.request.json();
    const { snapshots, targets, targetsMeta } = body as any;

    if (snapshots !== undefined) {
      await env.FINANZAS_KV.put("snapshots", JSON.stringify(snapshots));
    }
    if (targets !== undefined) {
      await env.FINANZAS_KV.put("targets", JSON.stringify(targets));
    }
    if (targetsMeta !== undefined) {
      await env.FINANZAS_KV.put("targets_meta", JSON.stringify(targetsMeta));
    }

    const now = new Date().toISOString();
    await env.FINANZAS_KV.put("last_modified", now);

    return jsonResponse({ ok: true, lastModified: now });
  } catch (e) {
    return jsonResponse({ error: "Failed to save data" }, 500);
  }
};
