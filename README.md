# Orbii – ethereal study buddy on Cloudflare Workers AI

Orbii is a browser-based study buddy with a floating orb interface and a slide-up chat panel. Learners paste in the text they are studying, Orbii saves that material, and the orb replies with beginner-friendly explanations plus gentle nudges to keep going. Everything runs inside Cloudflare’s stack: a Worker serves the UI and API routes, a Durable Object keeps per-session memory, and Workers AI powers every reply.

This repo is my optional submission for the Cloudflare Software Engineering Internship assignment. The goal is to show how a full mini-product can live entirely on Cloudflare, use Workers AI responsibly, and ship with clear docs for review.

Each browser tab gets its own stateful chat session. Orbii remembers the current study text, the latest chat turns, and whether you toggled quiz mode, so reloading the page still brings back the same conversation.

## Live demo
- https://cf_ai_orbii.nico-esg-rey.workers.dev
- Hosted on Cloudflare’s Workers free plan with Workers AI, so the LLM calls may be rate-limited after heavy usage.

## How this meets the assignment requirements
- **LLM usage** – All chat replies run through Workers AI’s `@cf/meta/llama-3.1-8b-instruct` model via the `env.AI.run(...)` binding in `src/chatSession.ts`.
- **Workflow / coordination** – The `ChatSession` Durable Object stores study text, rolling history, and composes the message array before every model call so each session stays coherent.
- **User input via chat** – A minimal HTML/CSS/JS UI (floating orb + slide-up chat panel) is served from static assets in `public/` by `src/worker.ts`, letting learners paste text and type questions directly in the browser.
- **Memory / state** – Durable Object instances are keyed by the browser’s `sessionId`, preserving study text, a trimmed chat transcript, and quiz prompts across refreshes.

## Architecture
1. **Browser UI** – `public/index.html`, `style.css`, and `app.js` render the orb, study textarea, “Save to Orbii” button, chat input, and “Quiz me on this” shortcut.
2. **Cloudflare Worker (`src/worker.ts`)** – Routes `/` to the static assets, proxies `/api/chat` and `/api/study-text` POST requests, and gets the correct Durable Object stub based on the `sessionId`.
3. **Durable Object (`src/chatSession.ts`)** – Stores each session’s study text + chat history, builds the system/user message list, and calls `env.AI.run` with Workers AI.
4. **Workers AI** – The Llama 3.1 8B Instruct model sends the final reply, which is immediately streamed back to the browser UI.

```
Browser UI (orb, textarea, chat)
  ↓  fetch /api/study-text + /api/chat
Cloudflare Worker (src/worker.ts)
  ↓  get Durable Object stub per session
ChatSession Durable Object (src/chatSession.ts)
  ↓  env.AI.run messages array
Workers AI – Llama 3.1 8B Instruct
```

## Tech stack
- Cloudflare Workers (TypeScript entry point in `src/worker.ts`).
- Durable Objects with SQLite-backed storage through the `new_sqlite_classes` migration.
- Workers AI using `@cf/meta/llama-3.1-8b-instruct`.
- Static frontend written in vanilla HTML, CSS, and JavaScript.

## Features
- Floating orb + slide-up chat UI that works on desktop and mobile.
- Paste study text and save it per session so Orbii can stay grounded.
- Conversation replies that cite the saved study text whenever possible.
- “Quiz me on this” button that injects a prompt to start one-question-at-a-time quizzes.
- Durable Object-managed memory so each session keeps history even after refreshes.

## Running locally
1. `npm install`
2. `npm run dev` (runs `wrangler dev` with Miniflare at http://localhost:8787)
3. Paste study text and chat with Orbii in the browser.

`wrangler dev` connects to the bound Workers AI resource, so local testing still uses your Cloudflare account’s free Workers AI tier. Make sure the `AI` binding exists in your Cloudflare account before running the dev server.

## Deploying to Cloudflare
1. `npx wrangler login` to authenticate with your Cloudflare account.
2. Confirm `wrangler.toml` contains the `durable_objects` block for `ChatSession` and the `migrations` entry for `new_sqlite_classes` (already included in this repo).
3. `npm run deploy` (or `npx wrangler deploy`) to publish the Worker and Durable Object.
4. After deploy, Wrangler prints the workers.dev URL (already configured as `cf_ai_orbii.nico-esg-rey.workers.dev`), which matches the live demo link above.

## Limitations & future work
- PDF upload plus lightweight text extraction so learners can bring in longer references.
- Voice input using Cloudflare Realtime or another Workers-compatible speech API.
- Smarter quiz modes with spaced repetition or difficulty bands.

This is the first MVP submitted for the internship prompt, and I plan to keep iterating as I test Orbii with more study sessions.
