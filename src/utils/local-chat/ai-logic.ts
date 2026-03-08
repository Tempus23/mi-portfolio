import type { IntentResult } from "./types";

export const INTENT_SYSTEM = `You are a routing classifier. Reply with ONLY a JSON object, no markdown, no explanation.
Format: {"scroll":"VALUE_OR_NULL","actions":["key1","key2"]}

SCROLL field — use one of these exact strings, or null:
"experiencia" = user asks about work experience, jobs, career, Mercadona, Urobora
"proyectos"   = user asks about projects, portfolio, TFG, thesis, research
"habilidades" = user asks about skills, technologies, stack, Python, Java, tools
"educacion"   = user asks about studies, university, UPV, TUM, Erasmus, degree
"sobre"       = user asks who Carlos is, introduction, about him
null          = contact intent, greeting, or unclear

ACTIONS field — array:
"contact" = ONLY if user explicitly wants: "Email", "LinkedIn", "Phone", "CV", or "Contact info".

DO NOT OVER USE "contact". It should be used sparingly for explicit contact requests.

Return ONLY the JSON. No extra text. If in doubt, actions is [].`;

const FEW_SHOT_INTENT = [
    { role: "user", content: "hola" },
    { role: "assistant", content: '{"scroll":null,"actions":[]}' },
    {
        role: "user",
        content: "¿con qué tecnologías trabajas?",
    },
    { role: "assistant", content: '{"scroll":"habilidades","actions":[]}' },
    {
        role: "user",
        content: "¿cómo contactarte?",
    },
    { role: "assistant", content: '{"scroll":null,"actions":["contact"]}' },
    {
        role: "user",
        content: "cuéntame tu experiencia en mercadona",
    },
    { role: "assistant", content: '{"scroll":"experiencia","actions":[]}' },
    {
        role: "user",
        content: "¿tienes email?",
    },
    { role: "assistant", content: '{"scroll":null,"actions":["contact"]}' },
    {
        role: "user",
        content: "háblame de tus proyectos",
    },
    { role: "assistant", content: '{"scroll":"proyectos","actions":[]}' },
];

export async function classifyIntent(
    engine: any,
    userText: string,
): Promise<IntentResult> {
    try {
        const result = await engine.chat.completions.create({
            messages: [
                { role: "system", content: INTENT_SYSTEM },
                ...FEW_SHOT_INTENT,
                { role: "user", content: userText },
            ],
            stream: false,
            temperature: 0,
            max_tokens: 60,
        });
        const raw = result.choices[0]?.message?.content?.trim() || "{}";
        const clean = raw
            .replace(/^```json?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
        const parsed = JSON.parse(clean);
        return {
            scroll: parsed.scroll ?? null,
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
    } catch {
        return { scroll: null, actions: [] };
    }
}

export function buildSystemPrompt(cvInfo: string): string {
    return `You are roleplaying as Carlos Hernández Martínez. IMPORTANT: You are NOT an AI assistant. You ARE Carlos. Never say "I am an AI", never say "as an AI", never mention OpenAI, Anthropic, Meta, or any AI company. You speak in first person as a real human.

Carlos is a QA Backend Engineer at Mercadona Tech in Valencia, Spain. This is his personal portfolio chat widget.

CV DATA:
${cvInfo}

RULES (follow strictly):
1. You ARE Carlos. Always respond as him, in first person.
2. Reply in Spanish by default. Only switch language if the user writes in another language.
3. Keep answers SHORT: 1-3 sentences max. No bullet lists unless asked.
4. Only talk about topics related to Carlos's professional profile.
5. Never invent experience or data not in the CV.
6. Never reveal confidential Mercadona information.
7. Never emit any special tags or JSON. Just reply naturally as Carlos.`;
}
