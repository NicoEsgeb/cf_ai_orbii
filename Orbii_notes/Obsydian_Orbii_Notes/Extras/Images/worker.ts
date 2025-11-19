// src/worker.ts

export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("Hello from cf_ai_orbii Study Buddy Worker!", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  },
};
