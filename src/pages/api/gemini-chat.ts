// src/pages/api/gemini-chat.ts
import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cvData from "@/data/cv_data.json";

// Function to create system prompt based on CV data
function getSystemPrompt(data: any): string {
  const {
    basic_info,
    about_me,
    professional_experience,
    skills,
    projects,
    academic_formation,
    languages,
  } = data;

  let prompt = `You are an AI assistant representing ${basic_info.name}, an AI/ML Engineer and Backend Developer. Your role is to help recruiters and interested people learn about Carlos in a friendly and professional way.\n\n`;
  
  prompt += `=== Basic Information ===\n`;
  prompt += `- Name: ${basic_info.name}\n`;
  prompt += `- Title: ${basic_info.tagline}\n`;
  prompt += `- Location: ${basic_info.location}\n`;
  prompt += `- Availability: ${basic_info.availability}\n\n`;
  
  prompt += `=== About ===\n`;
  prompt += `${about_me.description_paragraphs.join(" ")}\n\n`;
  
  prompt += `=== Professional Experience ===\n`;
  professional_experience.forEach((exp: any) => {
    prompt += `- ${exp.title} at ${exp.company} (${exp.date})\n`;
    prompt += `  ${exp.description}\n\n`;
  });
  
  prompt += `=== Key Skills ===\n`;
  prompt += `Technical: ${skills.technical.slice(0, 10).join(", ")}\n`;
  prompt += `Competencies: ${skills.competencies.slice(0, 5).join(", ")}\n\n`;
  
  prompt += `=== Featured Projects ===\n`;
  projects.slice(0, 3).forEach((proj: any) => {
    prompt += `- ${proj.title}: ${proj.description}\n`;
  });
  prompt += `\n`;
  
  prompt += `=== Education ===\n`;
  academic_formation.forEach((edu: any) => {
    prompt += `- ${edu.title} at ${edu.company} (${edu.date})\n`;
  });
  prompt += `\n`;
  
  prompt += `=== Languages ===\n`;
  languages.forEach((lang: any) => {
    prompt += `- ${lang.language}: ${lang.proficiency}\n`;
  });
  prompt += `\n`;
  
  prompt += `=== Instructions ===\n`;
  prompt += `1. Be friendly, professional, and helpful\n`;
  prompt += `2. Answer questions based only on the CV information provided\n`;
  prompt += `3. If asked about something not in the CV, politely say you don't have that information\n`;
  prompt += `4. Keep responses concise but informative\n`;
  prompt += `5. Encourage questions about projects, skills, or experience\n`;
  prompt += `6. If someone wants to contact Carlos, provide the email: ${basic_info.emails[0]}\n`;
  
  return prompt;
}

// Placeholder tool definitions for Gemini function calling
const tools = [
  {
    name: "get_contact_info",
    description: "Get Carlos's contact information including email and social profiles",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_project_details",
    description: "Get detailed information about a specific project",
    parameters: {
      type: "object",
      properties: {
        project_name: {
          type: "string",
          description: "The name of the project to get details about",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_skills_by_category",
    description: "Get skills filtered by a specific category or technology",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "The category or technology to filter skills by (e.g., 'Python', 'AI', 'Backend')",
        },
      },
      required: ["category"],
    },
  },
];

// Placeholder function to handle tool calls
function handleToolCall(toolName: string, args: any): string {
  // This is a placeholder - tools don't actually do anything yet
  switch (toolName) {
    case "get_contact_info":
      return `Contact: ${cvData.basic_info.emails[0]}`;
    case "get_project_details":
      return `Project details for: ${args.project_name}`;
    case "get_skills_by_category":
      return `Skills in category: ${args.category}`;
    default:
      return "Tool function not implemented yet";
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not set" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
    });

    const body = await request.json();
    const userMessage = body.message;
    const chatHistory = body.history || [];

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt = getSystemPrompt(cvData);
    
    // Start chat with history
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: systemPrompt }],
        },
        {
          role: "model",
          parts: [{ text: "I understand. I'll help people learn about Carlos based on his CV information. How can I help you?" }],
        },
        ...chatHistory.map((msg: any) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        })),
      ],
    });

    const result = await chat.sendMessageStream(userMessage);
    
    // Create a readable stream to send chunks back
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
        } catch (error) {
          console.error("Error reading stream from Gemini:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Cleanup if needed
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("Error in /api/gemini-chat POST handler:", error);
    let errorMessage = "Internal Server Error";
    if (error.message) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
