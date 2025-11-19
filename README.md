# cf_ai_orbii

## Overview
Orbii is an ethereal, floating “study buddy” orb that lives right inside the browser. Learners paste in study material, ask questions, and Orbii guides them with friendly encouragement plus occasional follow-ups.

The UI is a lightweight widget served directly from a Cloudflare Worker, so it can be deployed anywhere the Worker runs. Chat replies come from Workers AI (Llama 3.x) while Durable Objects keep each session’s notes and history in sync.

Each browser session gets its own long-lived memory, letting Orbii remember the uploaded study text and the full conversation even after a refresh or tab reopen.

## How this meets the Cloudflare AI assignment
- **LLM** – Uses Workers AI via the `AI` binding to call `@cf/meta/llama-3.1-8b-instruct` for every reply.
- **Workflow / coordination** – A `ChatSession` Durable Object orchestrates study text storage, chat history, and the actual Workers AI calls.
- **User input** – The Worker serves a browser-based study panel (textarea) plus a chat box, so learners can paste context and type follow-up questions.
- **Memory / state** – Durable Object instances persist the latest study text and rolling conversation history, keyed by the browser’s `sessionId`.

## Architecture
- **Frontend** – Static assets in `public/` (`index.html`, `style.css`, `app.js`) are returned by the Worker for all non-API routes.
- **Worker backend (`src/worker.ts`)**
  - `GET /` → serves the UI.
  - `POST /api/study-text` → forwards study text to a Durable Object for the current session.
  - `POST /api/chat` → bundles recent memory + study text, forwards to the Durable Object, and streams the AI reply back to the browser.
- **Durable Object (`src/chatSession.ts`)**
  - Stores `sessionId`, latest study text, conversation history, and an optional short summary sent to the LLM.
  - Handles `/study-text` to persist new material.
  - Handles chat requests by composing the prompt, calling Workers AI, and trimming history.
- **Workers AI** – Invoked through the `env.AI` binding with a Llama 3.x instruct model (currently `@cf/meta/llama-3.1-8b-instruct`).

## State and memory
Every browser pulls or creates a `sessionId` via `localStorage`. That ID is sent with each request so the Worker can route the call to the matching Durable Object instance. The Durable Object then:
- Stores the full study text (or the latest pasted block) for that session.
- Keeps the rolling chat history and uses it, plus the study text, when building the prompt for Workers AI.
- Returns the same data after refreshes, so the learner keeps their context unless localStorage is cleared.

## Quickstart
- **Prerequisites**
  - Node.js 18+ (or the version you normally use for Workers projects)
  - Cloudflare account with Workers AI enabled
  - Wrangler CLI installed (`npm install -g wrangler` or use `npx wrangler`)
- `npm install`
- Ensure your Cloudflare account has Workers AI enabled.
- In Wrangler (or the Cloudflare dashboard) configure a binding named `AI` and a Durable Object namespace `CHAT_SESSIONS` (already referenced in `wrangler.toml`).
- Run `npm run dev` to start `wrangler dev` at http://localhost:8787.

## Deployment
- Run `npx wrangler login` once to authenticate.
- Deploy with `npm run deploy` (or `npx wrangler deploy`).
- In the Cloudflare dashboard, confirm the `AI` binding and `CHAT_SESSIONS` Durable Object namespace exist and match the names in `wrangler.toml`.

## Project status / future work
- [x] Chat with Workers AI
- [x] Per-session memory with Durable Objects
- [x] Paste-in study text that conditions responses
- [ ] PDF ingestion (future)
- [ ] Voice input (future)
