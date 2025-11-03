// functions/api/chat.ts - Versión simplificada para debugging

export const onRequestPost = async (context: any) => {
  try {
    const { request, env } = context;
    
    // Check if we can parse the request
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        }
      );
    }

    const { message } = body;
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        {
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        }
      );
    }

    // Check API key
    const apiKey = env?.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: "GEMINI_API_KEY not configured",
          message: "Please add GEMINI_API_KEY in Cloudflare Pages environment variables"
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

    // Simple test response to verify the function works
    return new Response(
      JSON.stringify({ 
        response: "Hello! This is a test response. The chat function is working! Your message was: " + message,
        debug: "API is connected and working"
      }),
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error?.message || "Unknown error",
        stack: error?.stack
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
