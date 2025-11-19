::up [[Atlas - Initial Node]]

# What's Orbii?
#### Core product idea

***Orbii*** is a **desktop-friendly web app** (opened in the browser) that will help the user study as a *companion*:

- On screen there is an **ethereal, floating ball** UI element, not a windows... just the ethereal ball that will *suck pdfs (UI windows will be optional)*.
  - It sits on the screen (e.g., top-left), glowing softly.
  - Clicking it opens/closes a **chat panel**.

- ***Orbii***  can “swallow” a **PDF or study content**:
  - First *MVP* can be just *pasted text* or uploaded content that gets stored.
  - Ideally, later it can parse PDFs (if feasible within Cloudflare Workers constraints).

- Once the content is loaded, the user can:
  1. Ask questions about the document.
  2. Request explanations of sections.
  3. Ask for summaries, examples, diagrams-in-words, etc.
  4. Be quizzed by the Study Buddy (it can ask *me* questions).
  5. Have a conversation about the topic with the Study BUddy

- The app must have **memory**:
  - Stores the loaded document content (or extracted text).
  - Keeps track of the conversation history and maybe a short summary of what I’m studying.
  - Uses this memory to make responses context-aware and to ask follow-up questions.

- The UI should be:
  - Simple and clean (a basic web app is enough).
  - Focused on the floating ball + chat experience, not over-engineered.

---

## Technical constraints and preferences

I want you to help me design and build this **on Cloudflare**, using a setup that would look good to Cloudflare engineers reviewing my application, and something that could be scalable :

- **Runtime / backend:**
  - Cloudflare **Workers** (TypeScript preferred).
  - **Durable Objects** for stateful chat sessions and document memory.
  - **Workers AI** for the LLM (e.g., Llama 3.3 model), unless you have a strong reason to suggest an external LLM endpoint.

- **Frontend:**
  - Minimal **HTML/CSS/JavaScript** chat UI that I can open on desktop.
  - The floating ethereal ball + slide-up chat panel can be built with simple CSS and JS (no heavy framework required for MVP, but we can discuss optional React if justified).

- **State / memory:**
  - Use a **Durable Object** (or a similar Cloudflare primitive) to:
    - Persist “session” state (document text, summary, conversation history).
    - Act as a coordinator between:
      - user input
      - LLM prompts
      - stored memory.

- **Repository:**
  - I will create a GitHub repository named something like `cf_ai_study_buddy` (we can refine the name).
  - You must treat this as a **real repo project**:
    - Propose a clear folder structure.
    - Suggest file names and responsibilities (e.g. `src/worker.ts`, `src/chatSession.ts`, `public/index.html`, etc.).
    - Remember to plan for `README.md` and `PROMPTS.md`.

- **AI collaboration:**
  - Assume you are connected to this repo as a “coding agent” (like Codex / ChatGPT 5 in a code editor).
  - You should help me:
    - Design the architecture.
    - Generate and refine code.
    - Write documentation (README, comments).
    - Keep track of prompts that I should paste into `PROMPTS.md`.
