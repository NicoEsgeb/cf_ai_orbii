import type {
  Ai,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
import { ChatSession } from "./chatSession";

export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  CHAT_SESSIONS: DurableObjectNamespace;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Avoid a noisy error when the browser auto-requests /favicon.ico.
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      let body: { message?: unknown; sessionId?: unknown };
      try {
        body = (await request.clone().json()) as {
          message?: unknown;
          sessionId?: unknown;
        };
      } catch {
        return invalidMessageResponse();
      }

      const message =
        typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        return invalidMessageResponse();
      }

      const sessionId = normalizeSessionId(body.sessionId);

      console.log("Orbii chat request for session:", sessionId);

      const stub = getChatSessionStub(env, sessionId);
      return stub.fetch(request);
    }

    if (url.pathname === "/api/study-text" && request.method === "POST") {
      let body: { sessionId?: unknown; text?: unknown };
      try {
        body = (await request.clone().json()) as {
          sessionId?: unknown;
          text?: unknown;
        };
      } catch {
        return invalidStudyTextResponse();
      }

      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        return invalidStudyTextResponse();
      }

      const sessionId = normalizeSessionId(body.sessionId);
      const stub = getChatSessionStub(env, sessionId);

      console.log("Orbii study text update for session:", sessionId);

      const doRequest = new Request("https://session/study-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      return stub.fetch(doRequest);
    }

    // For all non-API routes, serve static assets from /public.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export { ChatSession };

function invalidMessageResponse(): Response {
  return new Response(JSON.stringify({ reply: "Please send a valid message." }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function invalidStudyTextResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: "Please send study text." }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeSessionId(sessionId: unknown): string {
  if (typeof sessionId === "string" && sessionId.trim()) {
    return sessionId.trim();
  }

  return "anonymous";
}

function getChatSessionStub(env: Env, sessionId: string) {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
}
