export type ActionCard = {
    icon: string;
    label: string;
    sublabel?: string;
    action: () => void;
    style?: "primary" | "ghost" | "danger";
};

export type IntentResult = {
    scroll: string | null;
    actions: string[];
};

export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};
