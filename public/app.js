const chatEl = document.getElementById("orbii-chat");
const toggleBtn = document.getElementById("orbii-toggle");
const closeBtn = document.getElementById("orbii-close");
const messagesEl = document.getElementById("orbii-messages");
const formEl = document.getElementById("orbii-form");
const inputEl = document.getElementById("orbii-input");
const studyForm = document.getElementById("orbii-study-form");
const studyTextEl = document.getElementById("orbii-study-text");
const studyStatusEl = document.getElementById("orbii-study-status");
const sessionResetBtn = document.getElementById("orbii-session-reset");
const quizStartBtn = document.getElementById("orbii-quiz-start");
const pdfInput = document.getElementById("pdf-input");
const homeScreen = document.getElementById("orbii-home");
const studyScreen = document.getElementById("orbii-study-screen");
const roadmapScreen = document.getElementById("orbii-roadmap-screen");
const goToStudyButton = document.getElementById("go-to-study-button");
const backToHomeFromStudy = document.getElementById("back-to-home-from-study");
const createRoadmapButton = document.getElementById("create-roadmap-button");
const backToHomeFromRoadmap = document.getElementById("back-to-home-from-roadmap");
const roadmapTopicInput = document.getElementById("roadmap-topic-input");
const roadmapTopicTitle = document.getElementById("roadmap-topic-title");
const roadmapTopic = document.getElementById("roadmap-topic");
const roadmapContent = document.getElementById("roadmap-content");
const roadmapGraphContainer =
  document.getElementById("roadmap-graph") || document.getElementById("roadmap-container");
const topicError = document.getElementById("topic-error");
const pdfjsLib =
  typeof window !== "undefined"
    ? window["pdfjsLib"] || window.pdfjsLib || null
    : null;

function showView(view) {
  homeScreen?.classList.add("hidden");
  studyScreen?.classList.add("hidden");
  roadmapScreen?.classList.add("hidden");

  if (view === "home") homeScreen?.classList.remove("hidden");
  if (view === "study") studyScreen?.classList.remove("hidden");
  if (view === "roadmap") roadmapScreen?.classList.remove("hidden");
}

function setTopicError(message) {
  if (!topicError) return;
  if (message) {
    topicError.textContent = message;
    topicError.classList.remove("hidden");
  } else {
    topicError.textContent = "";
    topicError.classList.add("hidden");
  }
}

function renderRoadmapStatus(message) {
  if (!roadmapContent) return;
  roadmapContent.innerHTML = "";
  const status = document.createElement("p");
  status.className = "roadmap-status";
  status.textContent = message;
  roadmapContent.appendChild(status);
}

function parseRoadmapStep(stepText) {
  if (typeof stepText !== "string") {
    return { text: "", url: null, label: null };
  }

  const raw = stepText.trim();
  if (!raw) {
    return { text: "", url: null, label: null };
  }

  // Look for our [LINK: label - https://...] pattern
  const linkMatch = raw.match(/\[LINK:\s*([^-\]]+)-\s*(https?:\/\/[^\]]+)\]/i);
  if (!linkMatch) {
    return { text: raw, url: null, label: null };
  }

  const before = raw.slice(0, linkMatch.index).trim();
  const label = linkMatch[1].trim();
  const url = linkMatch[2].trim();

  // Strip a trailing colon/dash from the description if present
  const cleanedText = before.replace(/[-–:]\s*$/, "").trim();

  return {
    text: cleanedText || label || raw,
    url,
    label: label || url,
  };
}

function renderRoadmap(roadmap, selectedSectionId) {
  if (!roadmapContent) return;

  if (!roadmap && currentRoadmap) {
    roadmap = currentRoadmap;
  }
  if (!roadmap) {
    roadmapContent.innerHTML =
      "<p class='roadmap-status'>Enter a topic on the home screen first.</p>";
    return;
  }

  currentRoadmap = roadmap;
  roadmapContent.innerHTML = "";

  const correctionNote =
    roadmap && typeof roadmap.correctionNote === "string"
      ? roadmap.correctionNote.trim()
      : "";

  if (correctionNote) {
    const noteEl = document.createElement("p");
    noteEl.className = "roadmap-note";
    noteEl.textContent = correctionNote;
    roadmapContent.appendChild(noteEl);
  }

  const overview =
    roadmap && typeof roadmap.overview === "string"
      ? roadmap.overview.trim()
      : "";
  if (overview) {
    const overviewEl = document.createElement("div");
    overviewEl.className = "roadmap-overview-card";
    overviewEl.textContent = overview;
    roadmapContent.appendChild(overviewEl);
  }

  const sections = extractRoadmapSections(roadmap);
  if (!sections.length) {
    const status = document.createElement("p");
    status.className = "roadmap-status";
    status.textContent = "No roadmap data available.";
    roadmapContent.appendChild(status);
    currentSelectedSectionId = null;
    return;
  }

  const fallbackSectionId = makeSectionDomId(sections[0], 0);
  const hasMatchingSelection = selectedSectionId
    ? sections.some((section, index) => makeSectionDomId(section, index) === selectedSectionId)
    : false;
  const defaultSectionId = hasMatchingSelection ? selectedSectionId : fallbackSectionId;
  currentSelectedSectionId = defaultSectionId;

  sections.forEach((section, index) => {
    const sectionDomId = makeSectionDomId(section, index);

    const card = document.createElement("div");
    card.className = "roadmap-section";
    card.dataset.sectionId = sectionDomId;
    card.id = sectionDomId;

    if (sectionDomId === defaultSectionId) {
      card.classList.add("is-active");
    }

    const title = document.createElement("h3");
    title.className = "roadmap-section-title";
    title.textContent =
      typeof section?.title === "string" && section.title.trim()
        ? section.title
        : "Section";
    card.appendChild(title);

    if (typeof section?.summary === "string" && section.summary.trim()) {
      const summary = document.createElement("p");
      summary.className = "roadmap-section-summary";
      summary.textContent = section.summary;
      card.appendChild(summary);
    }

    const steps = Array.isArray(section?.steps) ? section.steps : [];
    if (steps.length) {
      const list = document.createElement("ul");
      list.className = "roadmap-step-list";
      steps.forEach((step) => {
        if (typeof step !== "string" || !step.trim()) return;

        const { text, url, label } = parseRoadmapStep(step);
        if (!text && !url) return;

        const li = document.createElement("li");
        li.className = "roadmap-step-item";

        // Main description text
        if (text) {
          li.appendChild(document.createTextNode(text));
        }

        // Optional clickable resource link
        if (url) {
          li.appendChild(document.createTextNode(" "));

          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = label || "Open resource";
          link.className = "roadmap-step-link";

          li.appendChild(link);
        }

        list.appendChild(li);
      });
      card.appendChild(list);
    }

    roadmapContent.appendChild(card);
  });

  const activeCard = defaultSectionId ? document.getElementById(defaultSectionId) : null;
  if (activeCard && selectedSectionId) {
    activeCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

const CYTOSCAPE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.1/cytoscape.min.js";
let cytoscapeLoader;
let roadmapCy;
let currentRoadmap = null;
let currentSelectedSectionId = null;
let roadmapResizeTimeout;

function toLabel(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toIdPart(value) {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 26)
    : "";
}

function makeSectionDomId(section, index) {
  const titlePart = toIdPart(section?.title || "");
  const order =
    typeof section?.index === "number" && Number.isFinite(section.index)
      ? section.index
      : index + 1;

  const base = titlePart || `section-${order}`;
  return `section-${order}-${base}`;
}

function normalizeSectionCategory(category) {
  if (typeof category !== "string") return "OTHER";
  const normalized = category.trim().toUpperCase().replace(/\s+/g, "_");

  if (normalized === "FOUNDATIONS") return "FOUNDATIONS";
  if (normalized === "CORE_SKILLS" || normalized === "CORE") return "CORE_SKILLS";
  if (normalized === "PROJECT") return "PROJECT";
  if (normalized === "NEXT_STEPS" || normalized === "NEXT") return "NEXT_STEPS";
  if (normalized.startsWith("BRANCH")) return "BRANCH";

  return "OTHER";
}

function normalizeSections(sections) {
  return sections
    .map((section, idx) => {
      const category = normalizeSectionCategory(section?.category);
      const branchLabel =
        typeof section?.branchLabel === "string" && section.branchLabel.trim()
          ? section.branchLabel.trim()
          : null;
      const derivedBranchKey =
        branchLabel && typeof section?.branchKey !== "string"
          ? branchLabel.toLowerCase().replace(/\s+/g, "-")
          : null;
      const branchKey =
        typeof section?.branchKey === "string" && section.branchKey.trim()
          ? section.branchKey.trim()
          : derivedBranchKey;

      const index =
        typeof section?.index === "number" && Number.isFinite(section.index)
          ? section.index
          : idx;

      return {
        title: toLabel(section?.title, `Section ${idx + 1}`),
        summary: typeof section?.summary === "string" ? section.summary : "",
        steps: Array.isArray(section?.steps)
          ? section.steps
              .map((step) => (typeof step === "string" ? step.trim() : ""))
              .filter((step) => step)
          : [],
        category,
        branchKey: branchKey || null,
        branchLabel,
        index,
      };
    })
    .sort((a, b) => a.index - b.index);
}

function extractRoadmapSections(roadmap) {
  // If the backend already returned sections in the right shape, prefer those.
  const existingSections = Array.isArray(roadmap?.sections) ? roadmap.sections : [];
  if (existingSections.length) {
    return normalizeSections(existingSections);
  }

  // Fallback: build sections from nodes + edges produced by the model.
  const nodes = Array.isArray(roadmap?.nodes) ? roadmap.nodes : [];
  const edges = Array.isArray(roadmap?.edges) ? roadmap.edges : [];

  if (!nodes.length) {
    return [];
  }

  const nodeById = new Map();
  nodes.forEach((node) => {
    if (!node || typeof node.id !== "string") return;
    nodeById.set(node.id, node);
  });

  const stepsByFrom = new Map();
  edges.forEach((edge) => {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") return;

    const toNode = nodeById.get(edge.to);
    const toTitle =
      toNode && typeof toNode.title === "string" && toNode.title.trim()
        ? toNode.title.trim()
        : edge.to;

    if (!toTitle) return;

    const reason =
      typeof edge.reason === "string" && edge.reason.trim()
        ? edge.reason.trim()
        : "";

    const stepText = reason ? `${toTitle}: ${reason}` : toTitle;

    if (!stepText) return;

    if (!stepsByFrom.has(edge.from)) {
      stepsByFrom.set(edge.from, []);
    }
    stepsByFrom.get(edge.from).push(stepText);
  });

  const sortedNodes = nodes.slice().sort((a, b) => {
    const aLevel = typeof a.level === "number" ? a.level : 0;
    const bLevel = typeof b.level === "number" ? b.level : 0;
    if (aLevel !== bLevel) return aLevel - bLevel;

    const aTitle = typeof a.title === "string" ? a.title : "";
    const bTitle = typeof b.title === "string" ? b.title : "";
    return aTitle.localeCompare(bTitle);
  });

  const fallbackSections = sortedNodes.map((node, index) => {
    const title =
      typeof node.title === "string" && node.title.trim()
        ? node.title.trim()
        : `Node ${index + 1}`;

    const summary =
      typeof node.summary === "string" && node.summary.trim()
        ? node.summary.trim()
        : "";

    const steps = stepsByFrom.get(node.id) || [];

    return {
      title,
      summary,
      steps,
      category: "OTHER",
      branchKey: null,
      branchLabel: null,
      index,
    };
  });

  return normalizeSections(fallbackSections);
}

function toShortLabel(label, max = 42) {
  if (typeof label !== "string") return "";
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function deriveSectionLabel(section, index, category) {
  const fullTitle = toLabel(section?.title, `Section ${index + 1}`);
  const baseNumber = index + 1;

  const strippedTitle = fullTitle
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/^(section|step)\s+\d+[:\-]?\s*/i, "")
    .trim();
  const leadingIdea = strippedTitle.split(/[-–:]/)[0].trim() || strippedTitle;

  if (category === "BRANCH") {
    const branchTitle = toLabel(section?.branchLabel, leadingIdea || fullTitle);
    return {
      fullTitle,
      shortLabel: toShortLabel(branchTitle, 26),
    };
  }

  const compact = leadingIdea || fullTitle;
  return {
    fullTitle,
    shortLabel: toShortLabel(`${baseNumber}. ${compact}`, 34),
  };
}

function buildRoadmapElements(roadmap, topicLabel) {
  const sections = extractRoadmapSections(roadmap);
  const topicId = `topic-${toIdPart(topicLabel) || "center"}`;

  const elements = [
    {
      data: {
        id: topicId,
        label: toShortLabel(topicLabel || "Topic", 26),
        level: 0,
      },
    },
  ];

  if (!sections.length) {
    return { elements, topicId };
  }

  const mainSections = sections.filter((section) => section.category !== "BRANCH");
  const branchSections = sections.filter((section) => section.category === "BRANCH");
  const mainPath = mainSections.length ? mainSections : sections;

  const getSectionDomId = (section) => {
    const index = sections.indexOf(section);
    return makeSectionDomId(section, index >= 0 ? index : 0);
  };

  const mainEntries = mainPath.map((section, sectionIndex) => {
    const category = normalizeSectionCategory(section?.category);
    const { fullTitle, shortLabel } = deriveSectionLabel(section, sectionIndex, category);
    const sectionId = getSectionDomId(section);

    elements.push({
      data: {
        id: sectionId,
        label: shortLabel,
        fullTitle,
        level: 1,
        category,
        sectionId,
      },
    });

    return {
      sectionId,
      category,
    };
  });

  mainEntries.forEach((entry, idx) => {
    const source = idx === 0 ? topicId : mainEntries[idx - 1].sectionId;
    elements.push({
      data: {
        id: `${source}-to-${entry.sectionId}`,
        source,
        target: entry.sectionId,
        category: "MAIN",
      },
    });
  });

  const branchAnchor =
    [...mainEntries].reverse().find(
      (entry) => entry.category === "CORE_SKILLS" || entry.category === "FOUNDATIONS",
    ) ?? mainEntries[mainEntries.length - 1];
  const branchParentId = branchAnchor ? branchAnchor.sectionId : topicId;

  branchSections.forEach((section, branchIndex) => {
    const branchTitle = toLabel(
      section?.branchLabel,
      toLabel(section?.title, `Branch ${branchIndex + 1}`),
    );
    const sectionId = getSectionDomId(section);
    const { fullTitle, shortLabel } = deriveSectionLabel(
      { ...section, title: branchTitle },
      branchIndex,
      "BRANCH",
    );

    elements.push({
      data: {
        id: sectionId,
        label: shortLabel,
        fullTitle,
        level: 1,
        category: "BRANCH",
        sectionId,
      },
    });

    elements.push({
      data: {
        id: `${branchParentId}-to-${sectionId}`,
        source: branchParentId,
        target: sectionId,
        category: "BRANCH",
      },
    });
  });

  return { elements, topicId };
}

async function loadCytoscape() {
  if (window.cytoscape) {
    return window.cytoscape;
  }

  if (!cytoscapeLoader) {
    cytoscapeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CYTOSCAPE_CDN;
      script.async = true;
      script.onload = () => {
        if (window.cytoscape) {
          resolve(window.cytoscape);
        } else {
          reject(new Error("Cytoscape failed to load from CDN"));
        }
      };
      script.onerror = () => reject(new Error("Could not load Cytoscape CDN script"));
      document.head.appendChild(script);
    });
  }

  return cytoscapeLoader;
}

function clampZoomValue(value, minZoom, maxZoom) {
  const min = Number.isFinite(minZoom) ? minZoom : 0.7;
  const max = Number.isFinite(maxZoom) ? maxZoom : 2.0;
  return Math.min(Math.max(value, min), max);
}

function fitRoadmapToView(cy, padding = 40, zoomBoost = 1.12) {
  if (!cy) return;
  cy.fit(undefined, padding);
  const targetZoom = clampZoomValue(cy.zoom() * zoomBoost, cy.minZoom(), cy.maxZoom());
  cy.zoom(targetZoom);
  cy.center();
}

async function renderRoadmapGraph(roadmap, topic) {
  if (!roadmapGraphContainer) return;

  roadmapGraphContainer.classList.remove("hidden");
  roadmapGraphContainer.innerHTML = "";

  let cytoscape;
  try {
    cytoscape = await loadCytoscape();
  } catch (error) {
    console.error("Unable to load Cytoscape", error);
    return;
  }

  const topicLabel = toLabel(topic || roadmap?.topic, "Git basics");
  const { elements, topicId } = buildRoadmapElements(roadmap, topicLabel);

  if (roadmapCy) {
    roadmapCy.destroy();
  }

  const layoutOptions = {
    name: "breadthfirst",
    directed: true,
    roots: "#" + topicId,
    orientation: "vertical",
    spacingFactor: 1.4,
    padding: 40,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    animate: false,
  };

  roadmapCy = cytoscape({
    container: roadmapGraphContainer,
    elements,
    layout: layoutOptions,
    wheelSensitivity: 0.2,
    minZoom: 0.7,
    maxZoom: 2.0,
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          shape: "round-rectangle",
          width: "200px",
          height: "56px",
          "background-color": "#0ea5e9",
          "background-fill": "linear-gradient",
          "background-gradient-stop-colors": ["#38bdf8", "#1e3a8a"],
          "background-gradient-direction": "to-bottom-right",
          "border-color": "rgba(103, 232, 249, 0.75)",
          "border-width": 2.6,
          "border-opacity": 1,
          "font-size": 13.5,
          "font-weight": 600,
          "text-wrap": "wrap",
          "text-max-width": "160px",
          "text-valign": "center",
          "text-halign": "center",
          "color": "#e0f2fe",
          "text-outline-width": 1,
          "text-outline-color": "rgba(15,23,42,0.8)",
          "shadow-blur": 18,
          "shadow-color": "#1d4ed8",
          "shadow-opacity": 0.4,
          "shadow-offset-x": 0,
          "shadow-offset-y": 8,
          cursor: "pointer",
          "text-events": "yes",
        },
      },
      {
        selector: "node[level = 0]",
        style: {
          width: "220px",
          height: "64px",
          "background-gradient-stop-colors": ["#38bdf8", "#2563eb"],
          "border-color": "#67e8f9",
          "shadow-color": "#06b6d4",
          "font-size": 14,
          "font-weight": 700,
        },
      },
      {
        selector: 'node[category = "BRANCH"]',
        style: {
          "background-color": "#22c55e",
          "background-gradient-stop-colors": ["#34d399", "#15803d"],
          "border-color": "rgba(74, 222, 128, 0.95)",
          "shadow-color": "#16a34a",
        },
      },
      {
        selector: "node:hover",
        style: {
          "shadow-blur": 28,
          "shadow-opacity": 0.6,
          "border-width": 3,
          "transition-property": "shadow-blur, border-width",
          "transition-duration": "150ms",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2.8,
          "line-color": "rgba(148,163,184,0.65)",
          "target-arrow-color": "rgba(148,163,184,0.65)",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 1.1,
        },
      },
      {
        selector: 'edge[category = "MAIN"]',
        style: {
          width: 3.4,
          "line-color": "#7dd3fc",
          "target-arrow-color": "#7dd3fc",
        },
      },
      {
        selector: 'edge[category = "BRANCH"]',
        style: {
          width: 3,
          "line-color": "rgba(34,197,94,0.8)",
          "target-arrow-color": "#34d399",
        },
      },
      {
        selector: "node.is-selected",
        style: {
          "border-width": 4,
          "border-color": "#fcd34d",
          "shadow-opacity": 0.8,
          "shadow-blur": 28,
          "shadow-color": "#fcd34d",
        },
      },
      {
        selector: "edge.is-linked",
        style: {
          width: 4,
          "line-color": "#facc15",
          "target-arrow-color": "#facc15",
        },
      },
    ],
  });

  const layout = roadmapCy.layout(layoutOptions);
  layout.run();
  layout.on("layoutstop", () => fitRoadmapToView(roadmapCy, 48, 1.15));
  fitRoadmapToView(roadmapCy, 48, 1.15);

  roadmapCy.on("tap", "node", (event) => {
    const node = event.target;
    if (!node) return;

    const sectionId = node.data("sectionId");
    const nodeId = node.id();
    const nodeLabel = node.data("label");
    const nodeCategory = node.data("category");

    console.log("[roadmap] node tap", {
      nodeId,
      nodeLabel,
      nodeCategory,
      sectionId,
    });

    roadmapCy.nodes().removeClass("is-selected");
    roadmapCy.edges().removeClass("is-linked");
    roadmapCy.elements().unselect();
    node.addClass("is-selected");
    node.connectedEdges().addClass("is-linked");
    node.select();
    roadmapCy.animate({
      center: { eles: node },
      zoom: clampZoomValue(roadmapCy.zoom() * 1.02, roadmapCy.minZoom(), roadmapCy.maxZoom()),
      duration: 220,
      easing: "ease-out",
    });

    if (sectionId && currentRoadmap) {
      renderRoadmap(null, sectionId);
    }
  });
}

window.addEventListener("resize", () => {
  if (roadmapResizeTimeout) {
    clearTimeout(roadmapResizeTimeout);
  }

  roadmapResizeTimeout = window.setTimeout(() => {
    if (roadmapCy) {
      fitRoadmapToView(roadmapCy, 48, 1.08);
    }
  }, 180);
});

showView("home");

if (pdfjsLib?.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";
}

const SESSION_STORAGE_KEY = "orbii-session-id";
const STUDY_STATUS_DEFAULT_MESSAGE =
  "Paste text and click save to keep it with this session.";
const ORBII_ASSISTANT_GREETING =
  '👋 I\'m Orbii, your friendly study buddy. Paste some study text above, then ask me questions or say "quiz me" and I\'ll help you learn.';
const QUIZ_PROMPT_MESSAGE =
  "I'd like you to quiz me on my current study text. Please ask me one short question at a time.";
const MAX_PDF_PAGES_TO_READ = 5;
const MAX_PDF_CHARACTERS = 10000;
const MIN_PDF_TEXT_LENGTH = 20;
let sessionId;

function createNewSessionId() {
  return typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function persistSessionId(id) {
  try {
    window.localStorage?.setItem(SESSION_STORAGE_KEY, id);
  } catch (error) {
    console.warn("Unable to persist Orbii session ID", error);
  }
}

try {
  const storedSession = window.localStorage?.getItem(SESSION_STORAGE_KEY);
  if (storedSession) {
    sessionId = storedSession;
  }
} catch (error) {
  console.warn("Unable to read Orbii session from storage", error);
}

if (!sessionId) {
  sessionId = createNewSessionId();
  persistSessionId(sessionId);
}

console.log("Orbii session:", sessionId);

function setChatOpen(open) {
  if (!chatEl) return;
  chatEl.classList.toggle("is-open", open);
}

function appendMessage(role, text) {
  if (!messagesEl) return;
  const div = document.createElement("div");
  div.className = `orbii-message orbii-message-${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Sends a message to Orbii and appends whatever reply comes back.
async function sendOrbiiMessage(text) {
  const submitButton = formEl?.querySelector("button[type=submit]");
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });

    if (!response.ok) {
      appendMessage("assistant", "Hmm, something went wrong talking to the server.");
      return;
    }

    const data = await response.json();
    const reply = typeof data.reply === "string" ? data.reply : "No reply received.";
    appendMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    appendMessage("assistant", "Network error while contacting Orbii.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function setStudyStatus(message) {
  if (!studyStatusEl) return;
  studyStatusEl.textContent = message;
}

function resetOrbiiSession() {
  // Create and persist a fresh session ID so future requests use the new topic.
  sessionId = createNewSessionId();
  persistSessionId(sessionId);

  // Reset chat history to only show Orbii's greeting.
  if (messagesEl) {
    messagesEl.innerHTML = "";
    appendMessage("assistant", ORBII_ASSISTANT_GREETING);
  }

  // Clear study inputs and hint so the user knows they need to save again.
  if (studyTextEl) {
    studyTextEl.value = "";
  }
  setStudyStatus(STUDY_STATUS_DEFAULT_MESSAGE);

  console.log("Orbii session:", sessionId);
}

// Try window global first, then dynamic import as a fallback.
async function extractTextFromPdf(file) {
  let activePdfjsLib =
    window["pdfjsLib"] ||
    window.pdfjsLib ||
    window["pdfjs-dist/build/pdf"] ||
    window["pdfjs-dist/build/pdf.min"];

  if (!activePdfjsLib || typeof activePdfjsLib.getDocument !== "function") {
    try {
      const mod = await import(
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.min.mjs"
      );
      const imported =
        mod && typeof mod.getDocument === "function"
          ? mod
          : mod?.default && typeof mod.default.getDocument === "function"
            ? mod.default
            : null;
      if (imported) {
        activePdfjsLib = imported;
        window.pdfjsLib = imported;
      }
    } catch (error) {
      console.error("Failed to dynamically import pdf.js", error);
    }
  }

  if (!activePdfjsLib || typeof activePdfjsLib.getDocument !== "function") {
    console.error("pdfjsLib.getDocument is not available after attempting to load pdf.js.");
    throw new Error("PDF reader unavailable");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await activePdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = typeof pdf.numPages === "number" ? pdf.numPages : 0;
  const safeTotalPages = Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 0;
  const pagesToRead = Math.min(safeTotalPages, MAX_PDF_PAGES_TO_READ);
  const chunks = [];

  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => (item && typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .trim();
    if (pageText) {
      chunks.push(pageText);
    }
  }

  let combined = chunks.join("\n\n").trim();
  const truncated = combined.length > MAX_PDF_CHARACTERS;
  if (truncated) {
    combined = combined.slice(0, MAX_PDF_CHARACTERS);
  }

  return {
    text: combined,
    pagesRead: pagesToRead,
    totalPages,
    truncated,
  };
}

toggleBtn?.addEventListener("click", () => {
  const isOpen = chatEl?.classList.contains("is-open");
  setChatOpen(!isOpen);
});

closeBtn?.addEventListener("click", () => setChatOpen(false));

sessionResetBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  resetOrbiiSession();
});

formEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) return;

  appendMessage("user", text);
  inputEl.value = "";
  await sendOrbiiMessage(text);
});

quizStartBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  const text = QUIZ_PROMPT_MESSAGE;
  setChatOpen(true);
  appendMessage("user", text);
  await sendOrbiiMessage(text);
});

// Handle PDF selection so we can extract text locally before saving.
pdfInput?.addEventListener("change", async (event) => {
  const input = event.target;
  const file = input?.files?.[0];

  if (!file) {
    setStudyStatus("No PDF selected.");
    return;
  }
  if (file.type && file.type !== "application/pdf") {
    setStudyStatus("That file is not a PDF. Please choose a PDF to load.");
    input.value = "";
    return;
  }
  if (!pdfjsLib) {
    console.warn("PDF.js failed to load.");
    setStudyStatus("PDF reader unavailable. Please reload the page and try again.");
    return;
  }

  setStudyStatus("Reading PDF…");

  try {
    const { text, pagesRead, totalPages, truncated } = await extractTextFromPdf(file);
    const characters = text.length;

    if (!text || characters < MIN_PDF_TEXT_LENGTH) {
      if (studyTextEl) {
        studyTextEl.value = "";
      }
      setStudyStatus("I couldn't find readable text in that PDF. It might be a scanned image.");
      return;
    }

    if (studyTextEl) {
      studyTextEl.value = text;
    }

    const pagesLabel =
      pagesRead && totalPages
        ? `${pagesRead}${pagesRead !== totalPages ? `/${totalPages}` : ""} page${pagesRead === 1 ? "" : "s"}`
        : `${pagesRead || 0} page${pagesRead === 1 ? "" : "s"}`;

    let statusMessage = `Loaded text from PDF: ${characters} characters (${pagesLabel}).`;
    if (truncated) {
      statusMessage += " Truncated to keep things responsive.";
    }
    setStudyStatus(statusMessage);
  } catch (error) {
    console.error("Failed to extract text from PDF", error);
    setStudyStatus("Could not read that PDF, please try another file.");
  }
});

studyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!studyTextEl) return;

  const text = studyTextEl.value.trim();
  if (!text) {
    setStudyStatus("Please paste some text first.");
    return;
  }

  const submitButton = studyForm.querySelector("button[type=submit]");
  if (submitButton) submitButton.disabled = true;
  setStudyStatus("Saving study text...");

  try {
    const response = await fetch("/api/study-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sessionId }),
    });

    if (!response.ok) {
      console.error("Failed to save study text", response.statusText);
      setStudyStatus("Could not save study text. Please try again.");
      return;
    }

    const data = await response.json();
    if (!data?.ok) {
      setStudyStatus("Could not save study text. Please try again.");
      return;
    }

    const characters =
      typeof data.characters === "number" && Number.isFinite(data.characters)
        ? data.characters
        : text.length;
    setStudyStatus(`Saved ${characters} characters of study text for this session.`);
  } catch (error) {
    console.error("Network error while saving study text", error);
    setStudyStatus("Could not save study text. Please try again.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// Open chat if the page is loaded on a very small screen (optional nice touch)
if (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) {
  setChatOpen(true);
}

goToStudyButton?.addEventListener("click", () => showView("study"));
backToHomeFromStudy?.addEventListener("click", () => showView("home"));

createRoadmapButton?.addEventListener("click", async () => {
  const topic = roadmapTopicInput?.value.trim() ?? "";
  if (!topic) {
    setTopicError("Please enter a topic first.");
    return;
  }

  setTopicError("");

  showView("roadmap");
  renderRoadmapStatus("Loading roadmap...");
  if (createRoadmapButton) {
    createRoadmapButton.disabled = true;
  }

  try {
    const response = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    if (!response.ok) {
      throw new Error(`Roadmap request failed with status ${response.status}`);
    }

    const roadmap = await response.json();
    const displayTopic =
      roadmap &&
      typeof roadmap.canonicalTopic === "string" &&
      roadmap.canonicalTopic.trim()
        ? roadmap.canonicalTopic.trim()
        : topic;

    currentRoadmap = roadmap;
    currentSelectedSectionId = null;

    if (roadmapTopic) {
      roadmapTopic.textContent = displayTopic;
    } else if (roadmapTopicTitle) {
      roadmapTopicTitle.textContent = `Roadmap for: ${displayTopic}`;
    }

    renderRoadmap(roadmap);
    await renderRoadmapGraph(roadmap, displayTopic);
  } catch (error) {
    console.error("Failed to fetch roadmap", error);
    renderRoadmapStatus(
      "Sorry, I couldn't generate a roadmap right now. Please try again in a moment.",
    );
  } finally {
    if (createRoadmapButton) {
      createRoadmapButton.disabled = false;
    }
  }
});

backToHomeFromRoadmap?.addEventListener("click", () => showView("home"));

// View modes:
// - "home": orb hero + roadmap input + Study with me button
// - "study": existing study text + chat UI
// - "roadmap": placeholder for future interactive roadmap built from the topic
