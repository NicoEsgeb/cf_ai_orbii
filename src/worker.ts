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
      const id = env.CHAT_SESSIONS.idFromName("global");
      const stub = env.CHAT_SESSIONS.get(id);
      return stub.fetch(request);
    }

    // For all non-API routes, serve static assets from /public.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export { ChatSession };
