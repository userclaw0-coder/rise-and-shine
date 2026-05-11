# Local Inference (Mac-hosted, Tailscale-accessed)

Rise-and-Shine supports running its AI workload on a local Mac via Ollama, with the Next.js app also running on the Mac and exposed to mobile devices over Tailscale. The deployed Vercel app stays as a cloud-only fallback (uses Anthropic).

## Topology

```
M5 Max Mac (always on, plugged in)
 ├── Ollama @ :11434           hermes3:70b (main), gemma3:27b (extractor),
 │                              mxbai-embed-large (embeddings)
 └── Next.js  @ :3000          npm run start; reads/writes Supabase

Tailscale mesh
 └── Android / desktop browsers → http://toms-macbook-pro.tail91184c.ts.net:3000

Vercel (cloud fallback)
 └── https://rise-and-shine-hazel.vercel.app   INFERENCE_POLICY=cloud-only
```

Same Supabase database, two app instances, different brains.

## Provider abstraction

[`lib/ai-provider.js`](../lib/ai-provider.js) exposes `chatCompletion({ system, messages, tools, onChunk, policy, tier })`.

- **`policy`** picks the routing strategy per call:
  - `default` — honor `INFERENCE_POLICY` env var
  - `cloud-only` — never use local; always Anthropic (or OpenAI)
  - `local-preferred` — Ollama if reachable; fall back to cloud
  - `local-only` — Ollama or error
- **`tier`** picks the model size:
  - `main` — chat / Reorient / planner (Hermes 3 70B locally, Sonnet on cloud)
  - `extractor` — memory writer / background tasks (Gemma 3 27B locally, Haiku on cloud)

Per-call overrides let weekly review use Sonnet while memory extraction runs on Hermes/Gemma without changing global config.

## Env vars

```bash
# Default routing
INFERENCE_POLICY=local-preferred       # default | cloud-only | local-preferred | local-only

# Local (Ollama)
LOCAL_INFERENCE_URL=http://localhost:11434   # Mac runs both app and Ollama
LOCAL_MAIN_MODEL=hermes3:70b
LOCAL_EXTRACTOR_MODEL=gemma3:27b
OLLAMA_KEEP_ALIVE=1h                    # keeps model loaded between requests

# Cloud (Anthropic by default; OpenAI also supported)
AI_PROVIDER=anthropic
JARVIS_MODEL=claude-sonnet-4-20250514
EXTRACTOR_PROVIDER=anthropic
EXTRACTOR_MODEL=claude-haiku-4-5-20251001

# Embeddings (defaults to local Ollama)
EMBED_PROVIDER=ollama                   # ollama | openai | voyage
EMBED_MODEL=mxbai-embed-large
EMBED_DIM=1024
```

On **Vercel**, override `INFERENCE_POLICY=cloud-only` so the production deploy never tries to reach a Mac it can't see.

## Setup on a fresh Mac

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Ollama + Tailscale
brew install ollama
brew services start ollama
brew install --cask tailscale  # then sign in via the menu-bar app

# Models
ollama pull hermes3:70b
ollama pull gemma3:27b
ollama pull mxbai-embed-large

# App
git clone https://github.com/userclaw0-coder/rise-and-shine.git
cd rise-and-shine
npm install
npx vercel link --yes --project rise-and-shine
npx vercel env pull .env.local
# Append the LOCAL_INFERENCE_URL / LOCAL_MAIN_MODEL block (see Env vars above)

npm run build
npm run start                   # or npm run dev during development
```

## Verifying the stack

```bash
npm run verify:local-inference
```

Runs end-to-end: Ollama reachable → models present → Hermes plain reply → Hermes tool call → embeddings → cloud-only path.

## Keeping the Mac up

- **Plug it in.** 70B inference draws ~50W under load.
- **Sleep settings.** `pmset -a sleep 0 disksleep 0 displaysleep 30` keeps the system awake while letting the display sleep. Or use `caffeinate -di &` in a persistent terminal.
- **Lid closed?** Connect an external display, mouse, and keyboard to enable clamshell mode — otherwise the Mac sleeps regardless of `pmset`.
- **Ollama service.** `brew services list` to confirm `ollama` is `started`. Set `OLLAMA_KEEP_ALIVE=1h` (or longer) so the 70B doesn't unload between requests.

## Mobile (Android / S23 Ultra)

1. Install the Tailscale Android app, sign in with the same account
2. Confirm the Mac appears under "Machines"
3. Open Chrome → `http://toms-macbook-pro.tail91184c.ts.net:3000`
4. Bookmark it; consider "Add to Home screen" for a PWA-style icon

When you're off the tailnet (rare with Tailscale-on-Android), use the Vercel URL instead — same data, cloud inference.

## Switching models

```bash
# Swap main chat to Llama 3.3 70B for comparison
LOCAL_MAIN_MODEL=llama3.3:70b npm run start

# Use Qwen 3 MoE as extractor (faster, MoE with ~3B active params)
LOCAL_EXTRACTOR_MODEL=qwen3.6:35b-a3b npm run start

# Run a smoke test against a different model without changing config
ollama run llama3.3:70b "Reply: ready"
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| First request after idle takes 60s+ | Ollama is cold-loading the 70B | Expected; subsequent requests are fast. Increase `OLLAMA_KEEP_ALIVE`. |
| `Ollama unreachable` from verify script | Service not running | `brew services start ollama` |
| Phone can't reach Mac | Tailscale not active on phone, or Mac sleeping | Open Tailscale on phone; check Mac wake settings |
| Tool calls return text instead of structured calls | Model doesn't support tools (rare) or system prompt unclear | Confirm with `verify:local-inference`; Hermes 3 70B is the known-good choice |
| Build fails with `supabaseUrl is required` | `.env.local` missing | `npx vercel env pull .env.local` |
