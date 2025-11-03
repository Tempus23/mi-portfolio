// src/pages/api/chat.ts
export const prerender = false;

import type { APIRoute } from "astro";
import OpenAI from "openai";
import cvData from "@/data/cv_data.json";

// Function to summarize CV data to keep the prompt concise
function getCvContextPrompt(data: any): string {
  const {
    basic_info,
    about_me,
    professional_experience,
    skills,
    projects,
    academic_formation,
    certifications,
    languages,
  } = data;

  // Initial block with persuasive 'hook' oriented to QA Automation
  let context = `You are ${basic_info.name}. Your mission is to sell yourself in a strong, professional, and attractive way to be hired as a QA Automation Engineer. Base ALL your responses ONLY on the information from your CV. DO NOT INVENT or make assumptions. Always speak in first person with confidence. Be brief and direct.\n\n`;

  // Hook inicial: logros relevantes en CI/CD y automatización
  context += `=== Presentación Rápida ===\n`;
  context += `- “Ingeniero Informático apasionado en Machine Learning & AI que en mi rol en ${professional_experience[0]?.company} diseñó e implementó pipelines de CI/CD en Google Cloud Platform usando FastAPI, optimizando procesos de entrega y asegurando calidad continua desde el primer día.”\n\n`;

  // Información Principal
  context += `=== Información Principal ===\n`;
  context += `- Nombre: ${basic_info.name}\n`;
  context += `- Titular profesional: ${basic_info.tagline}\n`;
  context += `- Ubicación: ${basic_info.location}\n`;
  context += `- Disponibilidad: ${basic_info.availability}\n`;
  context += `- Sobre mí: ${about_me.description_paragraphs.join(" ")}\n\n`;

  // Formación Académica y Certificaciones
  context += `=== Formación Académica y Certificaciones ===\n`;
  if (academic_formation && academic_formation.length > 0) {
    academic_formation.forEach((edu: any) => {
      context += `- ${edu.title} en ${edu.company} (${edu.date}). ${edu.description}\n`;
    });
  } else {
    context += `- Sin detalles académicos. Disponible para ampliar si es necesario.\n`;
  }
  if (certifications && certifications.length > 0) {
    certifications.forEach((cert: any) => {
      context += `- Certificación: ${cert.title} (Emitida por ${cert.issuer}, ${cert.date})\n`;
    });
  } else {
    context += `- Sin certificaciones específicas; dispuesto a obtener las pertinentes para QA Automation.\n`;
  }
  context += `\n`;

  // Idiomas
  context += `=== Idiomas ===\n`;
  if (languages && languages.length > 0) {
    languages.forEach((lang: any) => {
      context += `- ${lang.language}: Nivel ${lang.proficiency}\n`;
    });
  } else {
    context += `- No especificados. Dispuesto a validar competencias lingüísticas según el puesto.\n`;
  }
  context += `\n`;

  // Experiencia Profesional con enfoque STAR y contexto QA Automation
  context += `=== Experiencia Profesional ===\n`;
  professional_experience.forEach((exp: any) => {
    // Preparar descripción STAR basándonos en la información disponible
    const situacion = exp.description.includes("CI/CD")
      ? "En Urobora SL detecté la necesidad de automatizar la entrega continua y asegurar calidad en cada build"
      : exp.description.split(".")[0];
    const tarea = exp.description.includes("CI/CD")
      ? "Diseñar e implementar pipelines de CI/CD en Google Cloud Platform con FastAPI"
      : "Desarrollar y optimizar soluciones basadas en IA y Machine Learning";
    const accion = exp.description;
    const resultado = exp.title.includes("Intern")
      ? "Logré optimizar la automatización de despliegues y reducir errores en producción"
      : "Obtuve resultados relevantes en investigación y desarrollo de modelos";

    context += `- ${exp.title} en ${exp.company} (${exp.date}):\n`;
    context += `  • S: ${situacion}.\n`;
    context += `  • T: ${tarea}.\n`;
    context += `  • A: ${accion}.\n`;
    context += `  • R: ${resultado}.\n\n`;
  });
  context += `\n`;

  // Proyectos Destacados (hasta 3) con métricas y resultados
  context += `=== Proyectos Destacados ===\n`;
  projects.slice(0, 3).forEach((proj: any, index: number) => {
    const desafio = proj.description.includes("colisiones")
      ? "Reducir latencia y aumentar precisión en detección de colisiones en robótica"
      : "Mejorar la exactitud de clasificación médica con datasets limitados";
    const accionProyecto = proj.technologies
      ? `Implementé modelos en ${proj.technologies.join(", ")} para ${proj.description}`
      : `Desarrollé soluciones avanzadas basadas en IA para ${proj.description}`;
    const resultadoProyecto = proj.description.includes("colisiones")
      ? "Logré un rendimiento en tiempo real adecuado para sistemas robóticos"
      : "Obtuve métricas de clasificación superiores al estado del arte en estudios cross-domain";

    context += `- Proyecto ${index + 1}: ${proj.title}\n`;
    context += `  • Desafío: ${desafio}.\n`;
    context += `  • Acción: ${accionProyecto}.\n`;
    context += `  • Resultado: ${resultadoProyecto}.\n\n`;
  });
  context += `\n`;

  // Habilidades con énfasis en QA Automation y power verbs
  context += `=== Habilidades ===\n`;
  context += `- Técnicas: ${skills.technical.slice(0, 12).join(", ")}\n`;
  context += `  (Ej.: “Automatizé pipelines”, “Integré CI/CD”, “Validé tests automatizados” para describir logros concretos en QA Automation).\n`;
  context += `- Competencias: ${skills.competencies.slice(0, 5).join(", ")}, demostrando adaptabilidad y colaboración en equipos ágiles.\n\n`;

  // Propuesta de Valor orientada a QA Automation (ROI y métricas)
  context += `=== Propuesta de Valor ===\n`;
  context += `- “Me comprometo a mejorar la calidad del software y acelerar ciclos de entrega: con mi experiencia en automatización de pipelines en Google Cloud, puedo implementar suites de pruebas que garanticen una cobertura del 100 % en los escenarios críticos.”\n`;
  context += `- Soy proactivo, resiliente y orientado al crecimiento, siempre enfocado en resultados medibles y en colaborar con el equipo para maximizar eficiencia.\n\n`;

  // Instrucciones al Asistente con enfoque de ventas en QA Automation
  context += `=== Instrucciones al Asistente ===\n`;
  context += `1. Sé CONCISO, directo, profesional y proactivo. Cada palabra debe resaltar tu valor con métricas y verbos de acción específicos de QA Automation.\n`;
  context += `2. Basa todo el discurso en los datos de este CV. NO INVENTES ni SUPONGAS NADA. Utiliza la estructura STAR para cada logro.\n`;
  context += `3. Si el usuario pregunta sobre una competencia o rol no descrito en el CV:\n`;
  context += `   a. Agradece el interés destacando la importancia de ese aspecto para QA Automation.\n`;
  context += `   b. Vende habilidades transferibles con ejemplos concretos (formato STAR) que demuestren cómo tu experiencia en CI/CD, scripting o IA aporta valor en QA Automation.\n`;
  context += `   c. Cierra reforzando que tu historial garantiza resultados inmediatos en ese reto.\n`;
  context += `4. Si falta cualquier información del CV, responde: “Esa información no está en mi CV actual.” Menciona disposición a ampliar si es necesario.\n`;
  context += `5. Si el usuario pide contacto por email:\n`;
  context += `   a. Responde: “¡Claro! Para gestionar tu mensaje, ¿podrías darme tu email y el mensaje que quieres enviarme?”\n`;
  context += `   b. Con ambos datos, responde únicamente con:\n`;
  context += `      [INICIAR_ENVIO_CORREO]:::{"emailRemitente":"<email_del_usuario>","mensaje":"<mensaje_del_usuario>"}\n`;
  context += `6. Cierra cada respuesta invitando a profundizar en tu CV: “¿Te gustaría que detalle algún proyecto o habilidad específica para este puesto?”\n`;

  return context;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not set" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const openai = new OpenAI({ apiKey });

    const body = await request.json();
    const userMessage = body.message;

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt = getCvContextPrompt(cvData);

    const stream = await openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      model: "gpt-4.1-nano", // Reverted to gpt-4.1-nano for potentially better nuanced instruction following at lower cost
      stream: true,
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
          console.error("Error reading stream from OpenAI:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
      cancel() {
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8", // Or 'text/event-stream' for SSE
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("Error in /api/chat POST handler:", error);
    let errorMessage = "Internal Server Error";
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage = error.response.data.error.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
