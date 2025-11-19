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

const SESSION_STORAGE_KEY = "orbii-session-id";
const STUDY_STATUS_DEFAULT_MESSAGE =
  "Paste text and click save to keep it with this session.";
const ORBII_ASSISTANT_GREETING =
  '👋 I\'m Orbii, your friendly study buddy. Paste some study text above, then ask me questions or say "quiz me" and I\'ll help you learn.';
const QUIZ_PROMPT_MESSAGE =
  "I'd like you to quiz me on my current study text. Please ask me one short question at a time.";
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

// Handle PDF selection so future steps can process it server-side.
pdfInput?.addEventListener("change", (event) => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file || file.type !== "application/pdf") {
    alert("Please select a PDF file.");
    input.value = "";
    return;
  }
  console.log(`Orbii PDF upload: ${file.name}, size: ${file.size} bytes`);
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
