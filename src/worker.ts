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

type NormalizedTopic = {
  raw: string;
  key: string;
  display: string;
  wasCorrected: boolean;
};

function normalizeTopic(rawTopic: string): NormalizedTopic {
  const raw = (rawTopic || "").trim();

  const lower = raw.toLowerCase();
  const collapsedSpaces = lower.replace(/\s+/g, " ").trim();
  const collapsedRepeats = collapsedSpaces.replace(/([a-z])\1{2,}/g, "$1");

  const key = collapsedRepeats;
  const display = collapsedRepeats
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const wasCorrected =
    raw.length > 0 &&
    (raw.toLowerCase().trim() !== collapsedRepeats || raw.trim() !== display);

  return { raw, key, display: display || raw || "Topic", wasCorrected };
}

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
  canonicalTopic?: string;
  originalTopic?: string;
  normalizedKey?: string;
  corrected?: boolean;
  correctionNote?: string | null;
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
    "You are Orbii, a friendly but expert curriculum designer creating a self-paced course for an absolute beginner.",
    "Design a modern learning roadmap that the learner can follow in order.",
    "Use a fixed course skeleton so that the structure is always the same for any topic.",
    "",
    "Output format:",
    "OVERVIEW: <1-2 sentence overview of what the learner will be able to do after finishing the roadmap>",
    "SECTION: <[FOUNDATIONS] short section title> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "SECTION: <[FOUNDATIONS] short section title> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "SECTION: <[CORE SKILLS] short section title> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "SECTION: <[CORE SKILLS] short section title> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "SECTION: <[PROJECT] short section title> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "SECTION: <[NEXT STEPS] short section title> | <one-sentence summary> | <step 1> ; <step 2> ; <step 3> ; <step 4>",
    "",
    "Hard rules:",
    "- You MUST output exactly one OVERVIEW line and exactly six SECTION lines, in that order.",
    "- The six SECTION lines MUST be, in this order: [FOUNDATIONS] ..., [FOUNDATIONS] ..., [CORE SKILLS] ..., [CORE SKILLS] ..., [PROJECT] ..., [NEXT STEPS] ....",
    "- Each SECTION line MUST have exactly four steps, separated by ';'.",
    "- Do NOT output any extra text, headings, numbering, or commentary.",
    "- Each summary is exactly one short sentence.",
    "- Each section has exactly four steps.",
    "- Each step starts with a verb and describes a 25-60 minute learning activity.",
    "- You MAY optionally add one resource link at the end of a step, using this format: [LINK: Label for learner - https://full-url-here.com/path].",
    "- If you add a link, it must be inside square brackets exactly in that format.",
    "- Do not put the characters '|' or ';' inside titles, summaries, or step text. Use '|' only to separate title and summary, and ';' only to separate steps.",
    "",
    `Topic: ${topic}`,
    "Now write the OVERVIEW line and the six SECTION lines.",
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
  let rawTopic: string;
  try {
    const body = (await request.clone().json()) as { topic?: unknown };
    rawTopic = typeof body.topic === "string" ? body.topic : "";
  } catch {
    return new Response(JSON.stringify({ error: "Missing topic" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalized = normalizeTopic(rawTopic || "Untitled topic");
  if (!normalized.key.trim()) {
    return new Response(JSON.stringify({ error: "Missing topic" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const topicForPrompt = normalized.display;

  console.log("Generating roadmap for topic:", normalized.key);

  let raw: string | undefined;
  try {
    const prompt = buildRoadmapPrompt(topicForPrompt);
    const aiResult = (await (env.AI as any).run(CHAT_MODEL, {
      prompt,
      temperature: 0,
      max_tokens: 900,
    })) as { response?: string };

    const rawCandidate =
      typeof aiResult === "string"
        ? aiResult
        : (aiResult?.response ?? JSON.stringify(aiResult));
    raw = (rawCandidate ?? "").toString();

    const roadmap = parseRoadmapFromText(raw, normalized.display);
    const responsePayload: RoadmapResponse = {
      ...roadmap,
      topic: normalized.display,
      canonicalTopic: normalized.display,
      originalTopic: normalized.raw,
      normalizedKey: normalized.key,
      corrected: normalized.wasCorrected,
      correctionNote: normalized.wasCorrected
        ? `Showing roadmap for "${normalized.display}" (you typed "${normalized.raw}").`
        : null,
    };

    return new Response(JSON.stringify(responsePayload), {
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
