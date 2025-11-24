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

type RoadmapStep = {
  id: string;
  title: string;
  summary: string;
  resources: string[];
};

type RoadmapSection = {
  title: string;
  summary: string;
  steps: RoadmapStep[];
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
  return `Return a single JSON object matching this TypeScript shape from src/worker.ts:
type RoadmapCategory = "FOUNDATIONS" | "CORE_SKILLS" | "PROJECT" | "NEXT_STEPS" | "BRANCH" | "OTHER";
type RoadmapStep = {
  id: string;
  title: string;
  summary: string;
  resources: string[]; // plain text suggestions only, never URLs or HTML
};
interface RoadmapSection {
  title: string;
  summary: string;
  steps: RoadmapStep[];
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

Generate a stable, beginner-friendly learning roadmap for the canonical topic "${canonicalTopic}".

Rules:
- Output MUST be valid JSON only. Do not wrap in backticks or markdown fences. Do not add any text before or after the JSON.
- Follow the RoadmapResponse interface exactly: include canonicalTopic, overview, sections (with steps), and optional correctionNote. Optional nodes/edges are allowed but not required.
- Build a clear linear main path from beginner to next steps: 2-3 FOUNDATIONS sections, then 2-3 CORE_SKILLS sections, then exactly one PROJECT, then exactly one NEXT_STEPS.
- Add BRANCH sections (2-4) only if the topic has obvious specialisations. Place them after CORE_SKILLS. Each BRANCH must include branchLabel (short name) and branchKey (kebab-case slug), along with its own title, summary, and 3-5 steps.
- Every section has 3-6 steps. Steps start with a verb and are 20-60 minute tasks (watch, read, practice, build, quiz).
- Resources: provide 1-3 short search-style suggestions only. Never include URLs, domains, YouTube IDs, channel names, HTML, or markdown. Use wording like "Watch a short explainer on volcanoes (search on YouTube)" or "Read an intro to crystal lattice basics (search 'crystal lattice beginner article')".
- Summaries are one friendly sentence for absolute beginners.
- Use the canonicalTopic exactly as provided; keep the same structure on repeat calls for consistency.
`;
}

function buildCompactRoadmapPrompt(canonicalTopic: string): string {
  return `Create a concise beginner roadmap for "${canonicalTopic}".
Reply with JSON only using this shape:
{
  "canonicalTopic": string,
  "overview": string,
  "sections": [
    { "title": string, "summary": string, "category": "FOUNDATIONS", "steps": RoadmapStep[] },
    { "title": string, "summary": string, "category": "FOUNDATIONS", "steps": RoadmapStep[] },
    { "title": string, "summary": string, "category": "CORE_SKILLS", "steps": RoadmapStep[] },
    { "title": string, "summary": string, "category": "CORE_SKILLS", "steps": RoadmapStep[] },
    { "title": string, "summary": string, "category": "PROJECT", "steps": RoadmapStep[] },
    { "title": string, "summary": string, "category": "NEXT_STEPS", "steps": RoadmapStep[] }
  ]
}

Rules:
- Each section has 3-5 steps.
- Steps start with a verb and include 1-3 short search-style resource hints (no URLs or channel names).
- Keep summaries to one friendly sentence for beginners.
- Output valid JSON only—no prose, no backticks.`;
}

function toSlugId(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function normalizeResources(rawResources: unknown): string[] {
  const list = Array.isArray(rawResources)
    ? rawResources
    : typeof rawResources === "string"
      ? [rawResources]
      : [];

  const seen = new Set<string>();
  return list
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => {
      if (!entry) return false;
      if (/https?:\/\//i.test(entry)) return false;
      if (/<\/?[a-z][^>]*>/i.test(entry)) return false;
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function normalizeRoadmapStep(step: unknown, fallbackIndex: number): RoadmapStep | null {
  const fallbackTitle = `Step ${fallbackIndex + 1}`;
  const fallbackId = `step-${fallbackIndex + 1}`;

  if (!step) return null;

  if (typeof step === "string") {
    const title = step.trim();
    if (!title) return null;
    return {
      id: toSlugId(title, fallbackId),
      title,
      summary: "",
      resources: [],
    };
  }

  if (typeof step !== "object") return null;

  const stepObj = step as Record<string, unknown>;
  const rawTitle =
    typeof stepObj.title === "string" && stepObj.title.trim()
      ? stepObj.title.trim()
      : typeof stepObj.name === "string" && stepObj.name.trim()
        ? stepObj.name.trim()
        : "";
  const summary =
    typeof stepObj.summary === "string" && stepObj.summary.trim() ? stepObj.summary.trim() : "";
  const title = rawTitle || summary || fallbackTitle;

  if (!title) return null;

  const rawId =
    typeof stepObj.id === "string" && stepObj.id.trim() ? stepObj.id.trim() : undefined;
  const id = rawId ?? toSlugId(title, fallbackId);

  const resources = normalizeResources(stepObj.resources);

  return {
    id,
    title,
    summary,
    resources,
  };
}

function coerceStepList(section: any): unknown[] {
  if (Array.isArray(section?.steps)) return section.steps;
  if (section?.steps && typeof section.steps === "object") {
    return Object.values(section.steps);
  }
  if (Array.isArray(section?.items)) return section.items;
  if (section?.items && typeof section.items === "object") {
    return Object.values(section.items);
  }
  if (Array.isArray(section?.tasks)) return section.tasks;
  if (section?.tasks && typeof section.tasks === "object") {
    return Object.values(section.tasks);
  }
  if (Array.isArray(section?.actions)) return section.actions;
  if (section?.actions && typeof section.actions === "object") {
    return Object.values(section.actions);
  }
  return [];
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
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("Roadmap JSON parse failed", { error, rawText: cleaned.slice(0, 500) });
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    const possibleJson = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      parsed = JSON.parse(possibleJson);
    } catch (secondaryError) {
      console.error("Roadmap JSON parse failed after extracting braces", {
        error: secondaryError,
        rawText: possibleJson.slice(0, 500),
      });
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const nodesRaw = Array.isArray((parsed as any).nodes) ? (parsed as any).nodes : [];
  const edgesRaw = Array.isArray((parsed as any).edges) ? (parsed as any).edges : [];

  const overview =
    typeof parsed.overview === "string" && parsed.overview.trim() ? parsed.overview.trim() : "";

  let rawSections: any[] = [];
  if (Array.isArray((parsed as any).sections)) {
    rawSections = (parsed as any).sections;
  } else if (Array.isArray((parsed as any).section)) {
    rawSections = (parsed as any).section;
  } else if (Array.isArray((parsed as any).plan)) {
    rawSections = (parsed as any).plan;
  } else if (Array.isArray((parsed as any).steps)) {
    rawSections = [
      {
        title: `Getting started with ${canonicalTopic}`,
        summary: "",
        steps: (parsed as any).steps,
      },
    ];
  } else if (parsed.sections && typeof parsed.sections === "object") {
    rawSections = Object.values(parsed.sections as Record<string, unknown>);
  }

  const sections: RoadmapSection[] = rawSections
    .map((section: any, idx: number): RoadmapSection | null => {
      if (!section || typeof section !== "object") return null;

      const title =
        typeof section.title === "string" && section.title.trim()
          ? section.title.trim()
          : `Section ${idx + 1}`;
      const summary =
        typeof section.summary === "string" && section.summary.trim()
          ? section.summary.trim()
          : "";
      const rawSteps = coerceStepList(section);
      const steps = rawSteps
        .map((step: unknown, stepIdx: number) => normalizeRoadmapStep(step, stepIdx))
        .filter((step: RoadmapStep | null): step is RoadmapStep => Boolean(step));

      if (!steps.length) {
        const derivedStep = normalizeRoadmapStep(summary || title, 0);
        if (!derivedStep) {
          return null;
        }
        steps.push(derivedStep);
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
    .filter((section: RoadmapSection | null): section is RoadmapSection => Boolean(section));

  const normalizedCanonical =
    typeof parsed.canonicalTopic === "string" && parsed.canonicalTopic.trim()
      ? parsed.canonicalTopic.trim()
      : canonicalTopic;

  const hasAnySteps = sections.some((section) => section.steps && section.steps.length > 0);
  const hasGraphStructure = Array.isArray(nodesRaw) && nodesRaw.length > 0;

  if (!normalizedCanonical || (!hasAnySteps && !hasGraphStructure)) {
    console.error("Roadmap validation failed", {
      reason: "missing canonical topic or usable roadmap data",
      rawText: cleaned.slice(0, 500),
    });
    return null;
  }

  const parsedCorrection =
    typeof parsed.correctionNote === "string" && parsed.correctionNote.trim()
      ? parsed.correctionNote.trim()
      : correctionNote;

  const nodes = Array.isArray(nodesRaw) && nodesRaw.length ? nodesRaw : undefined;
  const edges = Array.isArray(edgesRaw) && edgesRaw.length ? edgesRaw : undefined;

  return {
    canonicalTopic: normalizedCanonical,
    correctionNote: parsedCorrection,
    overview: overview || `A beginner-friendly roadmap for ${normalizedCanonical}.`,
    sections,
    nodes,
    edges,
  };
}

function buildFallbackRoadmap(
  canonicalTopic: string,
  correctionNote?: string,
): RoadmapResponse {
  const topic = canonicalTopic || "the topic";
  return {
    canonicalTopic: topic || "Topic",
    correctionNote,
    overview: `Starter roadmap for ${topic}.`,
    sections: [
      {
        title: `Foundations: understand what ${topic} is`,
        summary: `Get a friendly overview of ${topic} so you know the basics.`,
        steps: [
          {
            id: "foundations-overview",
            title: `Watch a 5–10 minute intro to ${topic}`,
            summary: `Build a quick mental model of the topic.`,
            resources: [
              `Search YouTube for "what is ${topic} beginner" and watch one short explainer.`,
              `Read a starter article that defines ${topic} (search "intro to ${topic}").`,
            ],
          },
          {
            id: "foundations-terms",
            title: `List key terms and definitions for ${topic}`,
            summary: `Capture the essential vocabulary in your own words.`,
            resources: [
              `Find a glossary for ${topic} (search "basic ${topic} terms").`,
              `Write 5–7 bullet points defining each term.`,
            ],
          },
          {
            id: "foundations-quiz",
            title: `Quiz yourself on the essentials of ${topic}`,
            summary: `Check you can recall the basics without looking.`,
            resources: [
              `Search "beginner ${topic} quiz" or make 5 flashcards from your notes.`,
            ],
          },
        ],
        category: "FOUNDATIONS",
        index: 1,
      },
      {
        title: `Foundations: see ${topic} in context`,
        summary: `Learn how ${topic} shows up in real life or work.`,
        steps: [
          {
            id: "context-examples",
            title: `Find 3 real-world examples of ${topic}`,
            summary: `Spot where ${topic} is used or matters.`,
            resources: [
              `Search "examples of ${topic} in practice".`,
              `Note one example from a video or article.`,
            ],
          },
          {
            id: "context-diagram",
            title: `Draw a simple diagram of how ${topic} works`,
            summary: `Visualize the main parts and how they connect.`,
            resources: [
              `Look up a beginner diagram for ${topic} and redraw it from memory.`,
            ],
          },
          {
            id: "context-reflection",
            title: `Write a short takeaway about why ${topic} matters`,
            summary: `Summarize the value or impact of the topic.`,
            resources: [
              `Search "why ${topic} is important" and jot down 3–5 sentences.`,
            ],
          },
        ],
        category: "FOUNDATIONS",
        index: 2,
      },
      {
        title: `Core skills: practice the fundamentals`,
        summary: `Do small exercises to get hands-on with ${topic}.`,
        steps: [
          {
            id: "core-mini-task",
            title: `Complete one guided exercise about ${topic}`,
            summary: `Follow a beginner-friendly walkthrough.`,
            resources: [
              `Search "beginner ${topic} exercise" or "hello world ${topic}".`,
            ],
          },
          {
            id: "core-notes",
            title: `Capture what worked and what felt confusing`,
            summary: `Write 5–7 bullet points after the exercise.`,
            resources: [
              `Skim a forum thread for common beginner mistakes in ${topic}.`,
            ],
          },
          {
            id: "core-repeat",
            title: `Repeat the exercise without the guide`,
            summary: `See if you can do it solo to reinforce learning.`,
            resources: [
              `Keep notes handy; only peek if you get stuck for more than 5 minutes.`,
            ],
          },
        ],
        category: "CORE_SKILLS",
        index: 3,
      },
      {
        title: `Core skills: expand your toolkit`,
        summary: `Learn a couple of common techniques related to ${topic}.`,
        steps: [
          {
            id: "core-technique-1",
            title: `Learn one common technique in ${topic}`,
            summary: `Pick a skill beginners need early.`,
            resources: [
              `Search "basic ${topic} techniques" and choose one tutorial.`,
            ],
          },
          {
            id: "core-technique-2",
            title: `Practice that technique on a tiny example`,
            summary: `Keep it small—just enough to try the motions.`,
            resources: [
              `Look for a practice prompt like "first ${topic} project" and adapt it.`,
            ],
          },
          {
            id: "core-review",
            title: `Review your work with a short checklist`,
            summary: `Verify you hit the key steps correctly.`,
            resources: [
              `Search "beginner ${topic} checklist" or create your own 5-point list.`,
            ],
          },
        ],
        category: "CORE_SKILLS",
        index: 4,
      },
      {
        title: `Project: build a tiny ${topic} sample`,
        summary: `Apply what you learned to a small, real-ish output.`,
        steps: [
          {
            id: "project-plan",
            title: `Define a tiny project goal for ${topic}`,
            summary: `One-sentence goal plus 3–4 acceptance bullets.`,
            resources: [
              `Search "simple ${topic} project ideas" and pick the easiest one.`,
            ],
          },
          {
            id: "project-build",
            title: `Build the project in one focused session`,
            summary: `Stay scrappy—aim for done, not perfect.`,
            resources: [
              `Keep a tab open with a quick reference for ${topic} basics.`,
            ],
          },
          {
            id: "project-retro",
            title: `Do a 10-minute retro on what to improve`,
            summary: `Note what you’d change next time and one thing to learn next.`,
            resources: [
              `Search a short checklist on "how to review a small project".`,
            ],
          },
        ],
        category: "PROJECT",
        index: 5,
      },
      {
        title: `Next steps: keep momentum with ${topic}`,
        summary: `Plan how you’ll continue learning.`,
        steps: [
          {
            id: "next-deepen",
            title: `Pick one deeper area inside ${topic} to explore`,
            summary: `Choose a subtopic that interests you now.`,
            resources: [
              `Search "intermediate ${topic} topics" and list 2–3 options.`,
            ],
          },
          {
            id: "next-schedule",
            title: `Schedule two more learning sessions`,
            summary: `Block time on your calendar to keep going.`,
            resources: [
              `Use any calendar app; add the topic and goal for each session.`,
            ],
          },
          {
            id: "next-community",
            title: `Find a community or forum about ${topic}`,
            summary: `Ask one question or share your small project.`,
            resources: [
              `Search "beginner ${topic} community" or a subreddit/forum.`,
            ],
          },
        ],
        category: "NEXT_STEPS",
        index: 6,
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

  const runRoadmapCall = async (prompt: string) => {
    const aiResult = (await (env.AI as any).run(CHAT_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You are generating a beginner-friendly learning roadmap. Reply with valid JSON only, no markdown or prose. The JSON must follow the RoadmapResponse interface in this file (sections with steps and optional branch sections). Never include URLs, HTML, or channel names; only short search-style resource hints.",
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
    return (rawCandidate ?? "").toString();
  };

  let rawPrimary: string | undefined;
  try {
    const primaryPrompt = buildRoadmapPrompt(canonicalTopic);
    rawPrimary = await runRoadmapCall(primaryPrompt);
    let roadmap = parseRoadmapResponseText(rawPrimary, canonicalTopic, correctionNote);

    if (!roadmap) {
      console.error("Roadmap parse failed (primary)", { rawText: rawPrimary?.slice(0, 800) });
      const secondaryPrompt = buildCompactRoadmapPrompt(canonicalTopic);
      const rawSecondary = await runRoadmapCall(secondaryPrompt);
      roadmap = parseRoadmapResponseText(rawSecondary, canonicalTopic, correctionNote);
      if (!roadmap) {
        console.error("Roadmap parse failed (secondary)", { rawText: rawSecondary?.slice(0, 800) });
      }
    }

    const responsePayload = roadmap ?? buildFallbackRoadmap(canonicalTopic, correctionNote);

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Roadmap generation failed; raw output:", rawPrimary, error);
    const fallbackPayload = buildFallbackRoadmap(canonicalTopic, correctionNote);
    return new Response(JSON.stringify(fallbackPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
