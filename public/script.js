// ---------- State ----------
let chats = JSON.parse(localStorage.getItem('echo_chats') || '{}');
let currentChatId = null;
let isStreaming = false;

// ---------- DOM ----------
const messagesEl = document.getElementById('messages');
const emptyStateEl = document.getElementById('emptyState');
const historyListEl = document.getElementById('historyList');
const composerForm = document.getElementById('composerForm');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const modelTag = document.getElementById('modelTag');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

marked.setOptions({ breaks: true });

// ---------- Theme ----------
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☾' : '☀';
  themeLabel.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
  localStorage.setItem('echo_theme', theme);
}
applyTheme(localStorage.getItem('echo_theme') || 'dark');

themeToggle.addEventListener('click', () => {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

// ---------- Sidebar (mobile) ----------
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('open');
});
sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
});

// ---------- Health check ----------
fetch('/api/health')
  .then((r) => r.json())
  .then((data) => {
    modelTag.textContent = data.keyConfigured ? `Model: ${data.model}` : 'No API key configured';
  })
  .catch(() => { modelTag.textContent = 'Server unreachable'; });

// ---------- Persistence ----------
function saveChats() {
  localStorage.setItem('echo_chats', JSON.stringify(chats));
}

function createChat() {
  const id = 'c' + Date.now();
  chats[id] = { id, title: 'New chat', messages: [] };
  currentChatId = id;
  saveChats();
  renderHistory();
  renderMessages();
}

function deleteChat(id, evt) {
  evt.stopPropagation();
  delete chats[id];
  saveChats();
  if (currentChatId === id) {
    const remaining = Object.keys(chats);
    currentChatId = remaining.length ? remaining[remaining.length - 1] : null;
  }
  if (!currentChatId) createChat();
  renderHistory();
  renderMessages();
}

function switchChat(id) {
  currentChatId = id;
  renderHistory();
  renderMessages();
  if (window.innerWidth <= 820) {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  }
}

// ---------- Rendering ----------
function renderHistory() {
  historyListEl.innerHTML = '';
  const ids = Object.keys(chats).sort((a, b) => (a < b ? 1 : -1));
  ids.forEach((id) => {
    const chat = chats[id];
    const item = document.createElement('div');
    item.className = 'history-item' + (id === currentChatId ? ' active' : '');
    item.innerHTML = `<span>${escapeHtml(chat.title || 'New chat')}</span><button class="delete-btn" title="Delete chat">✕</button>`;
    item.addEventListener('click', () => switchChat(id));
    item.querySelector('.delete-btn').addEventListener('click', (e) => deleteChat(id, e));
    historyListEl.appendChild(item);
  });
}

function renderMessages() {
  const chat = chats[currentChatId];
  messagesEl.innerHTML = '';
  if (!chat || chat.messages.length === 0) {
    messagesEl.appendChild(emptyStateEl);
    return;
  }
  chat.messages.forEach((m) => appendMessageEl(m.role, m.content));
  scrollToBottom();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  const html = marked.parse(text || '');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  wrapper.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
    const pre = block.parentElement;
    const container = document.createElement('div');
    container.className = 'code-block';
    pre.parentNode.insertBefore(container, pre);
    container.appendChild(pre);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(block.textContent);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
    });
    container.appendChild(copyBtn);
  });
  return wrapper.innerHTML;
}

function appendMessageEl(role, content) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You' : '◎';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content);
  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  return bubble;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Auto-resize textarea ----------
promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composerForm.requestSubmit();
  }
});

// ---------- Sending messages ----------
composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = promptInput.value.trim();
  if (!text || isStreaming) return;

  if (!currentChatId) createChat();
  const chat = chats[currentChatId];

  if (chat.messages.length === 0) {
    chat.title = text.slice(0, 40);
  }
  chat.messages.push({ role: 'user', content: text });
  saveChats();
  renderHistory();

  if (messagesEl.contains(emptyStateEl)) messagesEl.removeChild(emptyStateEl);
  appendMessageEl('user', text);
  scrollToBottom();

  promptInput.value = '';
  promptInput.style.height = 'auto';

  // typing indicator
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `<div class="avatar">◎</div><div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(row);
  scrollToBottom();
  const bubble = row.querySelector('.bubble');

  isStreaming = true;
  sendBtn.disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chat.messages }),
    });

    if (!response.body) throw new Error('No response stream from server.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let firstToken = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.replace(/^data:\s*/, '');
        if (payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          if (json.error) {
            fullText += `\n\n**Error:** ${json.error}`;
            bubble.innerHTML = renderMarkdown(fullText);
            continue;
          }
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            if (firstToken) {
              bubble.innerHTML = '';
              firstToken = false;
            }
            fullText += delta;
            bubble.innerHTML = renderMarkdown(fullText);
            scrollToBottom();
          }
        } catch (_) {
          // ignore malformed lines
        }
      }
    }

    if (!fullText) {
      fullText = '*(no response received — check your API key and try again)*';
      bubble.innerHTML = renderMarkdown(fullText);
    }

    chat.messages.push({ role: 'assistant', content: fullText });
    saveChats();
  } catch (err) {
    bubble.innerHTML = renderMarkdown(`**Connection error:** ${err.message}`);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    promptInput.focus();
  }
});

// ---------- Init ----------
newChatBtn.addEventListener('click', createChat);

(function init() {
  const ids = Object.keys(chats);
  if (ids.length === 0) {
    createChat();
  } else {
    currentChatId = ids.sort((a, b) => (a < b ? 1 : -1))[0];
    renderHistory();
    renderMessages();
  }
})();
