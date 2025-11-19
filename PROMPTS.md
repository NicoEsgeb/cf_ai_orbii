## Prompt contract overview
Orbii constructs every model call inside `src/chatSession.ts`. The Durable Object receives the latest user message, loads the session’s stored study text and history, and then runs `env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages })`. This document mirrors that exact behavior so reviewers can check what the model sees.

## System prompt
- The first entry in every `messages` array is the fixed persona prompt from `ChatSession.handleChat`:

  > You are Orbii, an ethereal, friendly study buddy. Explain concepts for beginners, ask gentle follow-up questions, and keep things encouraging.

- This keeps Orbii’s tone consistent even when the user has not supplied study text yet.

## Study text injection
- When a session has stored study material, a second system message is appended right after the persona prompt.
- The Durable Object trims the study text to 4,000 characters and inserts it verbatim with this template:

  > The user provided the following study material (truncated if long). Use it as the main source when answering their questions:
  >
  > `{study_text_trimmed}`

- Example (the braces are replaced at runtime):

  > The user provided the following study material (truncated if long). Use it as the main source when answering their questions:
  >
  > Photosynthesis happens in the chloroplast... (continues up to 4,000 chars)

- If no study text is saved yet, this system message is skipped entirely.

## Conversation history
- The Durable Object keeps up to 10 prior chat messages per session.
- Those past user/assistant turns are appended after the system message(s) in chronological order to provide continuity.
- This mirrors the Chat Completions format: `[system, system?, old user, old assistant, ..., new user]`.

## New user messages
- The latest user text (trimmed in `ChatSession.handleChat`) is added as the final entry before the Workers AI call.
- The `messages` array is then passed directly to `env.AI.run`, so whatever the user typed is exactly what the model receives.

## Quiz mode trigger
- The frontend button labeled “Quiz me on this” (see `public/app.js`) sends a fixed user string stored in `QUIZ_PROMPT_MESSAGE`:

  > I'd like you to quiz me on my current study text. Please ask me one short question at a time.

- This string is treated like any other user message. Because the Durable Object keeps the study text and history intact, the next model response naturally switches into quiz behavior until the user asks something else.

## Workers AI call
- After the persona prompt, optional study text system message, prior turns, and the latest user message are assembled, the Durable Object runs:

  ```ts
  env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages });
  ```

- The returned `response` string is saved as the assistant reply and stored back into the session history, ensuring the next call includes both sides of the exchange.
