/**
 * Cloudflare Worker entry point that serves Orbii's UI and API routes.
 * Validates browser requests, forwards chat/study actions to the right Durable Object,
 * and falls back to static assets for every other path.
 */
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

const MAX_STUDY_TEXT_LENGTH = 20000;

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

      const rawSessionId =
        typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const text = typeof body.text === "string" ? body.text.trim() : "";

      if (!rawSessionId) {
        return invalidStudyTextResponse("Missing session ID.");
      }

      if (!text) {
        return invalidStudyTextResponse();
      }

      if (text.length > MAX_STUDY_TEXT_LENGTH) {
        return invalidStudyTextResponse("Study text is too long.");
      }

      const sessionId = normalizeSessionId(rawSessionId);
      console.log("Orbii study text update for session:", sessionId);

      const stub = getChatSessionStub(env, sessionId);
      const doRequest = new Request("https://session/study-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      try {
        const doResponse = await stub.fetch(doRequest);
        if (!doResponse.ok) {
          console.error("ChatSession study text error:", doResponse.status);
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Could not save study text.",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const payload = await doResponse.json();
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("ChatSession study text failed", error);
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Could not save study text.",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
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

function invalidStudyTextResponse(message = "Please send study text."): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
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
