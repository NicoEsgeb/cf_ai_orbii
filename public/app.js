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

function sanitizeRoadmapResource(resource) {
  if (typeof resource !== "string") return "";
  const trimmed = resource.trim();
  if (!trimmed) return "";
  if (/https?:\/\//i.test(trimmed)) return "";
  if (/<\/?[a-z][^>]*>/i.test(trimmed)) return "";
  return trimmed;
}

function normalizeRoadmapStep(step, stepIndex) {
  const fallbackId = `step-${stepIndex + 1}`;
  const fallbackTitle = `Step ${stepIndex + 1}`;

  if (!step) return null;

  if (typeof step === "string") {
    const text = step.trim();
    if (!text) return null;
    return { id: fallbackId, title: text, summary: "", resources: [] };
  }

  if (typeof step !== "object") return null;

  const title =
    typeof step.title === "string" && step.title.trim()
      ? step.title.trim()
      : typeof step.name === "string" && step.name.trim()
        ? step.name.trim()
        : "";
  const summary =
    typeof step.summary === "string" && step.summary.trim() ? step.summary.trim() : "";
  const resolvedTitle = title || summary || fallbackTitle;

  if (!resolvedTitle) return null;

  const id =
    typeof step.id === "string" && step.id.trim()
      ? step.id.trim()
      : toIdPart(resolvedTitle)
        ? `step-${toIdPart(resolvedTitle)}`
        : fallbackId;

  const resourcesRaw = Array.isArray(step.resources)
    ? step.resources
    : typeof step.resources === "string"
      ? [step.resources]
      : [];

  const resources = resourcesRaw.map(sanitizeRoadmapResource).filter(Boolean);

  return {
    id,
    title: resolvedTitle,
    summary,
    resources,
  };
}

function renderRoadmap(roadmap, selectedSectionId) {
  if (!roadmapContent) return;

  const previousStepId =
    currentRoadmapStep && (currentRoadmapStep.domId || currentRoadmapStep.id)
      ? currentRoadmapStep.domId || currentRoadmapStep.id
      : null;

  if (!roadmap && currentRoadmap) {
    roadmap = currentRoadmap;
  }
  if (!roadmap) {
    roadmapContent.innerHTML =
      "<p class='roadmap-status'>Enter a topic on the home screen first.</p>";
    currentRoadmapSections = [];
    currentRoadmapStep = null;
    roadmapTaskSelection = null;
    roadmapChatUserMessages = 0;
    roadmapChatNudged = false;
    updateRoadmapChatLabel();
    return;
  }

  currentRoadmap = roadmap;
  const topicFromRoadmap =
    typeof roadmap.canonicalTopic === "string" && roadmap.canonicalTopic.trim()
      ? roadmap.canonicalTopic.trim()
      : typeof roadmap.topic === "string" && roadmap.topic.trim()
        ? roadmap.topic.trim()
        : null;
  const labelFromDom =
    roadmapTopic && typeof roadmapTopic.textContent === "string"
      ? roadmapTopic.textContent.trim()
      : null;
  currentRoadmapTopic = topicFromRoadmap || labelFromDom || currentRoadmapTopic || null;
  roadmapContent.innerHTML = "";
  const detailsScroll = document.querySelector(".roadmap-details-scroll");
  if (detailsScroll && !selectedSectionId) {
    detailsScroll.scrollTop = 0;
  }

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
  const sectionsWithDomIds = sections.map((section, index) => {
    const sectionDomId = makeSectionDomId(section, index);
    const stepsWithDomIds = Array.isArray(section?.steps)
      ? section.steps.map((step, stepIndex) => ({
          ...step,
          domId: makeStepDomId(sectionDomId, step, stepIndex),
        }))
      : [];
    return {
      ...section,
      domId: sectionDomId,
      steps: stepsWithDomIds,
    };
  });

  if (!sectionsWithDomIds.length) {
    const status = document.createElement("p");
    status.className = "roadmap-status";
    status.textContent = "No roadmap data available.";
    roadmapContent.appendChild(status);
    currentSelectedSectionId = null;
    currentRoadmapSections = [];
    currentRoadmapStep = null;
    updateRoadmapChatLabel();
    return;
  }

  const fallbackSectionId = sectionsWithDomIds[0].domId;
  const hasMatchingSelection = selectedSectionId
    ? sectionsWithDomIds.some((section) => section.domId === selectedSectionId)
    : false;
  const defaultSectionId = hasMatchingSelection ? selectedSectionId : fallbackSectionId;
  currentSelectedSectionId = defaultSectionId;
  currentRoadmapSections = sectionsWithDomIds;
  currentRoadmapStep =
    sectionsWithDomIds.find((section) => section.domId === defaultSectionId) || null;
  updateRoadmapChatLabel();

  const newStepId =
    currentRoadmapStep && (currentRoadmapStep.domId || currentRoadmapStep.id)
      ? currentRoadmapStep.domId || currentRoadmapStep.id
      : null;
  if (newStepId && newStepId !== previousStepId) {
    roadmapChatUserMessages = 0;
    roadmapChatNudged = false;
  }

  sectionsWithDomIds.forEach((section) => {
    const sectionDomId = section.domId;

    const card = document.createElement("div");
    card.className = "roadmap-section roadmap-step-card";
    card.dataset.sectionId = sectionDomId;
    card.dataset.stepId = sectionDomId;
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
      steps.forEach((step, stepIndex) => {
        if (!step || typeof step !== "object") return;

        const li = document.createElement("li");
        li.className = "roadmap-step-item";
        const stepDomId = makeStepDomId(sectionDomId, step, stepIndex);
        li.dataset.stepId = stepDomId;
        li.dataset.sectionId = sectionDomId;
        const completed = isStepCompleted(currentRoadmapTopic, stepDomId);
        if (completed) {
          li.classList.add("is-completed");
        }
        if (roadmapTaskSelection && roadmapTaskSelection === stepDomId) {
          li.classList.add("is-active");
        }

        const stepHeader = document.createElement("div");
        stepHeader.className = "roadmap-step-header";

        const stepTitle = document.createElement("div");
        stepTitle.className = "roadmap-step-title";
        stepTitle.textContent = toLabel(step?.title, "Step");

        const completeToggle = document.createElement("button");
        completeToggle.type = "button";
        completeToggle.className = `roadmap-step-toggle ${completed ? "is-completed" : ""}`;
        completeToggle.textContent = completed ? "Completed" : "Mark done";
        completeToggle.dataset.stepId = stepDomId;
        completeToggle.dataset.sectionId = sectionDomId;

        stepHeader.appendChild(stepTitle);
        stepHeader.appendChild(completeToggle);
        li.appendChild(stepHeader);

        if (typeof step?.summary === "string" && step.summary.trim()) {
          const stepSummary = document.createElement("div");
          stepSummary.className = "roadmap-step-summary";
          stepSummary.textContent = step.summary.trim();
          li.appendChild(stepSummary);
        }

        const resources = Array.isArray(step?.resources) ? step.resources : [];
        if (resources.length) {
          const resourcesList = document.createElement("ul");
          resourcesList.className = "roadmap-resources-list";
          resources.forEach((resource) => {
            const resourceText = sanitizeRoadmapResource(resource);
            if (!resourceText) return;
            const resourceItem = document.createElement("li");
            resourceItem.className = "roadmap-resource-item";
            resourceItem.textContent = resourceText;
            resourcesList.appendChild(resourceItem);
          });

          if (resourcesList.childNodes.length) {
            li.appendChild(resourcesList);
          }
        }

        list.appendChild(li);
      });
      card.appendChild(list);
    }

    roadmapContent.appendChild(card);
  });
  return defaultSectionId;
}

function scrollStepIntoView(stepId) {
  if (!stepId) return;
  const container = document.querySelector(".roadmap-details-scroll");
  if (!container) return;

  const card = container.querySelector(`[data-step-id="${stepId}"]`);
  if (!card) return;

  const containerRect = container.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const offset = cardRect.top - containerRect.top + container.scrollTop - 16;

  container.scrollTo({
    top: offset,
    behavior: "smooth",
  });
}

function getCurrentSectionDomId() {
  if (!currentRoadmapStep) return null;
  const sectionId = currentRoadmapStep.domId || currentRoadmapStep.id;
  if (sectionId) return sectionId;
  const idx = currentRoadmapSections.findIndex(
    (section) => section === currentRoadmapStep || section.domId === sectionId,
  );
  return makeSectionDomId(currentRoadmapStep, idx >= 0 ? idx : 0);
}

function getCurrentTaskTitle() {
  if (!currentRoadmapStep || !roadmapTaskSelection) return null;
  const steps = Array.isArray(currentRoadmapStep.steps) ? currentRoadmapStep.steps : [];
  const sectionDomId = getCurrentSectionDomId();
  if (!sectionDomId) return null;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const domId = makeStepDomId(sectionDomId, step, i);
    if (domId === roadmapTaskSelection) {
      return toLabel(step?.title, null);
    }
  }
  return null;
}

function findStepByDomId(stepDomId) {
  if (!stepDomId || !currentRoadmapSections.length) return null;
  for (let i = 0; i < currentRoadmapSections.length; i += 1) {
    const section = currentRoadmapSections[i];
    const steps = Array.isArray(section?.steps) ? section.steps : [];
    for (let j = 0; j < steps.length; j += 1) {
      const step = steps[j];
      const domId = makeStepDomId(section?.domId, step, j);
      if (domId === stepDomId) {
        return { section, step, stepIndex: j };
      }
    }
  }
  return null;
}

function updateRoadmapChatLabel() {
  const stepLabelEl = document.getElementById("roadmap-chat-step-label");
  if (!stepLabelEl) return;
  if (currentRoadmapStep) {
    const label = toLabel(currentRoadmapStep.title, "this step");
    const taskLabel = getCurrentTaskTitle();
    stepLabelEl.textContent = taskLabel
      ? `Chatting about: ${label} • ${taskLabel}`
      : `Chatting about: ${label}`;
  } else {
    stepLabelEl.textContent = "Select a step to start chatting.";
  }
}

function appendRoadmapChatMessage(text, from) {
  const messagesEl = document.getElementById("roadmap-chat-messages");
  if (!messagesEl) return;
  const div = document.createElement("div");
  div.className = `orbii-chat-message ${from}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function getNextRoadmapSection() {
  if (!currentRoadmapSections.length || !currentRoadmapStep) return null;
  const currentId = currentRoadmapStep.domId || currentRoadmapStep.id;
  if (!currentId) return null;

  const currentIndex = currentRoadmapSections.findIndex(
    (section) => section.domId === currentId || section.id === currentId,
  );
  if (currentIndex < 0) return null;

  const remaining = currentRoadmapSections.slice(currentIndex + 1);
  const nextNonBranch = remaining.find(
    (section) => normalizeSectionCategory(section?.category) !== "BRANCH",
  );
  return nextNonBranch || remaining[0] || null;
}

function maybeNudgeToNextStep() {
  if (roadmapChatNudged) return;
  if (roadmapChatUserMessages < 4) return;
  const progress = currentRoadmapStep ? getStepProgress(currentRoadmapStep) : null;
  if (!progress || progress.pendingTitles.length > 0) return;
  const nextSection = getNextRoadmapSection();
  if (!nextSection) return;
  appendRoadmapChatMessage(
    "If this feels clear, you can click the next box in the roadmap to keep going!",
    "orbii",
  );
  roadmapChatNudged = true;
}

const CYTOSCAPE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.1/cytoscape.min.js";
let cytoscapeLoader;
let roadmapCy;
let currentRoadmap = null;
let currentSelectedSectionId = null;
let roadmapResizeTimeout;
let currentRoadmapStep = null;
let currentRoadmapTopic = null;
let currentRoadmapSections = [];
let roadmapChatSetupComplete = false;
let roadmapChatUserMessages = 0;
let roadmapChatNudged = false;
let roadmapChatSessionId = null;
let roadmapTaskSelection = null;
const ROADMAP_PROGRESS_KEY = "orbii-roadmap-progress";
let roadmapProgress = loadRoadmapProgress();
const quizCache = {};
let quizModal;
let quizModalContent;
let quizModalQuestion;
let quizModalOptions;
let quizModalClose;

function loadRoadmapProgress() {
  try {
    const raw = window.localStorage?.getItem(ROADMAP_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (error) {
    console.warn("Unable to load roadmap progress", error);
  }
  return {};
}

function persistRoadmapProgress() {
  try {
    window.localStorage?.setItem(ROADMAP_PROGRESS_KEY, JSON.stringify(roadmapProgress));
  } catch (error) {
    console.warn("Unable to persist roadmap progress", error);
  }
}

function isStepCompleted(topic, stepId) {
  if (!topic || !stepId) return false;
  const topicKey = topic.toLowerCase();
  return Boolean(roadmapProgress?.[topicKey]?.[stepId]);
}

function setStepCompleted(topic, stepId, done) {
  if (!topic || !stepId) return;
  const topicKey = topic.toLowerCase();
  if (!roadmapProgress[topicKey]) {
    roadmapProgress[topicKey] = {};
  }
  if (done) {
    roadmapProgress[topicKey][stepId] = true;
  } else {
    delete roadmapProgress[topicKey][stepId];
  }
  persistRoadmapProgress();
}

function getStepProgress(section) {
  const steps = Array.isArray(section?.steps) ? section.steps : [];
  const pendingTitles = [];
  const completedTitles = [];
  steps.forEach((step) => {
    const stepId = step?.domId || step?.id || step?.title;
    const title = toLabel(step?.title, "");
    if (!stepId || !title) return;
    if (isStepCompleted(currentRoadmapTopic, stepId)) {
      completedTitles.push(title);
    } else {
      pendingTitles.push(title);
    }
  });
  return { pendingTitles, completedTitles };
}

function ensureQuizModal() {
  if (quizModal) return;
  quizModal = document.createElement("div");
  quizModal.className = "quiz-modal-overlay hidden";
  quizModal.innerHTML = `
    <div class="quiz-modal">
      <div class="quiz-modal-header">
        <h3>Quick check-in</h3>
        <button type="button" class="quiz-modal-close" aria-label="Close quiz">&times;</button>
      </div>
      <div class="quiz-modal-body">
        <p class="quiz-modal-question"></p>
        <div class="quiz-modal-options"></div>
        <p class="quiz-modal-status"></p>
      </div>
    </div>
  `;
  document.body.appendChild(quizModal);
  quizModalContent = quizModal.querySelector(".quiz-modal");
  quizModalQuestion = quizModal.querySelector(".quiz-modal-question");
  quizModalOptions = quizModal.querySelector(".quiz-modal-options");
  quizModalClose = quizModal.querySelector(".quiz-modal-close");
  const statusEl = quizModal.querySelector(".quiz-modal-status");

  quizModalClose?.addEventListener("click", hideQuizModal);
  quizModal.addEventListener("click", (event) => {
    if (event.target === quizModal) hideQuizModal();
  });

  quizModal.showStatus = (message, tone = "info") => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.dataset.tone = tone;
  };
}

function hideQuizModal() {
  if (!quizModal) return;
  quizModal.classList.add("hidden");
  quizModalQuestion.textContent = "";
  quizModalOptions.innerHTML = "";
  quizModal.showStatus?.("", "info");
}

function renderQuizModal(quiz, stepId, sectionId) {
  ensureQuizModal();
  quizModal.classList.remove("hidden");
  quizModalQuestion.textContent = quiz.question;
  quizModalOptions.innerHTML = "";
  quizModal.showStatus?.("", "info");

  const letters = ["A", "B", "C", "D"];
  quiz.options.forEach((opt, idx) => {
    const letter = letters[idx] || String.fromCharCode(65 + idx);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiz-option";
    button.textContent = `${letter}. ${opt}`;
    button.addEventListener("click", () => {
      const correct = quiz.correctOption?.trim().toUpperCase() || "A";
      if (letter.toUpperCase() === correct) {
        quizModal.showStatus?.("Nice! Marked as completed.", "success");
        setStepCompleted(currentRoadmapTopic, stepId, true);
        hideQuizModal();
        renderRoadmap(currentRoadmap, sectionId || currentSelectedSectionId);
        roadmapTaskSelection = null;
      } else {
        quizModal.showStatus?.("Not quite. Try another option.", "error");
      }
    });
    quizModalOptions.appendChild(button);
  });
}

async function loadQuiz(stepId, sectionId) {
  if (!currentRoadmapTopic) throw new Error("Missing topic");
  const lookup = findStepByDomId(stepId);
  if (!lookup) throw new Error("Step not found");
  const { step } = lookup;
  if (quizCache[stepId]) return quizCache[stepId];

  const body = {
    topic: currentRoadmapTopic,
    stepTitle: toLabel(step?.title, "this step"),
    stepSummary: toLabel(step?.summary, ""),
  };

  const res = await fetch("/api/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Quiz request failed: ${res.status}`);
  const quiz = await res.json();
  if (!quiz || !quiz.question || !Array.isArray(quiz.options)) {
    throw new Error("Invalid quiz payload");
  }
  quizCache[stepId] = quiz;
  return quiz;
}

async function startQuizForStep(stepId, sectionId) {
  ensureQuizModal();
  quizModalQuestion.textContent = "Loading quiz…";
  quizModalOptions.innerHTML = "";
  quizModal.showStatus?.("", "info");
  quizModal.classList.remove("hidden");

  try {
    const quiz = await loadQuiz(stepId, sectionId);
    renderQuizModal(quiz, stepId, sectionId);
  } catch (error) {
    console.error("Quiz load failed", error);
    quizModal.showStatus?.("Couldn't load a quiz right now. Please try again.", "error");
  }
}
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

function makeStepDomId(sectionDomId, step, index) {
  const sectionPart = sectionDomId || "section";
  const stepPart = toIdPart(step?.id || step?.title || "");
  const idx = Number.isFinite(index) ? index : 0;
  if (step?.domId) return step.domId;
  if (stepPart) return `${sectionPart}__${stepPart}`;
  return `${sectionPart}__${idx}`;
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
              .map((step, stepIdx) => normalizeRoadmapStep(step, stepIdx))
              .filter(Boolean)
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

    const rawSteps = stepsByFrom.get(node.id) || [];
    const steps = rawSteps
      .map((stepText, stepIdx) => normalizeRoadmapStep(stepText, stepIdx))
      .filter(Boolean);

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
  const VERTICAL_GAP = 150;
  const BRANCH_OFFSET_X = 260;
  const TOP_Y = 0;
  const CENTER_X = 0;

  const positions = new Map();

  const topicId = `topic-${toIdPart(topicLabel) || "center"}`;
  const elements = [];

  positions.set(topicId, { x: CENTER_X, y: TOP_Y });
  elements.push({
    data: {
      id: topicId,
      label: toShortLabel(topicLabel || "Topic", 26),
      level: 0,
    },
    position: positions.get(topicId),
  });

  if (!sections.length) {
    return { elements, topicId };
  }

  const mainSections = sections.filter((section) => section.category !== "BRANCH");
  const mainPath = mainSections.length ? mainSections : sections;

  const getSectionDomId = (section) => {
    const index = sections.indexOf(section);
    return makeSectionDomId(section, index >= 0 ? index : 0);
  };

  const mainEntries = mainPath.map((section, sectionIndex) => {
    const category = normalizeSectionCategory(section?.category);
    const { fullTitle, shortLabel } = deriveSectionLabel(section, sectionIndex, category);
    const sectionId = getSectionDomId(section);
    const y = TOP_Y + (sectionIndex + 1) * VERTICAL_GAP;

    positions.set(sectionId, { x: CENTER_X, y });

    elements.push({
      data: {
        id: sectionId,
        label: shortLabel,
        fullTitle,
        level: 1,
        category,
        sectionId,
      },
      position: positions.get(sectionId),
    });

    return {
      section,
      sectionId,
      category,
      index: sectionIndex,
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

  const normalizedBranchSections = sections.filter(
    (section) => normalizeSectionCategory(section?.category) === "BRANCH",
  );

  const branchAnchor =
    [...mainEntries].reverse().find(
      (entry) => entry.category === "CORE_SKILLS" || entry.category === "FOUNDATIONS",
    ) ?? mainEntries[mainEntries.length - 1];

  const branchParentId = branchAnchor ? branchAnchor.sectionId : topicId;
  const anchorIndex = branchAnchor ? branchAnchor.index : mainEntries.length - 1;
  const branchLevelY = TOP_Y + (anchorIndex + 2) * VERTICAL_GAP;

  normalizedBranchSections.forEach((section, branchIndex) => {
    const sectionId = getSectionDomId(section);
    const { fullTitle, shortLabel } = deriveSectionLabel(
      { ...section, title: section.branchLabel || section.title },
      branchIndex,
      "BRANCH",
    );

    const centerIndex = (normalizedBranchSections.length - 1) / 2;
    const offsetIndex = branchIndex - centerIndex;
    const x = CENTER_X + offsetIndex * BRANCH_OFFSET_X;
    const y = branchLevelY;

    positions.set(sectionId, { x, y });

    elements.push({
      data: {
        id: sectionId,
        label: shortLabel,
        fullTitle,
        level: 1,
        category: "BRANCH",
        sectionId,
      },
      position: positions.get(sectionId),
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

function setSelectedSection(sectionId, options = {}) {
  if (!sectionId || !currentRoadmap) return;
  const { fromGraph = false } = options;
  const previousSectionId = currentSelectedSectionId;

  const activeSectionId = renderRoadmap(null, sectionId);
  if (!activeSectionId) return;
  if (activeSectionId !== previousSectionId) {
    roadmapTaskSelection = null;
  }

  if (roadmapCy && !fromGraph) {
    const node = roadmapCy.$id(activeSectionId);
    if (node && node.length) {
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
    }
  }

  scrollStepIntoView(activeSectionId);
}

function fitRoadmapToView(cy, padding = 30, zoomBoost = 1.2) {
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
    name: "preset",
    fit: false,
    padding: 10,
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
          "font-size": 14,
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
  layout.on("layoutstop", () => fitRoadmapToView(roadmapCy));
  layout.run();
  fitRoadmapToView(roadmapCy);

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
      setSelectedSection(sectionId, { fromGraph: true });
    }
  });
}

function setupRoadmapChat(options = {}) {
  const { resetTranscript = false } = options;
  const messagesEl = document.getElementById("roadmap-chat-messages");
  const inputEl = document.getElementById("roadmap-chat-input");
  const formEl = document.getElementById("roadmap-chat-form");

  if (!messagesEl || !inputEl || !formEl) return;

  if (!roadmapChatSessionId || resetTranscript) {
    roadmapChatSessionId = createNewSessionId();
  }

  if (resetTranscript || !messagesEl.dataset.orbiiRoadmapGreeting) {
    messagesEl.innerHTML = "";
    appendRoadmapChatMessage(
      "Hi! I’m Orbii. Choose a step in the roadmap and ask me anything about it.",
      "orbii",
    );
    messagesEl.dataset.orbiiRoadmapGreeting = "true";
    roadmapChatUserMessages = 0;
    roadmapChatNudged = false;
  }

  async function sendToOrbii(userText) {
    if (!currentRoadmapTopic || !currentRoadmapStep) {
      appendRoadmapChatMessage(
        "Pick a step in the roadmap first, then ask me about it!",
        "orbii",
      );
      return;
    }

    const stepTitle = toLabel(currentRoadmapStep.title, "this step");
    const stepId = currentRoadmapStep.domId || currentRoadmapStep.id;
    const { pendingTitles, completedTitles } = getStepProgress(currentRoadmapStep);
    const taskFocus = getCurrentTaskTitle();

    const contextPrefix =
      `You are Orbii, my friendly study buddy. ` +
      `We are following a learning roadmap about "${currentRoadmapTopic}". ` +
      `Right now we are on this step of the roadmap: "${stepTitle}". ` +
      `Only answer questions related to this step or its prerequisites, ` +
      `and keep your answers short, clear and supportive.`;

    const progressContextParts = [];
    if (taskFocus) {
      progressContextParts.push(`Current task to focus on: "${taskFocus}".`);
    }
    if (pendingTitles.length) {
      progressContextParts.push(
        `Pending tasks in this step: ${pendingTitles.map((t) => `"${t}"`).join(", ")}. ` +
          `Guide the user through them one by one and check understanding before moving on.`,
      );
    } else {
      progressContextParts.push(
        "All tasks in this step are marked complete. Offer a quick recap or suggest moving to the next roadmap step.",
      );
    }
    if (completedTitles.length) {
      progressContextParts.push(`Already done: ${completedTitles.join(", ")}.`);
    }

    const progressContext = progressContextParts.join(" ");

    const fullMessage = `${contextPrefix}\n${progressContext}\n\nUser question: ${userText}`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          sessionId: roadmapChatSessionId,
          mode: "roadmap",
          topic: currentRoadmapTopic,
          stepId: stepId || stepTitle,
        }),
      });

      const data = await res.json();
      if (data && typeof data.sessionId === "string" && data.sessionId.trim()) {
        roadmapChatSessionId = data.sessionId.trim();
      }

      if (data.reply) {
        appendRoadmapChatMessage(data.reply, "orbii");
      } else {
        appendRoadmapChatMessage(
          "Hmm, I had trouble replying. Try again in a moment.",
          "orbii",
        );
      }
      maybeNudgeToNextStep();
    } catch (error) {
      console.error("Roadmap chat error", error);
      appendRoadmapChatMessage(
        "Something went wrong talking to me. Please try again.",
        "orbii",
      );
    }
  }

  if (!roadmapChatSetupComplete) {
    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      appendRoadmapChatMessage(text, "user");
      roadmapChatUserMessages += 1;
      inputEl.value = "";
      sendToOrbii(text).catch((error) => {
        console.error("Roadmap chat error", error);
        appendRoadmapChatMessage(
          "Something went wrong talking to me. Please try again.",
          "orbii",
        );
      });
    });

    roadmapChatSetupComplete = true;
  }

  updateRoadmapChatLabel();
}

window.addEventListener("resize", () => {
  if (roadmapResizeTimeout) {
    clearTimeout(roadmapResizeTimeout);
  }

  roadmapResizeTimeout = window.setTimeout(() => {
    if (roadmapCy) {
      fitRoadmapToView(roadmapCy);
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

if (goToStudyButton) {
  goToStudyButton.disabled = true;
  goToStudyButton.title = "File study uploads are coming soon.";
}
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
  setupRoadmapChat();
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
    roadmapTaskSelection = null;

    if (roadmapTopic) {
      roadmapTopic.textContent = displayTopic;
    } else if (roadmapTopicTitle) {
      roadmapTopicTitle.textContent = `Roadmap for: ${displayTopic}`;
    }

    currentRoadmapTopic = displayTopic;
    renderRoadmap(roadmap);
    await renderRoadmapGraph(roadmap, displayTopic);
    setupRoadmapChat({ resetTranscript: true });
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

roadmapContent?.addEventListener("click", (event) => {
  const toggle = event.target?.closest(".roadmap-step-toggle");
  if (toggle && roadmapContent.contains(toggle)) {
    const stepId = toggle.dataset.stepId;
    const sectionId = toggle.dataset.sectionId;
    if (currentRoadmapTopic && stepId) {
      const alreadyCompleted = isStepCompleted(currentRoadmapTopic, stepId);
      if (alreadyCompleted) {
        setStepCompleted(currentRoadmapTopic, stepId, false);
        renderRoadmap(currentRoadmap, sectionId || currentSelectedSectionId);
      } else {
        startQuizForStep(stepId, sectionId).catch((error) => {
          console.error("Quiz flow error", error);
        });
      }
    }
    return;
  }

  const stepItem = event.target?.closest(".roadmap-step-item");
  if (stepItem && roadmapContent.contains(stepItem)) {
    const stepId = stepItem.dataset.stepId;
    const sectionId = stepItem.dataset.sectionId;
    roadmapTaskSelection = stepId || null;
    if (sectionId) {
      setSelectedSection(sectionId);
    }
    return;
  }

  const card = event.target?.closest(".roadmap-section");
  if (!card || !roadmapContent.contains(card)) return;

  const sectionId = card.dataset.sectionId;
  if (sectionId) {
    setSelectedSection(sectionId);
  }
});

// View modes:
// - "home": orb hero + roadmap input + Study with me button
// - "study": existing study text + chat UI
// - "roadmap": placeholder for future interactive roadmap built from the topic
