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
  cleaned: string;
  display: string;
  wasCorrected: boolean;
};

type AiChatMessage = { role: "system" | "assistant" | "user"; content: string };

type RoadmapCategory =
  | "FOUNDATIONS"
  | "CORE_SKILLS"
  | "PROJECT"
  | "NEXT_STEPS"
  | "BRANCH"
  | "OTHER";

type RoadmapSection = {
  title: string;
  summary: string;
  steps: string[];
  category?: RoadmapCategory;
  branchLabel?: string;
  branchKey?: string;
  index?: number;
};

type RoadmapResponse = {
  canonicalTopic: string;
  correctionNote?: string;
  overview: string;
  sections: RoadmapSection[];
  nodes?: RoadmapNode[];
  edges?: RoadmapEdge[];
};

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

function normalizeTopic(rawTopic: string): NormalizedTopic {
  const raw = (rawTopic ?? "").toString();
  const trimmed = raw.trim();
  const collapsed = trimmed.replace(/\s+/g, " ");
  const lower = collapsed.toLowerCase();
  const display = lower
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const wasCorrected =
    raw !== display ||
    raw.toLowerCase().trim() !== lower ||
    raw.trim() !== collapsed;

  return {
    raw,
    cleaned: collapsed,
    display: display || collapsed || "Topic",
    wasCorrected,
  };
}

function buildCanonicalTopicMessages(
  rawTopic: string,
  normalized: NormalizedTopic,
): AiChatMessage[] {
  return [
    {
      role: "system",
      content: "Orbii, an expert curriculum designer that outputs JSON roadmaps for beginners.",
    },
    {
      role: "user",
      content: `Given a raw topic string, return JSON only with "canonicalTopic" (clean, title-case, correctly spelled topic) and "correctionNote" (null if unchanged, otherwise: Showing roadmap for "<canonicalTopic>" (you typed "<rawTopic>").).
Raw input: "${rawTopic}"
Normalized guess: "${normalized.display}"
Rules:
- Collapse multiple spaces.
- Fix obvious casing and spelling issues if clear.
- Do not add explanations or any text outside JSON.
- Output must be JSON only with keys: canonicalTopic, correctionNote.`,
    },
  ];
}

function parseCanonicalTopicResponse(
  raw: string,
  normalized: NormalizedTopic,
): { canonicalTopic: string; correctionNote?: string } {
  let canonicalTopic = normalized.display;
  let correctionNote: string | undefined;

  try {
    const parsed = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object") {
      const parsedCanonical =
        typeof (parsed as any).canonicalTopic === "string"
          ? (parsed as any).canonicalTopic.trim()
          : "";
      const parsedNote =
        typeof (parsed as any).correctionNote === "string"
          ? (parsed as any).correctionNote.trim()
          : "";

      if (parsedCanonical) {
        canonicalTopic = parsedCanonical;
      }

      if (parsedNote) {
        correctionNote = parsedNote;
      }
    }
  } catch {
    // Fall back to normalized guess below.
  }

  if (!correctionNote && normalized.raw && canonicalTopic !== normalized.raw.trim()) {
    correctionNote = `Showing roadmap for "${canonicalTopic}" (you typed "${normalized.raw.trim()}").`;
  }

  return { canonicalTopic, correctionNote };
}

function buildRoadmapPrompt(canonicalTopic: string): string {
  return `Return a single JSON object matching this TypeScript shape:
type RoadmapCategory = "FOUNDATIONS" | "CORE_SKILLS" | "PROJECT" | "NEXT_STEPS" | "BRANCH" | "OTHER";
interface RoadmapSection {
  title: string;
  summary: string;
  steps: string[];
  category?: RoadmapCategory;
  branchLabel?: string;
  branchKey?: string;
  index?: number;
}
interface RoadmapResponse {
  canonicalTopic: string;
  correctionNote?: string;
  overview: string;
  sections: RoadmapSection[];
}

Generate a stable beginner roadmap for canonicalTopic = "${canonicalTopic}".

Rules:
- You are Orbii, an expert curriculum designer that outputs JSON roadmaps for beginners.
- Output valid JSON only, no markdown or comments.
- Return ONLY a single JSON object, with no backticks, no markdown fences, and no extra explanation text before or after the JSON.
- For the same canonicalTopic, always reuse the same overall section structure, titles, categories, and branching layout as a reusable course template. Only minor wording tweaks in summaries/steps are allowed between runs.
- Main path order with index numbers starting at 1: 2-3 sections with category "FOUNDATIONS", then 2-3 with "CORE_SKILLS", then exactly one "PROJECT", then exactly one "NEXT_STEPS".
- Branches: If the topic has natural specialisations, add 2-4 sections with category "BRANCH" (after core skills). Each BRANCH includes branchLabel (short name), branchKey (kebab-case slug), its own title/summary, and 3-5 steps focused on that sub-field.
- Every section has 3-6 steps. Each step starts with a verb and is a 20-60 minute task (watch, read, practice, build, quiz). Include 1-2 high-quality external resources across the whole roadmap using the exact pattern: [LINK: Label - https://example.com/path]. Do not use square brackets for anything else.
- Summaries are one friendly sentence for absolute beginners.
- Use the canonicalTopic exactly as given. Variants like misspellings or casing still map to this same structure.
`;
}

function normalizeCategory(value: unknown): RoadmapCategory | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "FOUNDATIONS") return "FOUNDATIONS";
  if (normalized === "CORE_SKILLS") return "CORE_SKILLS";
  if (normalized === "PROJECT") return "PROJECT";
  if (normalized === "NEXT_STEPS") return "NEXT_STEPS";
  if (normalized === "BRANCH") return "BRANCH";
  return "OTHER";
}

function parseRoadmapResponseText(
  raw: string,
  canonicalTopic: string,
  correctionNote?: string,
): RoadmapResponse | null {
  try {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const overview =
      typeof (parsed as any).overview === "string" && (parsed as any).overview.trim()
        ? (parsed as any).overview.trim()
        : "";

    const rawSections = Array.isArray((parsed as any).sections) ? (parsed as any).sections : [];
    const sections: RoadmapSection[] = rawSections
      .map((section: any, idx: number) => {
        if (!section || typeof section !== "object") return null;

        const title =
          typeof section.title === "string" && section.title.trim()
            ? section.title.trim()
            : `Section ${idx + 1}`;
        const summary =
          typeof section.summary === "string" && section.summary.trim()
            ? section.summary.trim()
            : "";
        const steps = Array.isArray(section.steps)
          ? section.steps
              .map((step: unknown) => (typeof step === "string" ? step.trim() : ""))
              .filter((step: string) => step.length > 0)
          : [];

        if (!title && !summary && steps.length === 0) {
          return null;
        }

        const category = normalizeCategory(section.category);
        const index =
          typeof section.index === "number" && Number.isFinite(section.index)
            ? section.index
            : idx + 1;

        const branchLabel =
          category === "BRANCH" && typeof section.branchLabel === "string"
            ? section.branchLabel.trim()
            : undefined;
        const branchKey =
          category === "BRANCH" && typeof section.branchKey === "string"
            ? section.branchKey.trim()
            : undefined;

        return {
          title,
          summary,
          steps,
          category,
          branchLabel,
          branchKey,
          index,
        };
      })
      .filter(Boolean) as RoadmapSection[];

    if (!sections.length) {
      return null;
    }

    const parsedCanonical =
      typeof (parsed as any).canonicalTopic === "string" && (parsed as any).canonicalTopic.trim()
        ? (parsed as any).canonicalTopic.trim()
        : canonicalTopic;

    const parsedCorrection =
      typeof (parsed as any).correctionNote === "string" && (parsed as any).correctionNote.trim()
        ? (parsed as any).correctionNote.trim()
        : correctionNote;

    const nodes = Array.isArray((parsed as any).nodes) ? (parsed as any).nodes : undefined;
    const edges = Array.isArray((parsed as any).edges) ? (parsed as any).edges : undefined;

    return {
      canonicalTopic: parsedCanonical,
      correctionNote: parsedCorrection,
      overview: overview || `A beginner-friendly roadmap for ${parsedCanonical}.`,
      sections,
      nodes,
      edges,
    };
  } catch {
    console.error("Roadmap JSON parse failed", {
      snippet: raw.slice(0, 500),
    });
    return null;
  }
}

function buildFallbackRoadmap(
  canonicalTopic: string,
  correctionNote?: string,
): RoadmapResponse {
  return {
    canonicalTopic: canonicalTopic || "Topic",
    correctionNote,
    overview: `We couldn't build a full roadmap for ${canonicalTopic || "this topic"} right now.`,
    sections: [
      {
        title: `Getting started with ${canonicalTopic || "the topic"}`,
        summary: `Kick off your learning about ${canonicalTopic || "this topic"}.`,
        steps: [
          `Watch or read a beginner-friendly introduction to ${canonicalTopic || "the topic"}.`,
          `Write down 3-5 key ideas you learned about ${canonicalTopic || "the topic"}.`,
          `Try one small practice task to apply a concept from ${canonicalTopic || "the topic"}.`,
        ],
        category: "FOUNDATIONS",
        index: 1,
      },
    ],
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

  const normalized = normalizeTopic(rawTopic || "Topic");
  if (!normalized.cleaned.trim()) {
    return new Response(JSON.stringify({ error: "Missing topic" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Generating roadmap for topic:", normalized.cleaned);

  let canonicalTopic = normalized.display;
  let correctionNote: string | undefined;

  try {
    const canonicalMessages = buildCanonicalTopicMessages(rawTopic, normalized);
    const canonicalResult = (await (env.AI as any).run(CHAT_MODEL, {
      messages: canonicalMessages,
      temperature: 0,
      max_tokens: 200,
    })) as { response?: string };

    const canonicalRaw =
      typeof canonicalResult === "string"
        ? canonicalResult
        : (canonicalResult?.response ?? JSON.stringify(canonicalResult));

    const canonicalParsed = parseCanonicalTopicResponse(
      (canonicalRaw ?? "").toString(),
      normalized,
    );
    canonicalTopic = canonicalParsed.canonicalTopic || normalized.display;
    correctionNote = canonicalParsed.correctionNote;
  } catch (error) {
    console.error("Canonical topic resolution failed", error);
    if (normalized.wasCorrected && normalized.raw.trim()) {
      correctionNote = `Showing roadmap for "${canonicalTopic}" (you typed "${normalized.raw.trim()}").`;
    }
  }

  let raw: string | undefined;
  try {
    const prompt = buildRoadmapPrompt(canonicalTopic);
    const aiResult = (await (env.AI as any).run(CHAT_MODEL, {
      messages: [
        {
          role: "system",
          content: "Orbii, an expert curriculum designer that outputs JSON roadmaps for beginners.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 1500,
    })) as { response?: string };

    const rawCandidate =
      typeof aiResult === "string"
        ? aiResult
        : (aiResult?.response ?? JSON.stringify(aiResult));
    raw = (rawCandidate ?? "").toString();

    const roadmap = parseRoadmapResponseText(raw, canonicalTopic, correctionNote);
    const responsePayload = roadmap ?? buildFallbackRoadmap(canonicalTopic, correctionNote);

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Roadmap generation failed; raw output:", raw, error);
    const fallbackPayload = buildFallbackRoadmap(canonicalTopic, correctionNote);
    return new Response(JSON.stringify(fallbackPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
