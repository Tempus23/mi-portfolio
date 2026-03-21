import type { APIRoute } from 'astro';
import assetRegistry from '../../../data/asset_registry.json';
import { requireFinanzasAccess } from "@/utils/finanzas-access";

const CACHE_KEY = 'latest_asset_prices_v3'; // Increased version to clear old cache
const CACHE_TTL = 3600; // 1 hour
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 8;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getClientIdentifier(request: Request): string {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  return ip;
}

function hasKv(kv: any): boolean {
  return Boolean(kv && typeof kv.get === 'function' && typeof kv.put === 'function');
}

async function isRateLimited(kv: any, clientId: string): Promise<boolean> {
  if (!hasKv(kv)) return false;
  try {
    const key = `finanzas:prices:ratelimit:${clientId}`;
    const current = await kv.get(key);
    const nextCount = (Number.parseInt(current || '0', 10) || 0) + 1;
    await kv.put(key, String(nextCount), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    return nextCount > RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    // Fail-open so transient KV issues do not block price refresh.
    console.warn('Rate limit KV unavailable, skipping rate limit check:', error);
    return false;
  }
}

async function readCachedPrices(kv: any, forceRefresh: boolean): Promise<Record<string, number> | null> {
  if (forceRefresh || !hasKv(kv)) return null;
  try {
    const cached = await kv.get(CACHE_KEY, { type: 'json' });
    if (!cached || typeof cached !== 'object') return null;
    return cached as Record<string, number>;
  } catch (error) {
    console.warn('Cache read failed, continuing without cache:', error);
    return null;
  }
}

async function writeCachedPrices(kv: any, prices: Record<string, number>): Promise<void> {
  if (!hasKv(kv)) return;
  try {
    await kv.put(CACHE_KEY, JSON.stringify(prices), { expirationTtl: CACHE_TTL });
  } catch (error) {
    console.warn('Cache write failed, returning uncached prices:', error);
  }
}

function collectProvidersFromRegistry() {
  const cgIds = new Set<string>();
  const yahooTickers = new Set<string>();

  for (const info of Object.values(assetRegistry)) {
    if (info.provider === 'coingecko') cgIds.add(info.id);
    else if (info.provider === 'yahoo-finance') yahooTickers.add(info.id);
  }

  return { cgIds: Array.from(cgIds), yahooTickers: Array.from(yahooTickers) };
}

async function fetchYahooPricesMap(tickers: string[]): Promise<Record<string, number>> {
  const pricesArray = await Promise.all(
    tickers.map(async t => ({ ticker: t, price: await fetchYahooPrice(t) }))
  );

  return pricesArray.reduce(
    (acc, { ticker, price }) => {
      if (price !== null) acc[ticker] = price;
      return acc;
    },
    {} as Record<string, number>
  );
}

function buildAssetPriceMap(
  cgPricesMap: Record<string, number>,
  yahooPricesMap: Record<string, number>
): Record<string, number> {
  const prices: Record<string, number> = {};

  for (const [name, info] of Object.entries(assetRegistry)) {
    if (info.provider === 'coingecko' && cgPricesMap[info.id] !== undefined) {
      prices[name] = cgPricesMap[info.id];
      continue;
    }

    if (info.provider === 'yahoo-finance' && yahooPricesMap[info.id] !== undefined) {
      prices[name] = yahooPricesMap[info.id];
    }
  }

  return prices;
}

async function fetchCoinGeckoPrices(ids: string[]) {
  if (ids.length === 0) return {};
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=eur`
    );
    if (!response.ok) return {};

    const raw = await response.json();
    if (!raw || typeof raw !== 'object') return {};

    const data = raw as Record<string, { eur?: unknown }>;
    const prices: Record<string, number> = {};
    for (const id of ids) {
      const eur = data[id]?.eur;
      if (isFiniteNumber(eur)) prices[id] = eur;
    }
    return prices;
  } catch (e) {
    console.error('Error fetching CoinGecko prices:', e);
    return {};
  }
}

async function fetchYahooPrice(ticker: string) {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const chart = data && typeof data === 'object' ? (data as { chart?: unknown }).chart : null;
    const result =
      chart &&
      typeof chart === 'object' &&
      Array.isArray((chart as { result?: unknown }).result) &&
      (chart as { result?: unknown[] }).result
        ? (chart as { result?: unknown[] }).result?.[0]
        : null;

    if (!result || typeof result !== 'object') return null;

    const regularMarketPrice = (result as { meta?: { regularMarketPrice?: unknown } }).meta
      ?.regularMarketPrice;

    return isFiniteNumber(regularMarketPrice) ? regularMarketPrice : null;
  } catch (e) {
    console.error(`Error fetching Yahoo price for ${ticker}:`, e);
    return null;
  }
}

export const GET: APIRoute = async ({ locals, url, request }) => {
  const authError = requireFinanzasAccess(request);
  if (authError) {
    return authError;
  }

  try {
    const kv: any = (locals as any).runtime?.env?.FINANZAS_KV;
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const clientId = getClientIdentifier(request);
    const limited = await isRateLimited(kv, clientId);
    if (limited) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cached = await readCachedPrices(kv, forceRefresh);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { cgIds, yahooTickers } = collectProvidersFromRegistry();
    const [cgPricesMap, yahooPricesMap] = await Promise.all([
      fetchCoinGeckoPrices(cgIds),
      fetchYahooPricesMap(yahooTickers)
    ]);
    const prices = buildAssetPriceMap(cgPricesMap, yahooPricesMap);

    await writeCachedPrices(kv, prices);

    return new Response(JSON.stringify(prices), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in prices API:', error);
    return new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
  }
};
