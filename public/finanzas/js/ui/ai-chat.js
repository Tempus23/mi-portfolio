// ui/ai-chat.js — Floating AI chat panel with streaming responses
import { showToast } from '../shared/toast.js';

let _chatHistory = [];
let _isStreaming = false;
let _chatOpen = false;

// ─── DOM Creation ───────────────────────────────────────────────────────────

function createChatDOM() {
    // FAB
    const fab = document.createElement('button');
    fab.id = 'aiChatFab';
    fab.className = 'ai-chat-fab';
    fab.innerHTML = '<span class="ai-chat-fab-icon">💬</span>';
    fab.title = 'Chat financiero IA';
    fab.setAttribute('aria-label', 'Abrir chat financiero');

    // Panel
    const panel = document.createElement('div');
    panel.id = 'aiChatPanel';
    panel.className = 'ai-chat-panel';
    panel.innerHTML = `
        <div class="ai-chat-header">
            <div class="ai-chat-header-info">
                <span class="ai-chat-avatar">🧠</span>
                <div>
                    <span class="ai-chat-title">Asistente Financiero</span>
                    <span class="ai-chat-subtitle">Pregunta sobre tu portfolio</span>
                </div>
            </div>
            <button class="ai-chat-close" id="aiChatClose" aria-label="Cerrar chat">×</button>
        </div>
        <div class="ai-chat-messages" id="aiChatMessages">
            <div class="ai-chat-welcome">
                <span class="ai-chat-welcome-icon">👋</span>
                <p>¡Hola! Soy tu asistente financiero. Puedo analizar tu portfolio, responder preguntas y darte recomendaciones.</p>
                <div class="ai-chat-suggestions">
                    <button class="ai-chat-suggestion" data-msg="¿Cómo está mi portfolio?">¿Cómo está mi portfolio?</button>
                    <button class="ai-chat-suggestion" data-msg="¿Dónde debería invertir este mes?">¿Dónde invertir?</button>
                    <button class="ai-chat-suggestion" data-msg="¿Cuáles son mis principales riesgos?">Mis riesgos</button>
                    <button class="ai-chat-suggestion" data-msg="¿Está bien balanceado mi portfolio?">¿Está balanceado?</button>
                </div>
            </div>
        </div>
        <div class="ai-chat-input-area">
            <textarea class="ai-chat-input" id="aiChatInput" placeholder="Escribe tu pregunta..." rows="1"></textarea>
            <button class="ai-chat-send" id="aiChatSend" aria-label="Enviar mensaje">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
            </button>
        </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    return { fab, panel };
}

// ─── Chat Logic ─────────────────────────────────────────────────────────────

function toggleChat(show) {
    const panel = document.getElementById('aiChatPanel');
    const fab = document.getElementById('aiChatFab');
    if (!panel || !fab) return;

    _chatOpen = typeof show === 'boolean' ? show : !_chatOpen;
    panel.classList.toggle('open', _chatOpen);
    fab.classList.toggle('active', _chatOpen);

    if (_chatOpen) {
        const input = document.getElementById('aiChatInput');
        if (input) setTimeout(() => input.focus(), 300);
    }
}

function addMessage(role, content) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;

    // Hide welcome on first message
    const welcome = container.querySelector('.ai-chat-welcome');
    if (welcome) welcome.style.display = 'none';

    const msg = document.createElement('div');
    msg.className = `ai-chat-msg ai-chat-msg-${role}`;

    if (role === 'assistant') {
        msg.innerHTML = `<span class="ai-chat-msg-avatar">🧠</span><div class="ai-chat-msg-content">${formatMarkdown(content)}</div>`;
    } else {
        msg.innerHTML = `<div class="ai-chat-msg-content">${escapeHtml(content)}</div>`;
    }

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
}

function createStreamingMessage() {
    const container = document.getElementById('aiChatMessages');
    if (!container) return null;

    const welcome = container.querySelector('.ai-chat-welcome');
    if (welcome) welcome.style.display = 'none';

    const msg = document.createElement('div');
    msg.className = 'ai-chat-msg ai-chat-msg-assistant';
    msg.innerHTML = `<span class="ai-chat-msg-avatar">🧠</span><div class="ai-chat-msg-content ai-chat-streaming"><span class="ai-typing-indicator"><span></span><span></span><span></span></span></div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg.querySelector('.ai-chat-msg-content');
}

async function sendMessage(text) {
    if (_isStreaming || !text.trim()) return;
    _isStreaming = true;

    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSend');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    addMessage('user', text);
    _chatHistory.push({ role: 'user', content: text });

    const streamEl = createStreamingMessage();
    if (!streamEl) return;

    try {
        const portfolioContext = window.__portfolioContext || null;
        const response = await fetch('/api/finanzas/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                portfolioContext,
                conversationHistory: _chatHistory.slice(-10)
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            streamEl.innerHTML = formatMarkdown(fullResponse);

            const container = document.getElementById('aiChatMessages');
            if (container) container.scrollTop = container.scrollHeight;
        }

        streamEl.classList.remove('ai-chat-streaming');
        _chatHistory.push({ role: 'assistant', content: fullResponse });

    } catch (err) {
        console.error('[AI Chat] Error:', err);
        streamEl.innerHTML = '<span class="ai-chat-error">Error al conectar con el asistente. Inténtalo de nuevo.</span>';
        streamEl.classList.remove('ai-chat-streaming');
    } finally {
        _isStreaming = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatMarkdown(text) {
    let html = escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    // Lists
    html = html.replace(/^- (.+?)(?=<br>|$)/gm, '• $1');
    return html;
}

// ─── Auto-resize textarea ──────────────────────────────────────────────────

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initAIChat() {
    const { fab, panel } = createChatDOM();

    fab.addEventListener('click', () => toggleChat());

    document.getElementById('aiChatClose').addEventListener('click', () => toggleChat(false));

    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSend');

    sendBtn.addEventListener('click', () => {
        if (input) sendMessage(input.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input.value);
        }
    });

    input.addEventListener('input', () => autoResize(input));

    // Suggestion buttons
    panel.addEventListener('click', (e) => {
        const suggestion = e.target.closest('.ai-chat-suggestion');
        if (suggestion) {
            sendMessage(suggestion.dataset.msg);
        }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _chatOpen) toggleChat(false);
    });
}
