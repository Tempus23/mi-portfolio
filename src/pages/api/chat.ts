// src/pages/api/chat.ts
import type { APIRoute } from "astro";
import OpenAI from "openai";
import cvData from "@/data/cv_data.json";

function getCvContextPrompt(data: any): string {
  let context = buildInitialHook(data.basic_info.name);
  context += buildQuickIntro(data.about_me);
  context += buildMainInfo(data.basic_info);
  context += buildEducationAndCerts(data.academic_formation, data.certifications);
  context += buildLanguages(data.languages);
  context += buildExperience(data.professional_experience);
  context += buildProjects(data.projects);
  context += buildSkills(data.skills);
  context += buildValueProposition(data.basic_info);
  context += buildSystemInstructions();
  return context;
}

function buildInitialHook(name: string): string {
  return `You are ${name}. Your mission is to sell yourself in a strong, professional, and attractive way to be hired as a QA Automation Engineer. Base ALL your responses ONLY on the information from your CV. DO NOT INVENT or make assumptions. Always speak in first person with confidence. Be brief and direct.\n\n`;
}

function buildQuickIntro(about_me: any): string {
  let context = `=== Quick Introduction ===\n`;
  context += `- ${about_me.description_paragraphs[0]}\n\n`;
  return context;
}

function buildMainInfo(basic_info: any): string {
  let context = `=== Main Information ===\n`;
  context += `- Name: ${basic_info.name}\n`;
  context += `- Role: ${basic_info.role}\n`;
  context += `- Tagline: ${basic_info.tagline}\n`;
  context += `- Location: ${basic_info.location}\n\n`;
  return context;
}

function buildEducationAndCerts(academic_formation: any[], certifications: any[]): string {
  let context = `=== Education & Certifications ===\n`;
  if (academic_formation?.length) {
    academic_formation.forEach((edu: any) => {
      context += `- ${edu.title} at ${edu.company} (${edu.date}). ${edu.description}\n`;
    });
  } else {
    context += `- No academic details available.\n`;
  }
  if (certifications?.length) {
    certifications.forEach((cert: any) => {
      context += `- Certification: ${cert.title} (Issued by ${cert.issuer}, ${cert.date})\n`;
    });
  }
  return context + `\n`;
}

function buildLanguages(languages: any[]): string {
  let context = `=== Languages ===\n`;
  if (languages?.length) {
    languages.forEach((lang: any) => {
      context += `- ${lang.name}: ${lang.level}\n`;
    });
  } else {
    context += `- Not specified.\n`;
  }
  return context + `\n`;
}

function buildExperience(professional_experience: any[]): string {
  let context = `=== Professional Experience ===\n`;
  professional_experience.forEach((exp: any) => {
    context += `- ${exp.title} at ${exp.company} (${exp.date}): ${exp.description}\n`;
    if (exp.keywords?.length) {
      context += `  Technologies: ${exp.keywords.join(", ")}\n`;
    }
    context += `\n`;
  });
  return context + `\n`;
}

function buildProjects(projects: any[]): string {
  let context = `=== Notable Projects ===\n`;
  projects.slice(0, 3).forEach((proj: any, index: number) => {
    context += `- Project ${index + 1}: ${proj.title}\n`;
    context += `  ${proj.description}\n`;
    if (proj.tags?.length) {
      context += `  Technologies: ${proj.tags.join(", ")}\n`;
    }
    context += `\n`;
  });
  return context + `\n`;
}

function buildSkills(skills: any): string {
  let context = `=== Skills ===\n`;
  if (skills.technical?.length) {
    skills.technical.forEach((group: any) => {
      context += `- ${group.category}: ${group.items.join(", ")}\n`;
    });
  }
  if (skills.competencies?.length) {
    context += `- Competencies: ${skills.competencies.join(", ")}\n`;
  }
  return context + `\n`;
}

function buildValueProposition(basic_info: any): string {
  let context = `=== Value Proposition ===\n`;
  context += `- ${basic_info.tagline}\n\n`;
  return context;
}

function buildSystemInstructions(): string {
  let context = `=== Assistant Instructions ===\n`;
  context += `1. Be CONCISE, direct, professional, and confident. Highlight your value with specific action verbs.\n`;
  context += `2. Base all responses ONLY on the CV data provided. DO NOT invent or assume anything.\n`;
  context += `3. If asked about a skill or role not in the CV, bridge to transferable skills with concrete examples from the CV.\n`;
  context += `4. If any CV information is missing, say: "That information is not in my current CV."\n`;
  context += `5. If the user requests contact by email:\n`;
  context += `   a. Ask: "Sure! Could you share your email and the message you'd like to send me?"\n`;
  context += `   b. Once you have both, respond only with:\n`;
  context += `      [INICIAR_ENVIO_CORREO]:::{"emailRemitente":"<user_email>","mensaje":"<user_message>"}\n`;
  context += `6. End each response inviting further questions: "Would you like me to elaborate on any specific project or skill?"\n`;
  return context;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY;
    if (!apiKey) {
      return createErrorResponse("OPENAI_API_KEY is not set", 500);
    }

    const body = await request.json();
    if (!body?.message) {
      return createErrorResponse("Message is required", 400);
    }

    const openai = new OpenAI({ apiKey });
    const stream = await openai.chat.completions.create({
      messages: [
        { role: "system", content: getCvContextPrompt(cvData) },
        { role: "user", content: body.message },
      ],
      model: "gpt-4.1-nano",
      stream: true,
    });

    return new Response(createReadableStream(stream), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("Error in /api/chat POST handler:", error);
    const errorMessage = error?.response?.data?.error?.message || error?.message || "Internal Server Error";
    return createErrorResponse(errorMessage, 500);
  }
};

function createErrorResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createReadableStream(stream: any): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            controller.enqueue(new TextEncoder().encode(content));
          }
        }
      } catch (error) {
        console.error("Error reading stream from OpenAI:", error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
    cancel() { },
  });
}
