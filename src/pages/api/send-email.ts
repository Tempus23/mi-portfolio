// src/pages/api/send-email.ts
import type { APIRoute } from "astro";

const MY_EMAIL_ADDRESS = "chermar.pro@gmail.com";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { emailRemitente, mensaje } = body;

    if (!emailRemitente || !mensaje) {
      return new Response(
        JSON.stringify({ error: "Sender email and message are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("---- EMAIL TO SEND ----");
    console.log("To:", MY_EMAIL_ADDRESS);
    console.log("From (User):", emailRemitente);
    console.log(
      "Subject:",
      `Mensaje de contacto desde el ChatBot Portfolio: ${emailRemitente}`
    );
    console.log("Body:\n", mensaje);
    console.log("-----------------------");

    // For now, always return success (simulated)
    return new Response(
      JSON.stringify({
        success: true,
        message: "Email processed (simulated).",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in /api/send-email:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error.",
        details: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
