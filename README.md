# Echo AI — ChatGPT-style chat app (Alibaba Cloud powered)

A complete, self-hosted AI chat website: streaming responses, markdown + code
highlighting, multiple saved conversations, dark/light mode, and a mobile-
responsive layout — all connected to Alibaba Cloud's DashScope (Qwen) API
through its OpenAI-compatible endpoint.

## 1. Install

```bash
npm install
```

## 2. Add your API key

Rename `.env.example` to `.env` and paste in your real Alibaba Cloud
DashScope API key (get one at https://dashscope.console.aliyun.com/apiKey):

```
ALIBABA_API_KEY=sk-xxxxxxxxxxxxxxxx
ALIBABA_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ALIBABA_MODEL=qwen-plus
PORT=3000
```

If you're outside mainland China, DashScope's international endpoint is:
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1` — use that for
`ALIBABA_BASE_URL` if the default one returns errors.

## 3. Run it locally

```bash
npm start
```

Then open **http://localhost:3000**.

## How it works

- `server.js` — Express server with one route, `/api/chat`, that forwards
  your conversation to Alibaba's OpenAI-compatible `/chat/completions`
  endpoint with `stream: true`, and pipes the server-sent-events straight
  back to the browser. Your API key never reaches the browser.
- `public/` — the frontend: vanilla HTML/CSS/JS (no build step). Chat
  history is saved in the browser's `localStorage`, so conversations persist
  between visits on the same device/browser.
- Markdown rendering uses `marked.js`, code syntax highlighting uses
  `highlight.js`, both loaded from a CDN — no extra npm installs needed.

## Deploying later

When you're ready to put this on the internet, any Node.js host works.
Two of the simplest for a small project like this:

**Render.com** (free tier available)
1. Push this folder to a GitHub repo.
2. In Render: New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add `ALIBABA_API_KEY`, `ALIBABA_BASE_URL`, `ALIBABA_MODEL` as environment
   variables in Render's dashboard (don't upload your `.env` file).

**Railway.app**
1. Push to GitHub, then "Deploy from GitHub repo" in Railway.
2. Railway auto-detects Node.js and runs `npm start`.
3. Add the same three environment variables under the Variables tab.

In both cases: never commit your real `.env` file — only `.env.example`
should go into version control.

## Customizing

- Change the model in `.env` (`qwen-plus`, `qwen-turbo`, `qwen-max`, etc.)
- Colors/fonts live in `public/style.css` under the `:root`,
  `[data-theme="dark"]`, and `[data-theme="light"]` blocks.
- To add user accounts or a real database instead of `localStorage`, swap
  the persistence functions in `public/script.js` for calls to your own
  backend routes.
