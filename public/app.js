const chatEl = document.getElementById("orbii-chat");
const toggleBtn = document.getElementById("orbii-toggle");
const closeBtn = document.getElementById("orbii-close");
const messagesEl = document.getElementById("orbii-messages");
const formEl = document.getElementById("orbii-form");
const inputEl = document.getElementById("orbii-input");
const studyForm = document.getElementById("orbii-study-form");
const studyTextEl = document.getElementById("orbii-study-text");
const studyStatusEl = document.getElementById("orbii-study-status");

const SESSION_STORAGE_KEY = "orbii-session-id";
let sessionId;

try {
  const storedSession = window.localStorage?.getItem(SESSION_STORAGE_KEY);
  if (storedSession) {
    sessionId = storedSession;
  }
} catch (error) {
  console.warn("Unable to read Orbii session from storage", error);
}

if (!sessionId) {
  const newSessionId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionId = newSessionId;

  try {
    window.localStorage?.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch (error) {
    console.warn("Unable to persist Orbii session ID", error);
  }
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

function setStudyStatus(message) {
  if (!studyStatusEl) return;
  studyStatusEl.textContent = message;
}

toggleBtn?.addEventListener("click", () => {
  const isOpen = chatEl?.classList.contains("is-open");
  setChatOpen(!isOpen);
});

closeBtn?.addEventListener("click", () => setChatOpen(false));

formEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) return;

  appendMessage("user", text);
  inputEl.value = "";

  const submitButton = formEl.querySelector("button[type=submit]");
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
