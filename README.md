# cf_ai_orbii

## Workers AI setup
- The Worker expects a Workers AI binding named `AI` (see `wrangler.toml`).
- You need a Cloudflare account with Workers AI enabled to run `npx wrangler dev` or `npx wrangler deploy`.
- When deployed with that account, Orbii's chat endpoint `/api/chat` will be powered by the Llama 3 model instead of echoing.
