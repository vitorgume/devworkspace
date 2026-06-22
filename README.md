# DevWorkspace

Local developer productivity tool with 3 pillars: Prompt Workshop, Task Estimation (PERT), and Time Tracker. Runs 100% on your machine with FastAPI + React + MySQL + a minimal MCP server.

## Prerequisites

- Python 3.11+
- Node.js 18+
- MySQL running locally

## Setup

1. Clone the repo
2. Create `.env` from `.env.example` and fill `DB_*`, `DEEPL_API_KEY`, and `VITE_API_URL`
3. Create the MySQL database:
   - `CREATE DATABASE devworkspace;`
4. Run schema:
   - `mysql -u root -p devworkspace < backend/db/schema.sql`
5. Install backend deps:
   - `pip install -r backend/requirements.txt`
6. Install frontend deps:
   - `cd frontend && npm install`
7. Start everything:
   - `bash start.sh`

Services:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## How it works

- **Pillar 1 — Prompt Workshop**: You write structured prompts, click Apply, and the backend translates PT→EN with DeepL, compresses with a heuristic algorithm, then writes the final prompt to `mcp_server/latest_prompt.txt`. Trae reads it by spawning the MCP stdio server and calling its tool.
- **Pillar 2 — Task Estimation**: Create projects/sprints/tasks. When a task is saved, the backend calculates PERT minutes, rounded-up hours, margin, and total hours, then the UI shows sprint totals.
- **Pillar 3 — Time Tracker**: Start/pause time entries per task. The UI shows a live timer client-side and uses the backend for persistence and sprint summaries.
