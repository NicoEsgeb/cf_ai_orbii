import type { Ai } from "@cloudflare/workers-types";

export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
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

    // Avoid a noisy error when the browser auto-requests /favicon.ico
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

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

      // Chat format for the model: start with a clear system prompt, then the user message.
      const messages = [
        {
          role: "system",
          content:
            "You are Orbii, an ethereal study buddy that explains things clearly to a student. Keep answers concise, friendly, and focused on learning.",
        },
        { role: "user", content: userMessage },
      ];

      // Call Workers AI via the bound model. The response object includes a `response`
      // field containing the generated text.
      const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages,
      });

      const replyText =
        // Preferred field returned by Workers AI chat models.
        (aiResponse as { response?: string }).response ??
        // Fallback in case the shape changes or a different model is used.
        (aiResponse as { result?: string }).result ??
        "Sorry, I couldn't generate a reply.";

      return json({ reply: replyText });
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
