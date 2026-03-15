import type { APIRoute } from 'astro';
import assetRegistry from '../../../data/asset_registry.json';

const CACHE_KEY = 'latest_asset_prices_v3'; // Increased version to clear old cache
const CACHE_TTL = 3600; // 1 hour

async function fetchCoinGeckoPrices(ids: string[]) {
  if (ids.length === 0) return {};
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=eur`
  );
  if (!response.ok) return {};
  const data = await response.json();
  const prices: Record<string, number> = {};
  for (const id of ids) {
    if (data[id]) prices[id] = data[id].eur;
  }
  return prices;
}

async function fetchYahooPrice(ticker: string) {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.chart?.result?.[0];
    return result?.meta?.regularMarketPrice || null;
  } catch (e) {
    console.error(`Error fetching Yahoo price for ${ticker}:`, e);
    return null;
  }
}

export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const runtime = locals.runtime;
    const kv = runtime.env.FINANZAS_KV;
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!forceRefresh) {
      const cached = await kv.get(CACHE_KEY, { type: 'json' });
      if (cached) return new Response(JSON.stringify(cached), { status: 200 });
    }

    const prices: Record<string, number> = {};
    const cgIds = new Set<string>();
    const yahooTickers = new Set<string>();

    for (const info of Object.values(assetRegistry)) {
      if (info.provider === 'coingecko') cgIds.add(info.id);
      if (info.provider === 'yahoo-finance') yahooTickers.add(info.id);
    }

    // Fetch CoinGecko prices
    const cgPricesMap = await fetchCoinGeckoPrices(Array.from(cgIds));
    
    // Fetch Yahoo Finance prices (in parallel)
    const yahooPricesArray = await Promise.all(
      Array.from(yahooTickers).map(async t => ({ ticker: t, price: await fetchYahooPrice(t) }))
    );
    const yahooPricesMap = yahooPricesArray.reduce((acc, { ticker, price }) => {
      if (price !== null) acc[ticker] = price;
      return acc;
    }, {} as Record<string, number>);

    for (const [name, info] of Object.entries(assetRegistry)) {
      if (info.provider === 'coingecko' && cgPricesMap[info.id]) {
        prices[name] = cgPricesMap[info.id];
      } else if (info.provider === 'yahoo-finance' && yahooPricesMap[info.id]) {
        prices[name] = yahooPricesMap[info.id];
      }
    }

    await kv.put(CACHE_KEY, JSON.stringify(prices), { expirationTtl: CACHE_TTL });

    return new Response(JSON.stringify(prices), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in prices API:', error);
    return new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
  }
};
