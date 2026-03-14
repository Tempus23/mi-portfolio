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

export function stripThinkingTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export async function classifyIntent(
    generator: any,
    userText: string,
): Promise<IntentResult> {
    try {
        const messages = [
            { role: "system", content: INTENT_SYSTEM },
            ...FEW_SHOT_INTENT,
            { role: "user", content: userText },
        ];

        const output = await generator(messages, {
            max_new_tokens: 80,
            temperature: 0.01,
            do_sample: false,
        });

        const raw: string =
            output?.[0]?.generated_text?.at(-1)?.content?.trim() ?? "{}";

        const clean = stripThinkingTags(raw)
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
    return `Eres el asistente virtual oficial de Carlos Hernández Martínez. 
Tu objetivo es responder de forma precisa y profesional a preguntas sobre su trayectoria basándote EXCLUSIVAMENTE en su CV.

INFORMACIÓN DEL CV:
${cvInfo}

REGLAS DE ORO:
1. Confianza total: Tienes toda su información profesional. NUNCA digas que no tienes experiencia específica si el dato está en el CV.
2. Referencia: Si preguntan por experiencia, consulta "professional_experience". Si preguntan por estudios, "academic_formation".
3. Actualidad: Carlos es QA Backend Developer en Mercadona IT actualmente.
4. Identidad: Responde en tercera persona (ej: "Carlos posee...", "Según su perfil...").
5. Brevedad: Máximo 2 frases por respuesta.
6. Honestidad: Si algo NO está en el CV, di: "Esa información no consta en el CV de Carlos".`;
}
