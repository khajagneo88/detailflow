# DetailFlow

Project and workflow management for small teams of Cabinet Vision detailers — cabinetry, joinery, kitchens, wardrobes, commercial joinery and apartment projects.

This is the **V1/MVP foundation**, now through its fourth build stage plus eight follow-up additions: authentication, users/roles (Admin/Manager/Team Leader/Project Manager/Nester/Detailer), an admin section for managing team members, project creation, apartments and rooms (**including creating them through the UI, one at a time or pasted in bulk from a spreadsheet**, not just seed data), the fixed detailing workflow stages, and the two-cycle shop-drawing review/approval pipeline (IFA Drafted → IFA Internal Review → IFA Issued → [client approval, or an IFA Revision loop for markups] → IFC Drafted → IFC Internal Review → IFC Issued → [rare client Variation, or an IFC Revision loop] → Complete) with per-room comment threads for notes/RFIs/blockers/variations and a full stage-history audit trail — a simplified Start / On Hold / Ready for Check action set for detailers (with On Hold and Ready for Check automatically stopping a timer still running on that room), a real My Work page, a Reports page with charts and a project timeline — start/stop time tracking per room (with manual backfill entries) and logged-vs-estimated hours in Reports — a Team page **Workload tab** showing every detailer's current jobs at a glance — a **Planning** page — now a day-by-day grid (detailers/nesters × Monday-Friday) assigning real rooms or batches per day, colour-coded by production category, replacing the earlier week-level "who's on what project" sketch and its green/red marking — a green/red/grey **presence dot** on the Team page showing who's actively working a job, online but idle, or offline — a **Bulk add rooms** paste tool for quickly setting up a whole apartment building from a sheet — a **Batch** entity (§21) where a dedicated Nester groups IFC-approved rooms, numbered per project, for BOM and Nesting with its own Team Leader review gate and a completion cascade back to the member rooms — and DetailFlow's first **notifications**, alerting a project's Project Manager whenever a room's IFA or IFC drawings are ready to submit to the client. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design (schema, relationships, auth approach, workflow-state design, roadmap and open risks) before extending this — §11 covers the second stage, §12 the third, §13 the fourth, §14 the apartment/room creation UI gap fix, §15 the Workload tab, §16 weekly planning, §17 the presence dot, §18 bulk room creation, §19 the Planning page's past-week green/red marking, §20 linking the timer to the detailer action set, §21 the IFA/IFC/Batch/BOM/Nesting production pipeline and notifications.

## Stack

- **Frontend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4, hand-rolled shadcn/ui-style components
- **Backend**: Python, FastAPI, SQLAlchemy, Alembic
- **Database**: PostgreSQL

## Repository layout

```
backend/    FastAPI app, SQLAlchemy models, Alembic migrations, seed script
frontend/   Next.js app
docs/       Architecture & design docs
```

## Running locally

### Option A — Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

- Backend: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:3000
- Postgres: localhost:5432

Then run migrations and seed data inside the backend container:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py
```

### Option B — Run frontend/backend natively (faster iteration)

**Database** — any local PostgreSQL 16 works; create a role/database matching `.env`:

```sql
CREATE ROLE detailflow LOGIN PASSWORD 'detailflow';
CREATE DATABASE detailflow OWNER detailflow;
```

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env        # adjust DATABASE_URL if needed
alembic upgrade head
python seed.py
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

## Seed users (development only)

All seeded passwords are `password123`.

| Email | Role |
|---|---|
| admin@detailflow.dev | Admin |
| manager@detailflow.dev | Manager |
| teamleader@detailflow.dev | Team Leader |
| pm@detailflow.dev | Project Manager |
| nester@detailflow.dev | Nester |
| sarah@detailflow.dev | Detailer |
| john@detailflow.dev | Detailer |
| mike@detailflow.dev | Detailer |

Seed data creates two projects (Richmond Apartments — 3 apartments with mixed workflow stages, and Smith Residence — no apartments) so the dashboard, projects list and project detail pages have realistic data.

## Database migrations

```bash
cd backend && source .venv/bin/activate
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Always review an autogenerated migration before applying it — Alembic doesn't reliably detect every kind of change (renames, some constraint changes).

## What's implemented vs. deferred

Implemented: auth (JWT httpOnly cookie), roles (Admin/Manager/Team Leader/Project Manager/Nester/Detailer) enforced on the backend, Users (including admin-only create/edit-role/deactivate), Projects (+ creation UI + detailer assignment + a real Project Manager account instead of free text — §21.1), Apartments and Rooms (+ creation UI on the project detail page, Manager/Team Leader/Admin only — §14), the 13 fixed workflow stages, now a two-cycle IFA/IFC pipeline (see §11.2 and §21.2 of the architecture doc), room-level stage transitions with a full audit trail (`room_stage_events`), comment threads per room for notes/RFIs/blockers/variations with resolve/reopen (§21.3), a simplified detailer action set (Start / On Hold / Ready for Check — §12.1) where On Hold and Ready for Check also stop a timer still running on that room, so logged time always matches what actually happened without a separate step (§20), a real My Work page (§12.2), a Reports page with a stage-breakdown chart, a Gantt-style project timeline, and a filterable room table (§12.3–12.4), start/stop time tracking per room with manual backfill entries, a header-level running-timer indicator, and logged-vs-estimated hours in Reports (§13), a Team page **Workload tab** showing every detailer's current (non-complete) jobs across all projects, grouped per-person with attention/overdue counts, visible to every role (§15), a **Planning** page — a day-by-day grid of every detailer/nester across Monday-Friday, assigning specific rooms or batches (not whole projects) per day, colour-coded by production category (new project / IFA / IFC / BOM / nesting), with drag-and-drop between cells, Manager/Team Leader/Admin only to edit, visible to everyone to view, replacing the earlier week-level plan and its green/red marking entirely (§22), a green/red/grey presence dot on the Team page (working a job / online but idle / offline — derived from a `last_seen_at` heartbeat plus active timers, no new tracking action required from anyone, §17), a **Bulk add rooms** button on the project detail page's Apartments & Rooms tab — paste room names straight out of a spreadsheet (apartment number folded into the name, e.g. "Kitchen 101", or a genuine two-column paste), preview and fix anything before committing, then create every room (and any new apartments) in one go (§18), a **Batches** tab on the project detail page and a batch detail page — a Nester groups IFC-approved rooms into a project-numbered Batch, runs it through BOM → Team Leader review → Nesting → Complete, with completion cascading every member room to Complete (§21.4), a notification bell with an unread badge alerting the Project Manager whenever a room's IFA or IFC drawings are ready to submit to the client (§21.5), and dashboard/projects/project-detail/room-detail UI.

Deliberately not yet built (see roadmap in `docs/ARCHITECTURE.md` §9, and the open items in §21.6): a dedicated blockers table with SLA/escalation (today a blocker is just a comment type), a general activity log, real dashboard metrics, apartment templates, specifications, document storage, drawing file uploads, AI document scanning, deeper analytics (trends over time), a general-purpose notification framework beyond the IFA/IFC-ready alert, and enforcement of who may record a client's IFA decision or log an IFC Variation (currently as open as any other comment, matching §11.4).

## Updating an existing install

If you already have DetailFlow running from an earlier delivery, this is an **incremental update** — your `.venv`, `node_modules`, `backend/.env` and `frontend/.env.local` are untouched by the zip and should be kept as-is. Copy the updated `backend/app/`, `backend/alembic/versions/`, `backend/seed.py` and `frontend/` files over your existing folder, then:

```bash
cd backend
alembic upgrade head    # only does something if there's a new migration since your last update — safe to run either way
python seed.py           # re-seeds with the latest sample data
```

Then restart both dev servers (`uvicorn app.main:app --reload --port 8000` and `npm run dev`). No new environment variables are required. (If you're updating from the V1.3 time-tracking delivery, `alembic upgrade head` was already required then for the `time_entries` table — the Workload tab update (§15) added no further migration, the Planning page (§16) added the `weekly_plan_entries` table, and the presence dot (§17) added a `last_seen_at` column on `users`. Bulk add rooms (§18), the Planning page's past-week green/red marking (§19), and linking the timer to On Hold/Ready for Check (§20) are all frontend-plus-existing-tables changes and need no migration at all — §20 in particular is frontend-only, no backend change of any kind. The IFA/IFC/Batch/BOM/Nesting pipeline (§21) is the biggest migration since V1.3: three new migrations add the `project_manager`/`nester` roles and `projects.project_manager_id` (replacing the old free-text `project_manager` column — any existing free-text values are dropped, since there's no way to auto-match a name string to a real user account; re-assign each project's Project Manager by hand after updating), the `variation` comment type, and the new `batches`/`notifications` tables plus `rooms.batch_id`. **Run `python seed.py` after `alembic upgrade head`** if you want the new seed data (including `pm@detailflow.dev` and `nester@detailflow.dev`) — on an install with real data, don't re-seed, just create Project Manager/Nester accounts through the admin Users page and assign each project's Project Manager from the project's edit form instead. Run `alembic upgrade head` before starting the backend if you're coming from anywhere before §17 — it's a no-op otherwise. If you're updating from further back and skipped an earlier required migration, you'll see a `relation "..." does not exist` or `column "..." does not exist` error opening the relevant page until you run it. One more migration since §21: the day-level Planning grid (§22) drops `weekly_plan_entries` outright and adds `plan_entries` — **any existing week-level plan data is lost**, there being no faithful row-by-row mapping from "detailer + project + week" onto "detailer + room-or-batch + date"; re-seed or rebuild your plan through the new grid after updating.)
