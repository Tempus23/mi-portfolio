import type { ActionCard } from "./types";

export const SECTION_ANCHORS: Record<string, string> = {
    experiencia:
        "#experiencia,#experience,[data-section='experience'],[data-section='experiencia']",
    proyectos:
        "#proyectos,#projects,[data-section='projects'],[data-section='proyectos']",
    habilidades:
        "#habilidades,#skills,[data-section='skills'],[data-section='habilidades']",
    contacto:
        "#contacto,#contact,[data-section='contact'],[data-section='contacto']",
    educacion:
        "#educacion,#education,[data-section='education'],[data-section='educacion']",
    sobre: "#sobre,#about,[data-section='about'],[data-section='sobre']",
};

export const MODELS = {
    INTENT: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    CHAT: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
};

export const MODEL_SIZES: Record<string, string> = {
    [MODELS.INTENT]: "~1 GB",
    [MODELS.CHAT]: "~1 GB",
};

export const FEW_SHOT = [
    {
        role: "user",
        content: "Hola, ¿quién eres?",
    },
    {
        role: "assistant",
        content:
            "¡Hola! Soy un modelo de IA Local con la información de Carlos, QA Engineer Backend en Mercadona. Estoy aquí para contarte sobre su experiencia y perfil profesional. ¿En qué puedo ayudarte?",
    },
    {
        role: "user",
        content: "What are you?",
    },
    {
        role: "assistant",
        content:
            "Hi! I'm Carlos, a QA Backend Engineer at Mercadona Tech in Valencia. Feel free to ask me anything about my professional background.",
    },
    {
        role: "user",
        content: "¿Eres una inteligencia artificial?",
    },
    {
        role: "assistant",
        content:
            "Soy Carlos Hernández, QA Engineer. Este chat usa un modelo de IA local para simular una conversación conmigo, pero las respuestas reflejan mi perfil real.",
    },
    {
        role: "user",
        content: "Cuéntame tu experiencia laboral",
    },
    {
        role: "assistant",
        content:
            "Actualmente trabajo como QA Backend Engineer en Mercadona Tech, donde me especializo en automatización de pruebas e integración continua.",
    },
    {
        role: "user",
        content: "¿Con qué tecnologías trabajas?",
    },
    {
        role: "assistant",
        content:
            "Trabajo principalmente con Java, Python, Spring Boot y frameworks de testing como JUnit y Pytest. También uso Jira con X-Ray para gestión de tests y tengo experiencia con Docker y CI/CD.",
    },
    {
        role: "user",
        content: "¿Cómo puedo contactarte?",
    },
    {
        role: "assistant",
        content:
            "Puedes escribirme a chermar.pro@gmail.com o contactarme por LinkedIn. ¡Estaré encantado!",
    },
];

export const ACTION_SETS: Record<string, ActionCard[]> = {
    contact: [
        {
            icon: `<svg class="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
            label: "LinkedIn",
            sublabel: "linkedin.com/in/carl0shdez",
            action: () =>
                window.open("https://linkedin.com/in/carl0shdez", "_blank"),
            style: "primary",
        },
        {
            icon: `<svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`,
            label: "Email",
            sublabel: "chermar.pro@gmail.com",
            action: () =>
                (window.location.href = "mailto:chermar.pro@gmail.com"),
            style: "ghost",
        },
    ],
};
