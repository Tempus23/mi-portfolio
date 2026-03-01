// src/pages/api/finanzas/chat.ts — AI financial chat endpoint with portfolio context
import type { APIRoute } from "astro";
import OpenAI from "openai";

export const prerender = false;

const SYSTEM_PROMPT = `Eres un asesor financiero personal inteligente integrado en la app "Patrimony". El usuario te proporciona el contexto de su portfolio de inversión junto con cada mensaje.

REGLAS:
1. Responde SIEMPRE en español
2. Sé conversacional pero profesional
3. Basa tus respuestas en los datos reales del portfolio proporcionado
4. No inventes datos ni cifras que no estén en el contexto
5. Si te preguntan sobre un activo o categoría que no existe en el portfolio, dilo claramente
6. No des consejo financiero regulado (no recomiendes comprar activos específicos externos)
7. Sí puedes opinar sobre la distribución, riesgos y oportunidades dentro del portfolio
8. Sé conciso: respuestas de 2-4 párrafos máximo a menos que pidan más detalle
9. Usa emoji sparingly para hacer la respuesta más visual
10. Si el usuario pregunta algo no relacionado con finanzas, redirige amablemente al tema

CAPACIDADES:
- Analizar composición y diversificación
- Comparar rendimiento entre categorías y activos
- Evaluar si el portfolio está alineado con los objetivos
- Sugerir ajustes en los aportes mensuales
- Explicar métricas (Sharpe, volatilidad, drawdown, etc.)
- Proyectar escenarios futuros basándose en datos históricos
- Evaluar riesgos de concentración`;

export const POST: APIRoute = async ({ request }) => {
    try {
        const apiKey = import.meta.env.OPENAI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const body = await request.json();
        const { message, portfolioContext, conversationHistory } = body;

        if (!message) {
            return new Response(JSON.stringify({ error: "Message required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Build context from portfolio data
        let contextBlock = "";
        if (portfolioContext) {
            contextBlock = `\n\n=== DATOS DEL PORTFOLIO ===\n`;
            contextBlock += `Fecha: ${portfolioContext.date}\n`;
            contextBlock += `Valor total: ${portfolioContext.totalValue}€\n`;
            contextBlock += `Invertido: ${portfolioContext.totalInvested}€\n`;
            contextBlock += `ROI: ${portfolioContext.totalRoi}%\n`;
            contextBlock += `Presupuesto mensual: ${portfolioContext.monthlyBudget}€\n`;
            contextBlock += `Activos: ${portfolioContext.assetCount}\n\n`;

            if (portfolioContext.categories) {
                portfolioContext.categories.forEach((cat: any) => {
                    const targetStr = cat.target !== null ? ` (obj: ${cat.target}%)` : '';
                    contextBlock += `${cat.category}: ${cat.weight}% portfolio${targetStr}, ROI ${cat.roi}%, ${cat.assets?.length || 0} activos\n`;
                    cat.assets?.forEach((a: any) => {
                        contextBlock += `  · ${a.name}: ${a.value}€ (${a.weight}%), ROI ${a.roi}%\n`;
                    });
                });
            }

            if (portfolioContext.analytics) {
                const a = portfolioContext.analytics;
                contextBlock += `\nMétricas: Health ${a.healthScore}/100`;
                if (a.sharpe !== null) contextBlock += `, Sharpe ${a.sharpe.toFixed(2)}`;
                contextBlock += `, Vol ${a.annualizedVol.toFixed(1)}%`;
                contextBlock += `, MaxDD ${a.maxDrawdown.toFixed(1)}%`;
                if (a.cagr !== null) contextBlock += `, CAGR ${a.cagr.toFixed(1)}%`;
                contextBlock += `\n`;
            }
        }

        const openai = new OpenAI({ apiKey });

        // Build messages array with conversation history
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: SYSTEM_PROMPT + contextBlock }
        ];

        // Add conversation history (limited to last 10 messages)
        if (Array.isArray(conversationHistory)) {
            const recentHistory = conversationHistory.slice(-10);
            recentHistory.forEach((msg: { role: string; content: string }) => {
                if (msg.role === "user" || msg.role === "assistant") {
                    messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
                }
            });
        }

        messages.push({ role: "user", content: message });

        const stream = await openai.chat.completions.create({
            model: "gpt-4.1-nano",
            messages,
            stream: true,
            temperature: 0.4,
            max_tokens: 1000
        });

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            controller.enqueue(new TextEncoder().encode(content));
                        }
                    }
                } catch (error) {
                    console.error("[Finanzas Chat] Stream error:", error);
                    controller.error(error);
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(readableStream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "no-cache"
            }
        });

    } catch (error: any) {
        console.error("[Finanzas Chat] Error:", error);
        return new Response(JSON.stringify({
            error: error.message || "Internal server error"
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
