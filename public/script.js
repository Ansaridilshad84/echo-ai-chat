// ---------- State ----------
let chats = JSON.parse(localStorage.getItem('echo_chats') || '{}');
let currentChatId = null;
let isStreaming = false;
let currentMode = 'chat';

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
const modePills = document.querySelectorAll('.mode-pill');
const exportBtn = document.getElementById('exportBtn');

modePills.forEach((pill) => {
  pill.addEventListener('click', () => {
    modePills.forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    currentMode = pill.dataset.mode;
    const placeholders = {
      chat: 'Message Echo…',
      image: 'Describe the image you want…',
      video: 'Describe the video you want…',
    };
    promptInput.placeholder = placeholders[currentMode];
  });
});

exportBtn.addEventListener('click', () => {
  const chat = chats[currentChatId];
  if (!chat || chat.messages.length === 0) return;
  const lines = chat.messages.map((m) => `${m.role === 'user' ? 'You' : 'Echo'}: ${m.content}`);
  const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(chat.title || 'chat').replace(/[^a-z0-9]/gi, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

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

  if (currentMode === 'image' || currentMode === 'video') {
    await handleMediaGeneration(currentMode, text, chat);
    return;
  }

  await handleChatMessage(chat);
});

async function handleMediaGeneration(kind, prompt, chat) {
  isStreaming = true;
  sendBtn.disabled = true;

  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `<div class="avatar">◎</div><div class="bubble"><div class="media-progress"><div class="spinner"></div><span>Generating ${kind}… this can take up to a minute</span></div></div>`;
  messagesEl.appendChild(row);
  scrollToBottom();
  const bubble = row.querySelector('.bubble');

  try {
    const endpoint = kind === 'image' ? '/api/generate-image' : '/api/generate-video';
    const startRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const startData = await startRes.json();
    if (startData.error || !startData.taskId) {
      throw new Error(startData.error || 'Could not start the generation task.');
    }

    let result = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`/api/task/${startData.taskId}`);
      const pollData = await pollRes.json();

      if (pollData.status === 'SUCCEEDED' && pollData.mediaUrl) {
        result = pollData.mediaUrl;
        break;
      }
      if (pollData.status === 'FAILED') {
        throw new Error(pollData.error || 'Generation failed.');
      }
      bubble.querySelector('span').textContent = `Generating ${kind}… (${pollData.status.toLowerCase()})`;
    }

    if (!result) throw new Error('Generation timed out. Try again with a simpler prompt.');

    const mediaTag = kind === 'image'
      ? `<img src="${result}" alt="${escapeHtml(prompt)}" loading="lazy" />`
      : `<video src="${result}" controls></video>`;
    bubble.innerHTML = `<div class="media-result">${mediaTag}<br><a class="media-download" href="${result}" download target="_blank" rel="noopener">Download ${kind}</a></div>`;

    chat.messages.push({ role: 'assistant', content: `[Generated ${kind}: ${result}]` });
    saveChats();
  } catch (err) {
    bubble.innerHTML = renderMarkdown(`**Error:** ${err.message}`);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    promptInput.focus();
    scrollToBottom();
  }
}

async function handleChatMessage(chat) {
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
}

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
