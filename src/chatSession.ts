import type {
  Ai,
  DurableObject,
  DurableObjectState,
} from "@cloudflare/workers-types";
import type { Env } from "./worker";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type WorkersAiResponse = {
  response?: string;
};

type SessionState = {
  history: ChatMessage[];
  /** Optional study material to feed back into prompts. */
  studyText?: string;
};

const MAX_HISTORY_ENTRIES = 10;
const MAX_STUDY_TEXT_CHARS = 4000;
const SESSION_STORAGE_KEY = "session";
const FALLBACK_REPLY =
  "I ran into a hiccup reaching the study buddy brain. Please try again.";

export class ChatSession implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env & { AI: Ai }) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname === "/study-text") {
      return this.handleStudyText(request);
    }

    return this.handleChat(request);
  }

  private async handleChat(request: Request): Promise<Response> {
    let body: { message?: string };
    try {
      body = (await request.json()) as { message?: string };
    } catch {
      return json({ reply: "Please send a valid message." }, { status: 400 });
    }

    const userMessage = (body.message ?? "").toString().trim();
    if (!userMessage) {
      return json({ reply: "Please send a valid message." }, { status: 400 });
    }

    const sessionState = await this.getSessionState();
    const previousHistory = sessionState.history.slice(-MAX_HISTORY_ENTRIES);

    const truncatedStudyText = (sessionState.studyText ?? "").slice(0, MAX_STUDY_TEXT_CHARS);

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are Orbii, an ethereal, friendly study buddy. Explain concepts for beginners, ask gentle follow-up questions, and keep things encouraging.",
      },
    ];

    if (truncatedStudyText) {
      messages.push({
        role: "system",
        content:
          "The user provided the following study material (truncated if long). Use it as the main source when answering their questions:\n\n" +
          truncatedStudyText,
      });
    }

    messages.push(...previousHistory);
    messages.push({ role: "user", content: userMessage });

    let replyText = FALLBACK_REPLY;

    try {
      const aiResult = (await (this.env.AI as any).run(
        "@cf/meta/llama-3.1-8b-instruct",
        { messages },
      )) as WorkersAiResponse;

      replyText = (aiResult?.response ?? FALLBACK_REPLY).trim() || FALLBACK_REPLY;
    } catch (error) {
      console.error("ChatSession AI.run failed", error);
    }

    const updatedHistory: ChatMessage[] = [...previousHistory];
    updatedHistory.push({ role: "user", content: userMessage });
    updatedHistory.push({ role: "assistant", content: replyText });

    await this.saveSessionState({
      history: updatedHistory.slice(-MAX_HISTORY_ENTRIES),
      studyText: sessionState.studyText,
    });

    return json({ reply: replyText });
  }

  private async handleStudyText(request: Request): Promise<Response> {
    let body: { text?: unknown };
    try {
      body = (await request.json()) as { text?: unknown };
    } catch {
      return json({ ok: false, error: "Please send study text." }, { status: 400 });
    }

    const studyText = typeof body.text === "string" ? body.text.trim() : "";
    if (!studyText) {
      return json({ ok: false, error: "Please send study text." }, { status: 400 });
    }

    const sessionState = await this.getSessionState();
    await this.saveSessionState({
      history: sessionState.history,
      studyText,
    });

    return json({ ok: true });
  }

  private async getSessionState(): Promise<SessionState> {
    const stored = (await this.state.storage.get<SessionState>(SESSION_STORAGE_KEY)) ?? null;
    if (stored) {
      return {
        history: Array.isArray(stored.history) ? stored.history : [],
        studyText: stored.studyText,
      };
    }

    // Fallback for older deployments that only stored chat history.
    const legacyHistory =
      (await this.state.storage.get<ChatMessage[]>("history")) ?? [];

    return { history: legacyHistory }; // studyText defaults to undefined.
  }

  private async saveSessionState(state: SessionState): Promise<void> {
    await this.state.storage.put(SESSION_STORAGE_KEY, {
      history: state.history.slice(-MAX_HISTORY_ENTRIES),
      studyText: state.studyText,
    });
  }
}

function json(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}
