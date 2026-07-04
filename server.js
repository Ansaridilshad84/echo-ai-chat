require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ALIBABA_API_KEY = process.env.ALIBABA_API_KEY;
const ALIBABA_BASE_URL = process.env.ALIBABA_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const ALIBABA_MODEL = process.env.ALIBABA_MODEL || 'qwen-plus';
const ALIBABA_IMAGE_MODEL = process.env.ALIBABA_IMAGE_MODEL || 'wanx2.1-t2i-turbo';
const ALIBABA_VIDEO_MODEL = process.env.ALIBABA_VIDEO_MODEL || 'wanx2.1-t2v-turbo';

// Derive the plain DashScope host from the OpenAI-compatible base URL,
// e.g. "https://xxx.aliyuncs.com/compatible-mode/v1" -> "https://xxx.aliyuncs.com"
function dashscopeHost() {
  return ALIBABA_BASE_URL.replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/v1\/?$/, '');
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(ALIBABA_API_KEY),
    model: ALIBABA_MODEL,
  });
});

// Main streaming chat endpoint
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!ALIBABA_API_KEY) {
    return res.status(500).json({
      error: 'Server is missing ALIBABA_API_KEY. Add it to your .env file and restart the server.',
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'A non-empty "messages" array is required.' });
  }

  // Set up SSE headers so the browser can read the stream as it arrives
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const upstream = await fetch(`${ALIBABA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALIBABA_API_KEY}`,
      },
      body: JSON.stringify({
        model: ALIBABA_MODEL,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => 'Unknown upstream error');
      res.write(`data: ${JSON.stringify({ error: `Alibaba API error: ${errText}` })}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Alibaba's OpenAI-compatible stream sends "data: {...}\n\n" lines, same as OpenAI.
      // We just forward them through as-is to the client.
      res.write(chunk);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Server error while contacting the AI API.' })}\n\n`);
    res.end();
  }
});

// ---------- Image generation (text-to-image, async task) ----------
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!ALIBABA_API_KEY) return res.status(500).json({ error: 'Missing ALIBABA_API_KEY on the server.' });
  if (!prompt) return res.status(400).json({ error: 'A "prompt" is required.' });

  try {
    const submit = await fetch(`${dashscopeHost()}/api/v1/services/aigc/text2image/image-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALIBABA_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: ALIBABA_IMAGE_MODEL,
        input: { prompt },
        parameters: { size: '1024*1024', n: 1 },
      }),
    });
    const data = await submit.json();
    const taskId = data.output?.task_id;
    if (!taskId) return res.status(500).json({ error: data.message || 'Failed to start image generation task.' });
    res.json({ taskId });
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: 'Server error while starting image generation.' });
  }
});

// ---------- Video generation (text-to-video, async task) ----------
app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body;
  if (!ALIBABA_API_KEY) return res.status(500).json({ error: 'Missing ALIBABA_API_KEY on the server.' });
  if (!prompt) return res.status(400).json({ error: 'A "prompt" is required.' });

  try {
    const submit = await fetch(`${dashscopeHost()}/api/v1/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALIBABA_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: ALIBABA_VIDEO_MODEL,
        input: { prompt },
        parameters: {},
      }),
    });
    const data = await submit.json();
    const taskId = data.output?.task_id;
    if (!taskId) return res.status(500).json({ error: data.message || 'Failed to start video generation task.' });
    res.json({ taskId });
  } catch (err) {
    console.error('Video generation error:', err);
    res.status(500).json({ error: 'Server error while starting video generation.' });
  }
});

// ---------- Poll task status (shared by image + video) ----------
app.get('/api/task/:taskId', async (req, res) => {
  if (!ALIBABA_API_KEY) return res.status(500).json({ error: 'Missing ALIBABA_API_KEY on the server.' });
  try {
    const response = await fetch(`${dashscopeHost()}/api/v1/tasks/${req.params.taskId}`, {
      headers: { Authorization: `Bearer ${ALIBABA_API_KEY}` },
    });
    const data = await response.json();
    const status = data.output?.task_status || 'UNKNOWN';

    // Different task types return the media URL in slightly different places.
    const mediaUrl =
      data.output?.results?.[0]?.url ||
      data.output?.video_url ||
      data.output?.result_url ||
      null;

    res.json({
      status,
      mediaUrl,
      error: status === 'FAILED' ? (data.output?.message || 'Generation failed.') : null,
    });
  } catch (err) {
    console.error('Task poll error:', err);
    res.status(500).json({ error: 'Server error while checking task status.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n✔ AI chat server running at http://localhost:${PORT}`);
  if (!ALIBABA_API_KEY) {
    console.log('⚠ ALIBABA_API_KEY is not set. Add it to your .env file.\n');
  }
});
