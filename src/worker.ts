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
const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

type RoadmapNode = {
  id: string;
  title: string;
  summary: string;
  level: number;
};

type RoadmapEdge = {
  from: string;
  to: string;
  reason: string;
};

type RoadmapSection = {
  title: string;
  summary: string;
  steps: string[];
};

type RoadmapResponse = {
  topic: string;
  overview: string;
  nodes?: RoadmapNode[];
  edges?: RoadmapEdge[];
  sections?: RoadmapSection[];
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

    if (url.pathname === "/api/roadmap" && request.method === "POST") {
      return handleRoadmapRequest(request, env);
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

function buildRoadmapPrompt(topic: string): string {
  return [
    "You are Orbii, a friendly but expert curriculum designer building a self-paced mini-course for an absolute beginner.",
    "Design a modern learning roadmap the learner can actually follow step by step.",
    "Structure it as a path that goes through four phases: [FOUNDATIONS], [CORE SKILLS], [APPLICATIONS], [REFLECTION & NEXT STEPS].",
    "Each phase is one or more sections. Put the phase name in square brackets at the start of the section title.",
    "",
    "Use exactly this plain text format, one line per item:",
    "OVERVIEW: <1–2 sentence overview of what the learner will be able to do after finishing the roadmap>",
    "SECTION: <short section title with phase tag> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "",
    "Step format:",
    "- Each step must be a concrete 25–60 minute task starting with a verb.",
    "- For at least two steps in every section, append one high-quality resource in this exact pattern at the end of the step: [LINK: <short label> - https://...].",
    "- Prefer well-known beginner-friendly sources such as Khan Academy, 3Blue1Brown, MIT OCW, Brilliant, official docs, or other reputable sites.",
    "",
    "Rules:",
    "- Respond using ONLY plain text lines starting with OVERVIEW: or SECTION: (no bullet points, no numbering, no extra commentary).",
    "- Write 5 to 8 SECTION lines total, ordered from easiest concepts first to more advanced and project-style work last.",
    "- Each summary is one short sentence.",
    "- Each section has 3 to 5 steps.",
    "- Do not put the '|' or ';' characters inside titles, summaries, or step text. Use ';' only between steps.",
    "- Inside URLs, do not include '|' or ';'.",
    "- Include at least one small project-style section in the [APPLICATIONS] phase and one reflection / revision section in the [REFLECTION & NEXT STEPS] phase.",
    `Topic: ${topic}`,
    "Now write the OVERVIEW: line and the SECTION: lines.",
  ].join("\\n");
}

function parseRoadmapFromText(raw: string, topic: string): RoadmapResponse {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let overview = "";
  const sections: RoadmapSection[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (!overview && upper.startsWith("OVERVIEW:")) {
      overview = line.slice("OVERVIEW:".length).trim();
      continue;
    }

    if (upper.startsWith("SECTION:")) {
      const rest = line.slice("SECTION:".length).trim();
      if (!rest) continue;

      const parts = rest.split("|").map((part) => part.trim());
      const title = parts[0] ?? "";
      let summary = parts[1] ?? "";
      let stepsPart = parts[2] ?? "";

      if (!stepsPart && summary.includes(";")) {
        const summaryPieces = summary
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        summary = summaryPieces.shift() ?? "";
        if (!stepsPart && summaryPieces.length > 0) {
          stepsPart = summaryPieces.join(" ; ");
        }
      }

      if (!title) continue;

      const steps = stepsPart
        ? stepsPart
            .split(";")
            .map((step) => step.trim())
            .filter((step) => step.length > 0)
        : [];

      const hasSummary = summary.trim().length > 0;
      const hasSteps = steps.length > 0;
      if (!hasSummary && !hasSteps) continue;

      sections.push({
        title,
        summary,
        steps,
      });
    }
  }

  if (!overview) {
    overview = `A beginner-friendly roadmap for ${topic}.`;
  }

  if (sections.length === 0) {
    sections.push({
      title: `Getting started with ${topic}`,
      summary: `Kick off your learning about ${topic}.`,
      steps: [
        `Find a beginner-friendly introduction to ${topic} (article or video).`,
        `Note down 3–5 key ideas about ${topic}.`,
      ],
    });
  }

  return {
    topic,
    overview,
    sections,
  };
}

async function handleRoadmapRequest(request: Request, env: Env): Promise<Response> {
  let topic: string;
  try {
    const body = (await request.clone().json()) as { topic?: unknown };
    topic = typeof body.topic === "string" ? body.topic.trim() : "";
  } catch {
    return new Response(JSON.stringify({ error: "Missing topic" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!topic) {
    return new Response(JSON.stringify({ error: "Missing topic" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Generating roadmap for topic:", topic);

  let raw: string | undefined;
  try {
    const prompt = buildRoadmapPrompt(topic);
    const aiResult = (await (env.AI as any).run(CHAT_MODEL, {
      messages: [{ role: "user", content: prompt }],
    })) as { response?: string };

    const rawCandidate =
      typeof aiResult === "string"
        ? aiResult
        : (aiResult?.response ?? JSON.stringify(aiResult));
    raw = (rawCandidate ?? "").toString();

    const roadmap = parseRoadmapFromText(raw, topic);

    return new Response(JSON.stringify(roadmap), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Roadmap generation failed; raw output:", raw, error);
    return new Response(JSON.stringify({ error: "roadmap_generation_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
