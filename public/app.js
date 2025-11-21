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

function renderRoadmap(roadmap) {
  if (!roadmapContent) return;
  roadmapContent.innerHTML = "";

  const overview =
    roadmap && typeof roadmap.overview === "string"
      ? roadmap.overview.trim()
      : "";
  if (overview) {
    const overviewEl = document.createElement("p");
    overviewEl.className = "roadmap-overview";
    overviewEl.textContent = overview;
    roadmapContent.appendChild(overviewEl);
  }

  const sections = Array.isArray(roadmap?.sections) ? roadmap.sections : [];
  if (!sections.length) {
    const status = document.createElement("p");
    status.className = "roadmap-status";
    status.textContent = "No roadmap data available.";
    roadmapContent.appendChild(status);
    return;
  }

  sections.forEach((section) => {
    const card = document.createElement("div");
    card.className = "roadmap-section";

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
        const li = document.createElement("li");
        li.textContent = step.trim();
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    roadmapContent.appendChild(card);
  });
}

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
  if (roadmapTopic) {
    roadmapTopic.textContent = topic;
  } else if (roadmapTopicTitle) {
    roadmapTopicTitle.textContent = `Roadmap for: ${topic}`;
  }

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
    renderRoadmap(roadmap);
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
