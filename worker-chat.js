// worker.js - Cloudflare Worker para el chat
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only handle POST requests to /api/chat
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      // Parse request body
      const body = await request.json();
      const { message, history = [], language = 'es' } = body;

      if (!message) {
        return new Response(JSON.stringify({ error: 'Message is required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Check for API key
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ 
            error: 'GEMINI_API_KEY not configured',
            message: 'Please add GEMINI_API_KEY as a secret in Cloudflare Workers'
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // CV Data (embedded in worker)
      const cvDataEs = {
        basic_info: {
          name: "Carlos Hernández Martínez",
          emails: ["chermar.pro@gmail.com"],
          linkedin: "https://linkedin.com/in/carl0shdez",
          github: "https://github.com/Tempus23",
          location: "Valencia, España",
          availability: "AI QA Engineer & Backend Developer",
          tagline: "Ingeniero Informático especializado en Inteligencia Artificial y Backend Development."
        }
      };

      // Build system prompt
      const systemPrompt = `Eres un asistente virtual que representa a Carlos Hernández Martínez. 
Responde preguntas sobre su experiencia profesional, proyectos y habilidades de forma concisa y profesional.
Experiencia: AI QA Engineer en Mercadona IT, Backend AI Engineer en Urobora SL.
Habilidades: Python, TypeScript, PyTorch, TensorFlow, FastAPI, Google Cloud Platform, CI/CD.
Email: ${cvDataEs.basic_info.emails[0]}`;

      // Build conversation history
      const chatHistory = history.slice(-10).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // Call Gemini API
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              ...chatHistory,
              {
                role: 'user',
                parts: [{ text: chatHistory.length === 0 ? `${systemPrompt}\n\nUser: ${message}` : message }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 500,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        return new Response(
          JSON.stringify({ 
            error: 'Failed to get response from AI',
            details: errorText
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      const data = await geminiResponse.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 
        'Lo siento, no pude generar una respuesta.';

      return new Response(
        JSON.stringify({ response: aiResponse }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          message: error.message
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
