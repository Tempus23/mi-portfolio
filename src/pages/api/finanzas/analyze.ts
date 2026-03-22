// src/pages/api/finanzas/analyze.ts — AI-powered portfolio analysis endpoint
import type { APIRoute } from "astro";
import OpenAI from "openai";
import { requireFinanzasAccess } from "@/utils/finanzas-access";

export const prerender = false;

interface PortfolioSummary {
    date: string;
    totalValue: number;
    totalInvested: number;
    totalRoi: number;
    assetCount: number;
    categoryCount: number;
    monthlyBudget: number;
    categories: CategorySummary[];
    history: { date: string; value: number; invested: number }[];
    analytics?: AnalyticsSummary;
}

interface CategorySummary {
    category: string;
    value: number;
    invested: number;
    roi: number;
    weight: number;
    target: number | null;
    assets: { name: string; term: string; value: number; invested: number; roi: number; weight: number }[];
}

interface AnalyticsSummary {
    healthScore: number;
    sharpe: number | null;
    sortino: number | null;
    annualizedVol: number;
    maxDrawdown: number;
    cagr: number | null;
    hhi: number;
    diversificationRatio: number | null;
    avgTargetDeviation: number | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
    return value === null || isFiniteNumber(value);
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isAssetSummary(value: unknown): value is CategorySummary["assets"][number] {
    return isObject(value) &&
        isString(value.name) &&
        isString(value.term) &&
        isFiniteNumber(value.value) &&
        isFiniteNumber(value.invested) &&
        isFiniteNumber(value.roi) &&
        isFiniteNumber(value.weight);
}

function isCategorySummary(value: unknown): value is CategorySummary {
    return isObject(value) &&
        isString(value.category) &&
        isFiniteNumber(value.value) &&
        isFiniteNumber(value.invested) &&
        isFiniteNumber(value.roi) &&
        isFiniteNumber(value.weight) &&
        (value.target === null || isFiniteNumber(value.target)) &&
        Array.isArray(value.assets) &&
        value.assets.every(isAssetSummary);
}

function isHistoryEntry(value: unknown): value is PortfolioSummary["history"][number] {
    return isObject(value) &&
        isString(value.date) &&
        isFiniteNumber(value.value) &&
        isFiniteNumber(value.invested);
}

function isAnalyticsSummary(value: unknown): value is AnalyticsSummary {
    return isObject(value) &&
        isFiniteNumber(value.healthScore) &&
        isNullableFiniteNumber(value.sharpe) &&
        isNullableFiniteNumber(value.sortino) &&
        isFiniteNumber(value.annualizedVol) &&
        isFiniteNumber(value.maxDrawdown) &&
        isNullableFiniteNumber(value.cagr) &&
        isFiniteNumber(value.hhi) &&
        isNullableFiniteNumber(value.diversificationRatio) &&
        isNullableFiniteNumber(value.avgTargetDeviation);
}

function isPortfolioSummary(value: unknown): value is PortfolioSummary {
    return isObject(value) &&
        isString(value.date) &&
        isFiniteNumber(value.totalValue) &&
        isFiniteNumber(value.totalInvested) &&
        isFiniteNumber(value.totalRoi) &&
        isFiniteNumber(value.assetCount) &&
        isFiniteNumber(value.categoryCount) &&
        isFiniteNumber(value.monthlyBudget) &&
        Array.isArray(value.categories) &&
        value.categories.every(isCategorySummary) &&
        Array.isArray(value.history) &&
        value.history.every(isHistoryEntry) &&
        (value.analytics === undefined || value.analytics === null || isAnalyticsSummary(value.analytics));
}

const SYSTEM_PROMPT = `Eres un asesor financiero experto especializado en gestión de patrimonio personal. Analizas portfolios de inversión y proporcionas recomendaciones claras, accionables y en español.

REGLAS:
1. Responde SIEMPRE en español
2. Sé directo y conciso, pero fundamenta tus recomendaciones con datos específicos
3. Usa datos concretos del portfolio proporcionado (valores, ROI, pesos actuales vs objetivos)
4. Clasifica cada recomendación por urgencia según desviación: >10pp = high, >5pp = medium, <5pp = low
5. SÍ puedes recomendar rebalancear entre categorías existentes y activos específicos del portfolio
6. SÍ puedes sugerir vender activos específicos que ya posee si tienen bajo rendimiento o exceso de peso
7. NO recomiendes comprar activos externos nuevos (no puedes dar consejo regulado)
8. Evalúa si los objetivos por categoría son realistas según el perfil de riesgo y horizonte temporal
9. Para el cash disponible, indica específicamente en qué categorías aportar basándote en gaps vs objetivos
10. Si un activo tiene ROI negativo o muy bajo vs la media, considéralo candidato a venta

FORMATO DE RESPUESTA (JSON estricto):
{
  "healthSummary": "Resumen de 1-2 frases del estado general del portfolio",
  "targetAnalysis": "Evalúa si los objetivos por categoría tienen sentido. Menciona si alguno es demasiado agresivo/conservador para la situación actual",
  "cashAllocation": "Indica específicamente en qué categorías/activos aportar el cash disponible este mes, con cantidades concretas basadas en el presupuesto mensual y gaps",
  "recommendations": [
    {
      "urgency": "high|medium|low",
      "category": "nombre de categoría",
      "action": "buy|hold|reduce|rebalance",
      "title": "Título corto y específico",
      "detail": "Explicación con datos: peso actual, objetivo, gap, ROI, etc."
    }
  ],
  "sellSuggestions": [
    { "asset": "Nombre exacto del activo", "reason": "Por qué venderlo: bajo ROI, sobrepeso, etc. con datos concretos" }
  ],
  "monthlyPlan": {
    "summary": "Resumen del plan de aporte mensual óptimo",
    "breakdown": [
      { "category": "nombre", "amount": 0, "reason": "razón específica con gap actual" }
    ]
  },
  "risks": [
    { "level": "high|medium|low", "description": "Descripción del riesgo con datos" }
  ],
  "outlook": "Perspectiva a 3-6 meses basada en la composición actual y recomendaciones"
}`;

function buildUserPrompt(summary: PortfolioSummary): string {
    const { analytics } = summary;

    let prompt = `Analiza mi portfolio de inversión:\n\n`;
    prompt += `📅 Fecha: ${summary.date}\n`;
    prompt += `💰 Valor total: ${summary.totalValue.toFixed(2)}€\n`;
    prompt += `📊 Total invertido: ${summary.totalInvested.toFixed(2)}€\n`;
    prompt += `📈 ROI total: ${summary.totalRoi.toFixed(2)}%\n`;
    prompt += `🏦 Activos: ${summary.assetCount} en ${summary.categoryCount} categorías\n`;
    prompt += `💵 Presupuesto mensual: ${summary.monthlyBudget}€\n\n`;

    if (analytics) {
        prompt += `=== MÉTRICAS AVANZADAS ===\n`;
        prompt += `🏥 Health Score: ${analytics.healthScore}/100\n`;
        if (analytics.sharpe !== null) prompt += `📐 Sharpe Ratio: ${analytics.sharpe.toFixed(2)}\n`;
        if (analytics.sortino !== null) prompt += `📐 Sortino Ratio: ${analytics.sortino.toFixed(2)}\n`;
        prompt += `📉 Volatilidad anual: ${analytics.annualizedVol.toFixed(1)}%\n`;
        prompt += `📉 Max Drawdown: ${analytics.maxDrawdown.toFixed(1)}%\n`;
        if (analytics.cagr !== null) prompt += `📈 CAGR: ${analytics.cagr.toFixed(2)}%\n`;
        prompt += `🎯 HHI (concentración): ${Math.round(analytics.hhi)}\n`;
        if (analytics.diversificationRatio !== null) prompt += `🔀 Ratio diversificación: ${analytics.diversificationRatio.toFixed(2)}\n`;
        if (analytics.avgTargetDeviation !== null) prompt += `🎯 Desviación media vs objetivos: ${analytics.avgTargetDeviation.toFixed(1)}pp\n`;
        prompt += `\n`;
    }

    prompt += `=== COMPOSICIÓN POR CATEGORÍA ===\n`;
    summary.categories.forEach(cat => {
        const targetStr = cat.target !== null ? ` (objetivo: ${cat.target}%)` : '';
        prompt += `\n📁 ${cat.category}: ${cat.weight.toFixed(1)}% del portfolio${targetStr}\n`;
        prompt += `   Valor: ${cat.value.toFixed(2)}€ | Invertido: ${cat.invested.toFixed(2)}€ | ROI: ${cat.roi.toFixed(2)}%\n`;
        prompt += `   Activos:\n`;
        cat.assets.forEach(a => {
            prompt += `   - ${a.name} (${a.term}): ${a.value.toFixed(2)}€ (${a.weight.toFixed(1)}% portfolio) ROI: ${a.roi.toFixed(1)}%\n`;
        });
    });

    if (summary.history.length > 1) {
        prompt += `\n=== HISTORIAL MENSUAL (últimos ${summary.history.length} meses) ===\n`;
        summary.history.forEach(h => {
            prompt += `${h.date}: Valor ${h.value.toFixed(2)}€ | Invertido ${h.invested.toFixed(2)}€\n`;
        });
    }

    prompt += `\nProporciona tu análisis completo en el formato JSON especificado.`;
    return prompt;
}

export const POST: APIRoute = async ({ request, locals }) => {
    const env = (locals as any).runtime?.env ?? {};
    const authError = requireFinanzasAccess(request, env);
    if (authError) {
        return authError;
    }

    try {
        const apiKey = import.meta.env.OPENAI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ error: "Portfolio data required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const summaryCandidate = isObject(body) ? (body.portfolioSummary ?? body.portfolio) : null;

        if (!isPortfolioSummary(summaryCandidate)) {
            return new Response(JSON.stringify({ error: "Portfolio data required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const summary = summaryCandidate;

        const openai = new OpenAI({ apiKey });

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-nano",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: buildUserPrompt(summary) }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 2000
        });

        const content = completion.choices[0]?.message?.content || "{}";

        let analysis;
        try {
            analysis = JSON.parse(content);
        } catch {
            analysis = { healthSummary: content, recommendations: [], risks: [], outlook: "" };
        }

        return new Response(JSON.stringify({
            ok: true,
            analysis,
            usage: {
                promptTokens: completion.usage?.prompt_tokens ?? 0,
                completionTokens: completion.usage?.completion_tokens ?? 0
            }
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("[Finanzas Analyze] Error:", error);
        return new Response(JSON.stringify({
            error: error.message || "Internal server error"
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
