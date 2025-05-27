// src/pages/api/chat.ts
import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const userMessage = body.message;

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // TODO: Implement actual chatbot logic here
    // 1. Gather context from portfolio data
    // 2. Connect to an external LLM (OpenAI, Gemini)
    // 3. Send userMessage + context to LLM
    // 4. Return LLM's response

    const botReply = `Recibí tu mensaje: "${userMessage}". Próximamente tendré una respuesta más inteligente.`;

    return new Response(JSON.stringify({ reply: botReply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
