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

    // Avoid a noisy error when the browser auto-requests /favicon.ico.
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      // Try to read the incoming JSON body. If it is missing or malformed,
      // return a friendly 400 error to the client.
      let body: ChatRequest;
      try {
        body = (await request.json()) as ChatRequest;
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }

      const userMessage = (body.message ?? "").toString().trim();
      if (!userMessage) {
        return json({ error: "Invalid request body" }, 400);
      }

      // Chat-style payload: system prompt to set the Orbii persona, then the user's message.
      const messages = [
        {
          role: "system",
          content:
            "You are Orbii, an ethereal study buddy who answers clearly, concisely, and kindly to help someone learn.",
        },
        { role: "user", content: userMessage },
      ];

      try {
        // Call Workers AI using the bound model. The response contains the assistant text.
        const aiResponse = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct",
          { messages },
        );

        const replyText =
          // Preferred field returned by Workers AI chat models.
          (aiResponse as { response?: string }).response ??
          // Fallback in case the shape changes or a different model is used.
          (aiResponse as { result?: string }).result ??
          "Sorry, I couldn't generate a reply.";

        return json({ reply: replyText });
      } catch (error) {
        // Any failure talking to Workers AI returns a 500 with a safe error message.
        console.error("AI request failed", error);
        return json({ error: "AI request failed" }, 500);
      }
    }

    // For all non-API routes, serve static assets from /public.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
