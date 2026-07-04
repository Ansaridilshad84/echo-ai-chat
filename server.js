require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ALIBABA_API_KEY = process.env.ALIBABA_API_KEY;
const ALIBABA_BASE_URL = process.env.ALIBABA_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const ALIBABA_MODEL = process.env.ALIBABA_MODEL || 'qwen-plus';

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

app.listen(PORT, () => {
  console.log(`\n✔ AI chat server running at http://localhost:${PORT}`);
  if (!ALIBABA_API_KEY) {
    console.log('⚠ ALIBABA_API_KEY is not set. Add it to your .env file.\n');
  }
});
