export interface Env {
  ASSETS: Fetcher;
}

type ChatRequest = {
  message?: string;
};

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      let body: ChatRequest;
      try {
        body = (await request.json()) as ChatRequest;
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const userMessage = (body.message ?? "").toString().trim();
      if (!userMessage) {
        return json({ error: "Message is required" }, 400);
      }

      const reply = `Echo from Orbii: ${userMessage}`;
      return json({ reply });
    }

    // For all non-API routes, serve static assets from /public
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
