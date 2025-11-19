import type {
  Ai,
  DurableObject,
  DurableObjectState,
} from "@cloudflare/workers-types";
import type { Env } from "./worker";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type WorkersAiResponse = {
  response?: string;
};

const MAX_HISTORY_ENTRIES = 10;
const FALLBACK_REPLY =
  "I ran into a hiccup reaching the study buddy brain. Please try again.";

export class ChatSession implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env & { AI: Ai }) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

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

    const previousHistory =
      ((await this.state.storage.get<ChatMessage[]>("history")) ?? []).slice(-MAX_HISTORY_ENTRIES);

    const messages = [
      {
        role: "system",
        content:
          "You are Orbii, an ethereal, friendly study buddy. Explain concepts for beginners, ask gentle follow-up questions, and keep things encouraging.",
      },
      ...previousHistory,
      { role: "user", content: userMessage },
    ];

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

    const updatedHistory = [
      ...previousHistory,
      { role: "user", content: userMessage },
      { role: "assistant", content: replyText },
    ].slice(-MAX_HISTORY_ENTRIES);

    await this.state.storage.put("history", updatedHistory);

    return json({ reply: replyText });
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
