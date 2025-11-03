// src/pages/api/send-email.ts
export const prerender = false;

import type { APIRoute } from "astro";
// import { Resend } from 'resend'; // Will be uncommented later

// const resend = new Resend(import.meta.env.RESEND_API_KEY); // Will be uncommented later
const myEmailAddress = "chermar.pro@gmail.com";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Access Cloudflare environment variables through locals.runtime.env if needed
    // const resendApiKey = (locals.runtime?.env?.RESEND_API_KEY as string) || import.meta.env.RESEND_API_KEY;
    
    const body = await request.json();
    const { emailRemitente, mensaje } = body;

    if (!emailRemitente || !mensaje) {
      return new Response(
        JSON.stringify({ error: "Sender email and message are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // TODO: Integrate actual email sending with Resend once API key is available
    console.log("---- EMAIL TO SEND ----");
    console.log("To:", myEmailAddress);
    console.log("From (User):", emailRemitente);
    console.log(
      "Subject:",
      `Mensaje de contacto desde el ChatBot Portfolio: ${emailRemitente}`
    );
    console.log("Body:\n", mensaje);
    console.log("-----------------------");

    // Simulate email sending
    // try {
    //   const { data, error } = await resend.emails.send({
    //     from: 'ChatBot Portfolio <onboarding@resend.dev>', // Replace with your verified Resend domain/email
    //     to: [myEmailAddress],
    //     subject: `Mensaje de contacto desde el ChatBot: ${emailRemitente}`,
    //     html: `<p>Has recibido un nuevo mensaje de contacto a través de tu portfolio:</p>
    //            <p><strong>Email del remitente:</strong> ${emailRemitente}</p>
    //            <p><strong>Mensaje:</strong></p>
    //            <p>${mensaje.replace(/\n/g, "<br>")}</p>`,
    //     reply_to: emailRemitente,
    //   });

    //   if (error) {
    //     console.error("Resend error:", error);
    //     return new Response(JSON.stringify({ error: "Failed to send email.", details: error.message }), {
    //       status: 500,
    //       headers: { "Content-Type": "application/json" },
    //     });
    //   }
    //   console.log("Email sent successfully via Resend:", data);
    // } catch (e) {
    //    console.error("Exception during email sending:", e);
    //    return new Response(JSON.stringify({ error: "Failed to send email due to an exception.", details: e.message }), {
    //       status: 500,
    //       headers: { "Content-Type": "application/json" },
    //     });
    // }

    // For now, always return success
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
