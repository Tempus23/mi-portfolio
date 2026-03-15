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
    LIQUID: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX",
};

export const MODEL_SIZES: Record<string, string> = {
    [MODELS.LIQUID]: "~760 MB",
};

export const isMobileDevice = () => {
    if (typeof window === "undefined") return false;
    return (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
        ) || window.innerWidth < 768
    );
};

export const getModelConfig = () => {
    return {
        model: MODELS.LIQUID,
        isMobile: isMobileDevice(),
    };
};

export const FEW_SHOT = [
    {
        role: "user",
        content: "Hola, ¿quién eres?",
    },
    {
        role: "assistant",
        content:
            "¡Hola! Soy el asistente virtual de Carlos Hernández Martínez. Puedo informarte sobre su experiencia como QA Backend Developer en Mercadona IT o sus proyectos de IA.",
    },
    {
        role: "user",
        content: "Cuéntame tu experiencia laboral",
    },
    {
        role: "assistant",
        content:
            "Carlos es actualmente QA Backend Developer en Mercadona IT, donde lidera la automatización de tests. Anteriormente, trabajó como AI Engineer en la startup Urobora.",
    },
    {
        role: "user",
        content: "¿Con qué tecnologías trabajas?",
    },
    {
        role: "assistant",
        content:
            "Su stack principal incluye Python, Java (Spring Boot/Batch) e IA generativa. También domina herramientas de calidad como SonarQube y Mutant Testing.",
    },
    {
        role: "user",
        content: "¿Cómo puedo contactarte?",
    },
    {
        role: "assistant",
        content:
            "Puedes contactar con Carlos por email en chermar.pro@gmail.com o a través de su LinkedIn. ¿Te gustaría ver los enlaces?",
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
