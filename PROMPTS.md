## Orbii + Workers AI
This doc captures how Orbii composes prompts for Workers AI so reviewers can see exactly what the model receives.

## System prompt: Orbii’s personality
Orbii always starts with a single system message before any user input. The current text (from `src/chatSession.ts`) is:

> You are Orbii, an ethereal, friendly study buddy. Explain concepts for beginners, ask gentle follow-up questions, and keep things encouraging.

When study text is available we add a second system message so the model treats that material as the primary source:

> The user provided the following study material (truncated if long). Use it as the main source when answering their questions:
>
> `<truncated study text here>`

## How we build each request
Every chat request sent through `env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages })` includes:
1. The system prompt above (always included).
2. The saved study text for that session (trimmed to 4,000 characters) or, in the future, a short summary string if we add one.
3. Up to 10 of the most recent conversation turns so the LLM remembers what was asked and how it responded.
4. The new user message.

This results in a chronological `messages` array that mirrors the OpenAI/Workers AI Chat Completions format. Study text is injected as “context” document text so Orbii can answer questions about what the learner pasted, quiz them on those passages, or reference specific facts without hallucinating.

### Quiz mode
The frontend occasionally sends a fixed user message to switch Orbii into a quiz cadence. When a learner taps “Quiz me on this”, the next `messages` array includes a user entry such as:

> I'd like you to quiz me on my current study text. Please ask me one short question at a time.

This is treated like any other user message when `env.AI.run("@cf/meta/llama-3.1-8b-instruct", …)` calls the Workers AI Llama 3.1 8B Instruct model. The Durable Object then keeps the study text + chat history intact, so the model naturally responds with quiz-style prompts until the learner changes the topic.

## Future prompt ideas
- “Adaptive quiz mode” where Orbii keeps quizzing but adjusts difficulty until the user says “explain”.
- “Summary mode” to condense long study text into five key points before chatting.
- “Flashcard mode” that turns the most important sentences into spaced-repetition cards.
- “Energy boost mode” with more motivational language before exams or study sprints.
