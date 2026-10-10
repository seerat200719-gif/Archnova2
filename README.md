# ArchNova

AI home designer: Three.js 3D frontend (plain HTML/CSS/JS) + Express/MongoDB backend. One command serves both.

## Status (honest)
| Area | State |
|---|---|
| Frontend (3D scene, floor plan, customization, history, cost, insights) | Original features kept. New: sign in / register, My Projects (open, rename, duplicate, delete with confirmation, thumbnails, search), Save with auto-save, dirty/saving/saved/failed indicator, revision-conflict prompt, retries, discard-changes confirmation. **Logic is covered by headless tests; the screens have not been clicked through in a real browser.** Guests still save to browser storage only (labelled as such). |
| Backend: auth, projects, export/import, health, inspire | Implemented and covered by automated tests (in-memory test repository) |
| MongoDB (Mongoose) layer | Implemented; schema validation tested. **Not tested against a live MongoDB** (needs your Atlas URI) |
| AI endpoints | Implemented with strict schema + geometry validation + repair/regenerate. Tested with a **mocked** provider. **Not tested against the real provider** (needs your API key) |
| SerpApi inspiration | Implemented, tested with mocked responses. **Not tested live** |
| Renderer support for AI layouts | Done: rooms, walls, doors on room walls, spec windows, stairs with floor opening, flat/gable/mono roofs, plot-size-aware exterior, floor plan, walkthrough, inspector. AI Design tab: Generate, Regenerate, Modify, Apply, Revert, Discard, Save, Export. Built headlessly (stubbed WebGL); **never viewed in a real browser or with a real AI response**. Limits: 1 or 2 floors, one straight stair, windows on exterior walls only |
| Exports and import (Phase 8) | Project JSON (versioned), floor plan SVG and PDF (real vector geometry + room schedule), design summary PDF (cost with assumptions and limitations), 3D preview PNG, 3D model GLB, backup/restore of all projects, JSON import with server validation and confirmation. Server exports tested; the GLB passes the Khronos glTF validator (tested without textures, headlessly). **Download buttons not clicked in a real browser; GLB with real textures and the browser file picker untested** |

## Run
```bash
npm install
cp .env.example .env      # then edit it
npm start                 # http://localhost:3000   (npm run dev to auto-restart)
npm test                  # 65 tests, no external services needed
```
Requires Node 22+. Without `MONGODB_URI` the server still starts: pages and `/api/health` work, auth/projects return `503 db_unavailable`.
`DB_MODE=memory` gives a **non-persistent** local trial (data lost on restart; refused in production).

## Setup guides
- **MongoDB Atlas**: create a free cluster, Database Access > add a user, Network Access > allow your IP, Connect > Drivers > copy the URI into `MONGODB_URI` (add `/archnova` as the database name). Troubleshooting: `bad auth` = wrong user/password (URL-encode special characters); timeout = IP not allowed in Network Access.
- **AI provider**: get a key from console.anthropic.com, set `ANTHROPIC_API_KEY`; `AI_MODEL` is configurable. Other providers can be added in `backend/services/ai.js`.
- **SerpApi**: key from serpapi.com/manage-api-key into `SERPAPI_API_KEY`. Without it `/api/inspire` returns `503 not_configured`.

## Architecture
```
Browser (index.html, js/app.js, Three.js)
   │  fetch /api/*  (cookie session, X-Requested-With: archnova)
   ▼
Express (backend/app.js): helmet CSP · CORS allowlist · JSON 1MB · rate limits · CSRF header
   ├─ routes/auth      bcrypt + JWT in httpOnly cookie (logout revokes via tokenVersion)
   ├─ routes/projects  owner-scoped CRUD, optimistic concurrency (rev → 409), export/import
   ├─ routes/ai        provider → JSON → zod → geometry validation → repair → 1 regenerate → 422
   ├─ /api/inspire     SerpApi proxy (validated, cached 10 min, 10 s timeout, https-only URLs)
   └─ repo/            mongo.js (Mongoose) | memory.js (tests / explicit local trial)
```
Design spec (`backend/validators/design.js`, schemaVersion 1): units metres, x = east, z = south, entrance at z = plot.length; rooms are rectangles per floor; doors lie on room walls; windows on exterior walls; stairs link floors. Validation rejects overlaps, out-of-plot rooms, bad floors, doors on no wall, no entrance, windows on interior walls. It is a concept-layout check, **not** structural or building-code validation.

## API
All JSON. Errors: `{ok:false,error,message,details?}`. Mutating requests need header `X-Requested-With: archnova`.
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | db / ai / search configuration status |
| POST | `/api/auth/register` `/login` `/logout` | GET `/api/auth/me` |
| POST/GET | `/api/projects` | create / list (no heavy fields; `?q=` name search) |
| GET/PUT/PATCH/DELETE | `/api/projects/:id` | PUT/PATCH need current `rev`; stale → 409 |
| POST | `/api/projects/:id/duplicate` | |
| GET | `/api/projects/:id/export` | `{format:"archnova-project",schemaVersion:1,exportedAt,project}` |
| POST | `/api/projects/import` | validated envelope |
| POST | `/api/ai/generate-design` `modify-design` `explain-design` | need AI key; rate limited |
| POST | `/api/ai/estimate-cost` `analyze-design` | deterministic; optional `narrate:true` adds AI text |
| POST | `/api/export/floorplan.svg` `floorplan.pdf` `summary.pdf` | body `{plan, floor?}`; stateless, no login needed; rate limited |
| POST | `/api/export/validate-import` | validates a project or backup file, nothing is saved |
| GET | `/api/projects/backup` | all of the user's projects (no thumbnails) as `archnova-backup` |
| POST | `/api/projects/restore` | validated backup; all-or-nothing |
| GET | `/api/inspire?q=` | `{live:true,results:[{title,thumbnail,source,link}]}` |

## Export formats
- **Project JSON** `{format:"archnova-project",schemaVersion:1,exportedAt,project:{name,description,state,design}}`: editable project data. `state` = template renderer settings, `design` = AI layout spec or null. Not a 3D model.
- **Backup** `{format:"archnova-backup",schemaVersion:1,exportedAt,projects:[...]}`.
- **Floor plan SVG/PDF, summary PDF**: generated on the server from the plan the browser sends (rooms, doors, windows, stairs, materials). The summary cost uses the server's default rates and lists its assumptions. Estimates only.
- **PNG**: the real rendered canvas. **GLB**: the real Three.js scene via GLTFExporter (loaded from jsDelivr at export time, needs internet).

## Security notes
Secrets only in `.env` (git-ignored). Passwords bcrypt-hashed. Project access is always filtered by owner (other users get 404). Logs never include bodies or cookies. `index.html` uses inline handlers, so the CSP needs `'unsafe-inline'` until they are refactored. Set `NODE_ENV=production`, a real `JWT_SECRET`, `TRUST_PROXY=1` behind a proxy, and serve over HTTPS (cookies become `Secure`).

## Deploy (outline)
Single Node service (Render/Railway/Fly): build command `npm install`, start `npm start`, set env vars from `.env.example`, point `MONGODB_URI` at Atlas and allow the host's IPs. If the frontend is hosted separately, set `CLIENT_ORIGIN` to its URL and use `SameSite=None; Secure` cookies (needs a small change in `middleware/auth.js`). Not yet deployed or tested in production.
# Archnova
