import { ACTION_SETS } from "./constants";

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function sanitizeUrl(rawUrl: string): string {
    const url = rawUrl.trim();
    if (/^(https?:\/\/|mailto:|tel:|#)/i.test(url)) {
        return escapeHtml(url);
    }
    return "#";
}

function renderInlineMarkdown(text: string): string {
    const escaped = escapeHtml(text);
    const codeSnippets: string[] = [];
    const withCodeTokens = escaped.replace(/`([^`]+)`/g, (_, code: string) => {
        const token = `__INLINE_CODE_${codeSnippets.length}__`;
        codeSnippets.push(`<code>${code}</code>`);
        return token;
    });

    const withLinks = withCodeTokens.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_, label: string, href: string) =>
            `<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );
    const withBold = withLinks.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const withItalic = withBold.replace(/(^|[^\*])\*(.+?)\*/g, "$1<em>$2</em>");

    return withItalic.replace(
        /__INLINE_CODE_(\d+)__/g,
        (_, index: string) => codeSnippets[Number(index)] ?? "",
    );
}

function isLikelyProseLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,6}\s/.test(trimmed)) return false;
    if (/^[-*+]\s/.test(trimmed)) return false;
    if (/^\d+\.\s/.test(trimmed)) return false;
    if (
        trimmed.includes("{") ||
        trimmed.includes("}") ||
        trimmed.includes(";") ||
        trimmed.includes("=>")
    ) {
        return false;
    }

    const words = trimmed.split(/\s+/);
    if (words.length < 6) return false;
    const hasSentencePunctuation = /[.!?]$/.test(trimmed);
    const hasLetters = /[a-záéíóúñ]/i.test(trimmed);
    const hasFewCodeChars = !/[()[\]=]/.test(trimmed);
    return hasLetters && hasFewCodeChars && hasSentencePunctuation;
}

function splitUnclosedCodeBlock(
    codeLines: string[],
): { code: string; proseTail: string } {
    let splitIndex = codeLines.length;
    for (let i = codeLines.length - 1; i >= 0; i -= 1) {
        if (isLikelyProseLine(codeLines[i])) {
            splitIndex = i;
        } else {
            break;
        }
    }

    return {
        code: codeLines.slice(0, splitIndex).join("\n").trimEnd(),
        proseTail: codeLines.slice(splitIndex).join("\n").trim(),
    };
}

export function renderChatMarkdown(text: string): string {
    const normalizedText = text.replace(/\r\n/g, "\n");
    const markdownFence = normalizedText.match(
        /^```(?:markdown|md)\s*\n([\s\S]*?)\n?```$/i,
    );
    const safeText = markdownFence ? markdownFence[1] : normalizedText;
    const lines = safeText.split("\n");
    const html: string[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let listMode: "ul" | "ol" | null = null;
    let paragraphLines: string[] = [];
    let quoteLines: string[] = [];

    const pushCodeBlock = (code: string) => {
        html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    };

    const flushParagraph = () => {
        if (!paragraphLines.length) return;
        html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
        paragraphLines = [];
    };

    const flushList = () => {
        if (!listMode) return;
        html.push(`</${listMode}>`);
        listMode = null;
    };

    const flushQuote = () => {
        if (!quoteLines.length) return;
        const content = quoteLines.map((line) => renderInlineMarkdown(line));
        html.push(`<blockquote><p>${content.join("<br>")}</p></blockquote>`);
        quoteLines = [];
    };

    for (const line of lines) {
        const trimmed = line.trim();

        const singleLineFenceMatch = trimmed.match(
            /^```(?:[a-zA-Z0-9_\-+#]*)\s*([\s\S]*?)\s*```$/,
        );
        if (singleLineFenceMatch) {
            flushParagraph();
            flushQuote();
            flushList();
            pushCodeBlock(singleLineFenceMatch[1].trim());
            continue;
        }

        if (trimmed.startsWith("```")) {
            flushParagraph();
            flushQuote();
            flushList();
            if (!inCodeBlock) {
                codeBlockLines = [];
                inCodeBlock = true;
            } else {
                const codeContent = codeBlockLines
                    .join("\n")
                    .trim();
                if (codeContent) {
                    pushCodeBlock(codeContent);
                }
                codeBlockLines = [];
                inCodeBlock = false;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        if (!trimmed) {
            flushParagraph();
            flushQuote();
            flushList();
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            flushQuote();
            flushList();
            const level = headingMatch[1].length;
            const value = renderInlineMarkdown(headingMatch[2]);
            html.push(`<h${level}>${value}</h${level}>`);
            continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph();
            flushQuote();
            flushList();
            html.push("<hr>");
            continue;
        }

        const quoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            flushList();
            quoteLines.push(quoteMatch[1]);
            continue;
        }
        flushQuote();

        const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unorderedMatch) {
            flushParagraph();
            if (listMode !== "ul") {
                flushList();
                listMode = "ul";
                html.push("<ul>");
            }
            html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
            continue;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
            flushParagraph();
            if (listMode !== "ol") {
                flushList();
                listMode = "ol";
                html.push("<ol>");
            }
            html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
            continue;
        }

        flushList();
        paragraphLines.push(trimmed);
    }

    flushParagraph();
    flushQuote();
    flushList();

    if (inCodeBlock) {
        const { code, proseTail } = splitUnclosedCodeBlock(codeBlockLines);
        if (code) {
            pushCodeBlock(code);
        }
        if (proseTail) {
            html.push(`<p>${renderInlineMarkdown(proseTail)}</p>`);
        }
    }

    return `<div class="chat-markdown">${html.join("")}</div>`;
}

export function scrollToSection(selectorList: string) {
    const selectors = selectorList.split(",");
    let el: HTMLElement | null = null;
    for (const s of selectors) {
        el = document.querySelector(s.trim()) as HTMLElement;
        if (el) break;
    }
    if (!el) return;
    el.scrollIntoView({ behavior: "auto", block: "start" });
    el.classList.add("section-highlight-pulse");
    setTimeout(() => el?.classList.remove("section-highlight-pulse"), 2000);
}

export function avatarHTML() {
    return `<div class="w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-200/50 dark:border-indigo-500/20">
        <svg class="size-3.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
    </div>`;
}

export function quickChip(text: string) {
    return `<button class="quick-action text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200/60 dark:border-indigo-500/20 rounded-full px-2.5 py-1 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors">${text}</button>`;
}

export function appendWelcomeMessage(container: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-start gap-2.5 max-w-[88%] msg-enter";
    wrapper.innerHTML = `
        ${avatarHTML()}
        <div class="bg-gray-50 dark:bg-indigo-500/10 text-gray-800 dark:text-indigo-100 text-[13.5px] leading-relaxed px-4 py-3 rounded-2xl rounded-tl-md border border-gray-100 dark:border-indigo-500/10 shadow-sm">
            Hola, soy Carlos. Ejecuto 100% en tu navegador vía WebGPU, sin servidores externos. ¿En qué puedo ayudarte?
            <div class="mt-2.5 flex flex-wrap gap-1.5">
                ${quickChip("¿Con qué tecnologías trabajas?")}
                ${quickChip("¿Cómo contactarte?")}
                ${quickChip("Cuéntame tu experiencia")}
            </div>
        </div>`;
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

export function appendUserMessage(container: HTMLElement, text: string) {
    const wrapper = document.createElement("div");
    wrapper.className = "flex justify-end msg-enter";
    const bubble = document.createElement("div");
    bubble.className =
        "max-w-[80%] bg-indigo-600 text-white text-[13.5px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md shadow-md shadow-indigo-500/20";
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

export function appendBotMessage(container: HTMLElement, text: string): { bubble: HTMLElement, wrapper: HTMLElement } {
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-start gap-2.5 max-w-[90%] msg-enter";
    const bubble = document.createElement("div");
    bubble.className =
        "flex-1 bg-gray-50 dark:bg-indigo-500/10 text-gray-800 dark:text-indigo-100 text-[13.5px] leading-relaxed px-4 py-3 rounded-2xl rounded-tl-md border border-gray-100 dark:border-indigo-500/10 shadow-sm";

    if (text === "…") {
        bubble.innerHTML = `<span class="inline-flex gap-1 items-center h-4">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:0ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:150ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:300ms"></span>
           </span>`;
    } else {
        bubble.innerHTML = renderChatMarkdown(text);
    }

    wrapper.appendChild(document.createRange().createContextualFragment(avatarHTML()));
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return { bubble, wrapper };
}

export function renderActionCards(keys: string[]) {
    const cards = keys.flatMap((k) =>
        (ACTION_SETS[k] || []).map((c, i) => ({ ...c, key: k, idx: i })),
    );
    if (!cards.length) return null;

    const container = document.createElement("div");
    container.className = "flex flex-col gap-1.5 mt-1";

    cards.forEach(({ icon, label, sublabel, style, key, idx }, i) => {
        const delay = i * 70;
        const isPrimary = style === "primary";
        const card = document.createElement("button");
        card.dataset.actionBtn = key;
        card.dataset.actionIdx = String(idx);
        card.className = [
            "chat-action-card flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all active:scale-[.98]",
            isPrimary
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/25"
                : "bg-white dark:bg-indigo-500/10 border border-gray-200 dark:border-indigo-500/20 text-gray-800 dark:text-indigo-100 hover:border-indigo-300 dark:hover:border-indigo-400/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 shadow-sm",
        ].join(" ");
        card.style.animationDelay = `${delay}ms`;
        card.innerHTML = `
            <span class="${isPrimary ? "text-white/90" : "text-indigo-500 dark:text-indigo-400"}">${icon}</span>
            <span class="flex-1 min-w-0">
                <span class="block text-[13px] font-semibold leading-tight truncate">${label}</span>
                ${sublabel ? `<span class="block text-[11px] opacity-60 mt-0.5">${sublabel}</span>` : ""}
            </span>
            <svg class="${isPrimary ? "text-white/60" : "text-gray-400 dark:text-indigo-500/60"} size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>`;
        container.appendChild(card);
    });

    return container;
}
