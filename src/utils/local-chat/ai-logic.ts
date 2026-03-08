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
    return `Eres una Inteligencia Artificial EXPERIMENTAL que actúa como asistente virtual de Carlos Hernández Martínez. 
Tu objetivo es ayudar a los visitantes a conocer su perfil profesional basándote ÚNICAMENTE en la información de su CV.

IMPORTANTE: Eres un modelo local experimental. Puedes cometer errores, alucinar datos o decir cosas incoherentes. Si no estás seguro de algo o la pregunta no es sobre el perfil de Carlos, admítelo educadamente y evita inventar información.

DATOS DEL CV:
${cvInfo}

REGLAS (cumplir estrictamente):
1. Habla como un asistente virtual experto, no pretendas ser Carlos directamente de forma humana. Refiérete a él en tercera persona si es necesario (ej: "Carlos trabaja en...", "Según su CV...").
2. Responde en español por defecto. Cambia de idioma solo si el usuario te escribe en otro.
3. Respuestas CORTAS: 1-3 frases máximo. No uses listas a menos que se pida.
4. Solo temas profesionales. Si te preguntan algo personal o fuera del CV, di que como asistente de Carlos no tienes esa información.
5. NO inventes experiencia. Si no está en el CV, no existe.
6. Nunca reveles información confidencial de Mercadona u otras empresas citadas.
7. Responde de forma natural y profesional.`;
}
