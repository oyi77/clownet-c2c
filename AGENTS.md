# CLAWNET C2C KNOWLEDGE BASE

**Generated:** 2026-02-09 09:00  
**Commit:** 31aa3cb  
**Branch:** master

## OVERVIEW
Multi-agent coordination relay. Node.js/Fastify server + Socket.io for real-time C2C protocol. Python sidecars proxy OpenClaw commands with telemetry.

## STRUCTURE
```
clownet-c2c/
├── server.js           # Main: Fastify + Socket.io relay + JSON persistence
├── client.py           # Python sidecar: telemetry + command proxy
├── views/
│   └── dashboard.ejs   # Terminal UI (Tailwind + Socket.io client)
├── public/
│   └── index.html      # Landing page
└── scripts/
    └── install.sh      # Skill installer
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add Socket.io event | server.js:95-168 | Main connection handler block |
| Change dashboard UI | views/dashboard.ejs | EJS template with inline Socket.io |
| Modify persistence | server.js:38-51 | JSON file persistence functions |
| Update sidecar | client.py | Command proxy + psutil telemetry |
| Add tests | perfection-tests.js | Atomic test suite pattern |

## CODE MAP
**Entry Point:** server.js  
**Key Flows:**
- Agent connect → Auth via SECRET_KEY → Add to `state.agents`
- Agent `report` → Update specs/sessions → Broadcast `fleet_update`
- Master `dispatch` → Target agent gets `command` event → Agent sends `task_result`
- Chat messages → Stored in `state.messages` (max 100) → Broadcast `chat_update`

**Data Persistence:**
- **Single System:** server.js → JSON files in DATA_DIR (tasks, messages)
- **Settings:** Separate settings.json for Supabase config (future use)

**Agent Protocol (C2CPv1):**
- Auth handshake: `{ token, agent_id, role, specs }`
- Events: `connect`, `report`, `dispatch`, `task_result`, `chat`

## CONVENTIONS
**Deviations from Standard Node.js:**
- No TypeScript, no linting, no formatter config
- Direct inline Socket.io setup (not modularized)
- Single-file server architecture (no separation of concerns)
- Mixed async patterns: callbacks + async/await
- Python sidecar instead of Node.js workers
- Dashboard auth via Bearer token in Authorization header

**Style:**
- Minimal error handling (catch blocks log to console)
- Direct state mutation (no state management library)
- Inline configs (PORT, SECRET_KEY from env with defaults)
- Terminal aesthetic (green glow, monospace fonts)

## ANTI-PATTERNS (THIS PROJECT)
❌ **NEVER** exceed 100 messages in chat log (hard limit enforced)  
❌ **NEVER** skip payload validation on Socket.io events (now enforced)  
❌ **DO NOT** add native Node modules (breaks Docker cross-platform)  
❌ **NEVER** access dashboard without Bearer auth header (401 protected)

## UNIQUE STYLES
- **Terminal UI Aesthetic:** Fira Code font, zinc color palette, green accents for "online" states
- **Encrypted Settings:** AES-256-CTR for Supabase credentials (state.js)
- **Exponential Backoff:** Python sidecar reconnects with 5→60s delay
- **Self-Healing:** Agents auto-reconnect, relay is stateless
- **Spec-Driven Development:** CLAWNET_V3_SPEC.md defines architecture philosophy

## COMMANDS
```bash
npm start              # Launch relay on PORT (default 3000)
node perfection-tests  # Run atomic test suite (requires PORT 3333)
node test-suite        # Run integration tests (fly.dev)
python client.py       # Start sidecar (requires CLAWNET_SECRET_KEY env)
```

## NOTES
**Gotchas:**
1. Dashboard requires Bearer token in Authorization header (e.g., `Authorization: Bearer very-secret-key-123`)
2. Python sidecar expects `openclaw` binary in PATH or OPENCLAW_BIN_PATH env
3. DATA_DIR auto-detects `/data` for Docker or local `./data`
4. Sessions array in agent state not persisted to JSON (ephemeral)
5. Dashboard specs use `cpu_percent` and `ram_percent` (match client.py keys)

**Version:**
- Unified to v3.2.0 across package.json, README, dashboard, and API

**Recent Improvements (v3.2.0):**
- ✅ Added dashboard authentication (Bearer token)
- ✅ Added Socket.io payload validation
- ✅ Fixed dashboard spec key mismatch (cpu_percent, ram_percent)
- ✅ Removed dead code (database.js, state.js)
- ✅ Unified version numbering
