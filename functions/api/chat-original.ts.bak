// functions/api/chat.ts
import cvDataEs from "./cv_data_es.json";
import cvDataEn from "./cv_data_en.json";

// Function to create a comprehensive context from CV data
function getCvContextPrompt(data: any, language: string = "es"): string {
  const {
    basic_info,
    about_me,
    professional_experience,
    skills,
    projects,
    academic_formation,
    languages,
  } = data;

  const isSpanish = language === "es";
  
  let context = isSpanish 
    ? `Eres un asistente virtual que representa a ${basic_info.name}. Tu objetivo es proporcionar información precisa y profesional sobre su experiencia, habilidades y proyectos a reclutadores e interesados.\n\n`
    : `You are a virtual assistant representing ${basic_info.name}. Your goal is to provide accurate and professional information about his experience, skills, and projects to recruiters and interested parties.\n\n`;

  // Basic Information
  context += isSpanish ? `=== Información Básica ===\n` : `=== Basic Information ===\n`;
  context += `- ${isSpanish ? 'Nombre' : 'Name'}: ${basic_info.name}\n`;
  context += `- ${isSpanish ? 'Posición' : 'Position'}: ${basic_info.availability}\n`;
  context += `- ${isSpanish ? 'Ubicación' : 'Location'}: ${basic_info.location}\n`;
  context += `- Email: ${basic_info.emails[0]}\n`;
  context += `- LinkedIn: ${basic_info.linkedin}\n`;
  context += `- GitHub: ${basic_info.github}\n`;
  context += `- ${isSpanish ? 'Perfil' : 'Profile'}: ${basic_info.tagline}\n\n`;

  // About Me
  context += isSpanish ? `=== Sobre Mí ===\n` : `=== About Me ===\n`;
  context += `${about_me.description_paragraphs.join("\n\n")}\n\n`;
  
  if (about_me.attributes && about_me.attributes.length > 0) {
    context += isSpanish ? `Atributos clave:\n` : `Key attributes:\n`;
    about_me.attributes.forEach((attr: string) => {
      context += `- ${attr}\n`;
    });
    context += `\n`;
  }

  // Professional Experience
  context += isSpanish ? `=== Experiencia Profesional ===\n` : `=== Professional Experience ===\n`;
  professional_experience.forEach((exp: any) => {
    context += `\n${exp.title} ${isSpanish ? 'en' : 'at'} ${exp.company} (${exp.date})\n`;
    context += `${exp.description}\n`;
  });
  context += `\n`;

  // Academic Formation
  context += isSpanish ? `=== Formación Académica ===\n` : `=== Academic Formation ===\n`;
  if (academic_formation && academic_formation.length > 0) {
    academic_formation.forEach((edu: any) => {
      context += `- ${edu.title} ${isSpanish ? 'en' : 'at'} ${edu.company} (${edu.date})\n`;
      context += `  ${edu.description}\n`;
    });
  }
  context += `\n`;

  // Skills
  context += isSpanish ? `=== Habilidades Técnicas ===\n` : `=== Technical Skills ===\n`;
  context += `${skills.technical.join(", ")}\n\n`;
  
  context += isSpanish ? `=== Competencias ===\n` : `=== Competencies ===\n`;
  context += `${skills.competencies.join(", ")}\n\n`;

  // Languages
  context += isSpanish ? `=== Idiomas ===\n` : `=== Languages ===\n`;
  if (languages && languages.length > 0) {
    languages.forEach((lang: any) => {
      context += `- ${lang.name}: ${lang.level}\n`;
    });
  }
  context += `\n`;

  // Projects
  context += isSpanish ? `=== Proyectos Destacados ===\n` : `=== Featured Projects ===\n`;
  projects.forEach((proj: any) => {
    context += `\n${proj.title}\n`;
    context += `${proj.description}\n`;
    if (proj.tags && proj.tags.length > 0) {
      context += `${isSpanish ? 'Tecnologías' : 'Technologies'}: ${proj.tags.join(", ")}\n`;
    }
    if (proj.github) {
      context += `GitHub: ${proj.github}\n`;
    }
  });
  context += `\n`;

  // Instructions for the assistant
  context += isSpanish ? `=== Instrucciones ===\n` : `=== Instructions ===\n`;
  if (isSpanish) {
    context += `1. Responde SOLO basándote en la información proporcionada del CV. NO inventes datos.\n`;
    context += `2. Sé profesional, conciso y útil. Adapta el tono según la pregunta.\n`;
    context += `3. Si te preguntan algo que no está en el CV, indícalo claramente y ofrece información relacionada si existe.\n`;
    context += `4. Ayuda a los reclutadores a entender por qué Carlos es un buen candidato para roles de AI/ML Engineering, Backend Development o QA Automation.\n`;
    context += `5. Si te piden contactar a Carlos, proporciona su email: ${basic_info.emails[0]}\n`;
    context += `6. Mantén un tono profesional pero amigable, representando bien a Carlos ante potenciales empleadores.\n`;
    context += `7. Responde en el mismo idioma en que te hagan la pregunta (español o inglés).\n`;
  } else {
    context += `1. Answer ONLY based on the CV information provided. DO NOT invent data.\n`;
    context += `2. Be professional, concise, and helpful. Adapt your tone to the question.\n`;
    context += `3. If asked about something not in the CV, state it clearly and offer related information if available.\n`;
    context += `4. Help recruiters understand why Carlos is a good candidate for AI/ML Engineering, Backend Development, or QA Automation roles.\n`;
    context += `5. If asked to contact Carlos, provide his email: ${basic_info.emails[0]}\n`;
    context += `6. Maintain a professional but friendly tone, representing Carlos well to potential employers.\n`;
    context += `7. Respond in the same language as the question (Spanish or English).\n`;
  }

  return context;
}

interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost = async (context: any) => {
  try {
    const { request, env } = context;
    
    // Detailed debugging for environment
    console.log("Environment keys:", Object.keys(env || {}));
    console.log("Has GEMINI_API_KEY:", !!env?.GEMINI_API_KEY);
    
    const apiKey = env?.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: "GEMINI_API_KEY is not set",
          debug: {
            hasEnv: !!env,
            envKeys: Object.keys(env || {}),
            message: "Please configure GEMINI_API_KEY in Cloudflare Pages Settings > Environment variables"
          }
        }),
        {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        }
      );
    }

    const body = await request.json() as { message: string; history?: any[]; language?: string };
    const { message, history = [], language = "es" } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // Select CV data based on language
    const cvData = language === "en" ? cvDataEn : cvDataEs;
    const systemPrompt = getCvContextPrompt(cvData, language);

    // Build conversation history for Gemini
    const chatHistory: any[] = [];
    
    // Add conversation history (limit to last 10 messages to avoid token limit)
    const recentHistory = history.slice(-10);
    recentHistory.forEach((msg: any) => {
      chatHistory.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      });
    });

    // Construct the full message with system prompt
    const fullMessage = chatHistory.length === 0 
      ? `${systemPrompt}\n\nUser: ${message}`
      : message;

    // Call Gemini API directly
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            ...chatHistory,
            {
              role: "user",
              parts: [{ text: fullMessage }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Gemini API error:", errorData);
      return new Response(
        JSON.stringify({ error: "Failed to get response from AI" }),
        {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        }
      );
    }

    const data = await response.json() as any;
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude generar una respuesta.";

    return new Response(
      JSON.stringify({ response: aiResponse }),
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      }
    );
  } catch (error: any) {
    console.error("Error in /api/chat handler:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      }
    );
  }
};

// Handle OPTIONS for CORS
export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
