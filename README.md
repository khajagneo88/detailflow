# DetailFlow

Project and workflow management for small teams of Cabinet Vision detailers — cabinetry, joinery, kitchens, wardrobes, commercial joinery and apartment projects.

This is the **V1/MVP foundation**, now through its fourth build stage plus eighteen follow-up additions: authentication, users/roles (Admin/Manager/Team Leader/Project Manager/Nester/Detailer), an admin section for managing team members, project creation, apartments and rooms (**including creating them through the UI, one at a time or pasted in bulk from a spreadsheet**, not just seed data), a **simplified, nine-stage** detailing workflow — a room starts life directly in IFA Drafted, no separate modelling/setup stages in front of it — and the two-cycle shop-drawing review/approval pipeline (IFA Drafted → IFA Internal Review → IFA Issued → [client approval, or an IFA Revision loop for markups] → IFC Drafted → IFC Internal Review → IFC Issued → [rare client Variation, or an IFC Revision loop] → Complete) with per-room comment threads for notes/RFIs/blockers/variations and a full stage-history audit trail — a shared detailer action set (Start / On Hold / Next Stage, dynamically relabelled Submit IFA/IFC review at the two checkpoints) on both the room detail page and My Work, with time tracked **fully automatically** from those same clicks (no manual timer, no manual backfill — see §23) and "one active task at a time" enforced by the same mechanism — a real My Work page, a Reports page with charts and a project timeline, and logged-vs-estimated hours in Reports fed by that automatic tracking — a Team page **Workload tab** showing every detailer's current jobs at a glance — a compact **IFA / IFC / BOM / Nesting badge** next to a room's name everywhere it's listed (My Work, project room tables, the Team Workload tab, the room's own page), reading a batched room's actual BOM/Nesting progress rather than freezing at "IFC" — a **Planning** page — a day-by-day grid (detailers/nesters × Monday-Friday) assigning real rooms or batches per day, colour-coded by production category — a green/red/grey **presence dot** on the Team page showing who's actively working a job, online but idle, or offline — a **Bulk add rooms** paste tool for quickly setting up a whole apartment building from a sheet — a **Batch** entity (§21) where a dedicated Nester groups IFC-approved rooms, numbered per project, for BOM and Nesting with its own Team Leader review gate and a completion cascade back to the member rooms — DetailFlow's first **notifications**, alerting a project's Project Manager whenever a room's IFA or IFC drawings are ready to submit to the client — reversible project **Archive** and a real, cascading permanent **Delete** (Manager/Team Leader/Admin) — a Detailer's nav now scoped to just Dashboard and My Work, a project detail page **Stage Timeline** tab — one row per room with IFA/IFC start/finish dates, revision counts, and BOM/Nesting/batch-number standing — **Team Leader** now carries the same blanket admin bypass as Admin (user management, batch creation, every management-gated action), and the Planning grid's week-start day is now an **admin-configurable Workspace setting** (Settings page) instead of a hardcoded Monday/Tuesday, so it can be changed any time to match whichever day the team's planning meeting actually falls on — plus an admin-only **Timesheet** tab on the Team page showing what project each detailer logged time against on each day of the week — and every room stage transition is now **role-enforced** end to end (Detailer submits/redrafts, Manager/Team Leader approve internal review or send it back, Manager/Team Leader/Project Manager record the client's approved-or-markups decision), with a matching **Team Leader "ready for your review" notification** firing the moment a detailer submits a package, closing the last gap in the IFA/IFC review flow — and every action button in the pipeline is now named after the package it actually works on: **Start IFA / IFA Complete / Start IFC / IFC Complete** on a room's own action card, and a matching **Start BOM / BOM Complete / Start Nesting / Nesting Complete** on the Batch detail page (Nester-only), with Start BOM/Start Nesting recording exactly when that work began even though neither changes the batch's status on its own — and Planning's "+ add task" picker now only ever offers a Nester **Batches** (i.e. only IFC-completed work) and a Detailer **Rooms**, enforced on the backend too so a Room task can no longer land on a Nester (which used to silently make them that room's real detailer assignment) or a Batch task on a Detailer — plus the Team Leader's and Project Manager's review actions are now named, one-click buttons too: **Mark IFA/IFC Complete** or **Send Back for Changes** (with required feedback) at the internal-review gate, and **Approved** or **Markups Required** at the client-response gate, replacing a generic "pick a stage from a dropdown" picker for both roles. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design (schema, relationships, auth approach, workflow-state design, roadmap and open risks) before extending this — §11 covers the second stage, §12 the third, §13 the fourth, §14 the apartment/room creation UI gap fix, §15 the Workload tab, §16 weekly planning, §17 the presence dot, §18 bulk room creation, §19 the Planning page's past-week green/red marking, §20 linking the timer to the detailer action set, §21 the IFA/IFC/Batch/BOM/Nesting production pipeline and notifications, §22 the day-level Planning grid, §23 project archive/delete, detailer nav scoping, and fully-automatic stage-based time tracking, §24 the simplified nine-stage pipeline and the stage-category badge next to every room's name, §25 the project detail page's Stage Timeline tab, §26 Team Leader's blanket admin bypass, §27 the admin-configurable Planning week-start day, §28 the Team page's admin-only Timesheet tab, §29 stage-transition role enforcement and the Team Leader review-requested notification, §30 the package-named Start/Complete action labels for IFA/IFC/BOM/Nesting, §31 role-matched Planning tasks (Rooms for Detailers, Batches for Nesters), §32 named review/client-response actions for the Team Leader and Project Manager.

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

Implemented: auth (JWT httpOnly cookie), roles (Admin/Manager/Team Leader/Project Manager/Nester/Detailer) enforced on the backend, Users (including admin-only create/edit-role/deactivate), Projects (+ creation UI + detailer assignment + a real Project Manager account instead of free text — §21.1), reversible project **Archive** and a cascading, irreversible project **Delete** (Manager/Team Leader/Admin — §23.1), Apartments and Rooms (+ creation UI on the project detail page, Manager/Team Leader/Admin only — §14), a **simplified, 9-stage** two-cycle IFA/IFC pipeline — a room starts life directly in IFA Drafted, no separate modelling/setup stages in front of it (see §11.2, §21.2, and §24.1 of the architecture doc), room-level stage transitions with a full audit trail (`room_stage_events`), comment threads per room for notes/RFIs/blockers/variations with resolve/reopen (§21.3), a shared detailer action set — Start / On Hold / Next Stage (dynamically labelled Submit IFA/IFC review at the two review checkpoints) — on both the room detail page and My Work (§23.3), with time tracked **fully automatically** from those same clicks and no manual timer at all (§23.4), a compact **IFA / IFC / BOM / Nesting badge** next to a room's name on My Work, project room tables, the Team Workload tab, and the room's own page — reads a batched room's real Batch status rather than freezing at "IFC" (§24.2), a real My Work page (§12.2), a Reports page with a stage-breakdown chart, a Gantt-style project timeline, and a filterable room table (§12.3–12.4), automatic per-stage time tracking rolling up into logged-vs-estimated hours in Reports (§13, redone in §23.4), a Team page **Workload tab** showing every detailer's current (non-complete) jobs across all projects, grouped per-person with attention/overdue counts, visible to every role (§15), a **Planning** page — a day-by-day grid of every detailer/nester across Monday-Friday, assigning specific rooms or batches (not whole projects) per day, colour-coded by production category (new project / IFA / IFC / BOM / nesting), with drag-and-drop between cells, Manager/Team Leader/Admin only to edit, visible to everyone to view, replacing the earlier week-level plan and its green/red marking entirely (§22), a green/red/grey presence dot on the Team page (working a job / online but idle / offline — derived from a `last_seen_at` heartbeat plus active timers, no new tracking action required from anyone, §17), a **Bulk add rooms** button on the project detail page's Apartments & Rooms tab — paste room names straight out of a spreadsheet (apartment number folded into the name, e.g. "Kitchen 101", or a genuine two-column paste), preview and fix anything before committing, then create every room (and any new apartments) in one go (§18), a **Batches** tab on the project detail page and a batch detail page — a Nester groups IFC-approved rooms into a project-numbered Batch, runs it through BOM → Team Leader review → Nesting → Complete, with completion cascading every member room to Complete (§21.4), a notification bell with an unread badge alerting the Project Manager whenever a room's IFA or IFC drawings are ready to submit to the client (§21.5), a Detailer's nav scoped to just Dashboard and My Work (§23.2), a project detail page **Stage Timeline** tab — one row per room with IFA/IFC started/completed dates, revision counts, and BOM/Nesting/batch-number standing, all derived from existing stage history rather than newly stored (§25), Team Leader now passing every `require_role(...)` check the same way Admin does — user management, batch creation/membership, and every management-gated action — via a shared `_ROLES_WITH_ADMIN_BYPASS` list rather than a hardcoded Admin-only check (§26), an admin-configurable **Workspace** setting on the Settings page for which day the Planning grid's week starts on (Admin/Team Leader only to change, everyone else's Planning page just reads it) — no code change needed the next time the team's planning meeting moves to a different day (§27), a **Timesheet** tab on the Team page, Admin/Team Leader only (both on the backend and hidden from the tab list for everyone else), showing every detailer's logged time per project per day across the same week grid as Planning (§28), **backend-enforced role rules on every room stage transition** — Detailer submits/redrafts, Manager/Team Leader approve or send back an internal review, Manager/Team Leader/Project Manager record the client's outcome, with Admin/Team Leader bypassing as usual — mirrored on the frontend so the "Move stage" picker only ever offers a role's own legal options, plus a **Team Leader notification** firing the moment a room is submitted for internal review (§29), package-named **Start IFA / IFA Complete / Start IFC / IFC Complete** buttons on a room's own action card and a matching Nester-only **Start BOM / BOM Complete / Start Nesting / Nesting Complete** set on the Batch detail page, the latter pair recording when that work actually began without changing the batch's status themselves (§30), Planning's task picker (and its drag-and-drop move) now backend-enforced to only ever pair a Room task with a Detailer and a Batch task with a Nester (§31), the Team Leader's internal-review gate now two named buttons — **Mark IFA/IFC Complete** or **Send Back for Changes**, the latter requiring feedback — and the Manager/Team Leader/Project Manager's client-response gate now **Approved** (with an "Approved with Comments" option) or **Markups Required**, both replacing the generic "Move stage" dropdown those roles used to see (§32), and dashboard/projects/project-detail/room-detail UI.

Deliberately not yet built (see roadmap in `docs/ARCHITECTURE.md` §9, and the open items in §21.6): a dedicated blockers table with SLA/escalation (today a blocker is just a comment type), a general activity log, real dashboard metrics, apartment templates, specifications, document storage, drawing file uploads, AI document scanning, deeper analytics (trends over time), a general-purpose notification framework beyond the IFA/IFC-ready and review-requested alerts, enforcement of who may log an IFC Variation specifically (still as open as any other comment, matching §11.4 — the *stage-transition* rule that records a client's IFA/IFC decision is enforced as of §29, but a Variation is logged as a comment, not a stage transition, so it isn't covered by that map), and backend-enforced role scoping for a Detailer beyond the room/time-entry endpoints already gated (§23.2 notes this — Projects/Team/Reports/Planning still only *hide* their controls from a Detailer client-side rather than 403ing the API directly, same longstanding convention as every other frontend-only gate in this app, §2).

## Updating an existing install

If you already have DetailFlow running from an earlier delivery, this is an **incremental update** — your `.venv`, `node_modules`, `backend/.env` and `frontend/.env.local` are untouched by the zip and should be kept as-is. Copy the updated `backend/app/`, `backend/alembic/versions/`, `backend/seed.py` and `frontend/` files over your existing folder, then:

```bash
cd backend
alembic upgrade head    # only does something if there's a new migration since your last update — safe to run either way
python seed.py           # re-seeds with the latest sample data
```

Then restart both dev servers (`uvicorn app.main:app --reload --port 8000` and `npm run dev`). No new environment variables are required. (If you're updating from the V1.3 time-tracking delivery, `alembic upgrade head` was already required then for the `time_entries` table — the Workload tab update (§15) added no further migration, the Planning page (§16) added the `weekly_plan_entries` table, and the presence dot (§17) added a `last_seen_at` column on `users`. Bulk add rooms (§18), the Planning page's past-week green/red marking (§19), and linking the timer to On Hold/Ready for Check (§20) are all frontend-plus-existing-tables changes and need no migration at all — §20 in particular is frontend-only, no backend change of any kind. The IFA/IFC/Batch/BOM/Nesting pipeline (§21) is the biggest migration since V1.3: three new migrations add the `project_manager`/`nester` roles and `projects.project_manager_id` (replacing the old free-text `project_manager` column — any existing free-text values are dropped, since there's no way to auto-match a name string to a real user account; re-assign each project's Project Manager by hand after updating), the `variation` comment type, and the new `batches`/`notifications` tables plus `rooms.batch_id`. **Run `python seed.py` after `alembic upgrade head`** if you want the new seed data (including `pm@detailflow.dev` and `nester@detailflow.dev`) — on an install with real data, don't re-seed, just create Project Manager/Nester accounts through the admin Users page and assign each project's Project Manager from the project's edit form instead. Run `alembic upgrade head` before starting the backend if you're coming from anywhere before §17 — it's a no-op otherwise. If you're updating from further back and skipped an earlier required migration, you'll see a `relation "..." does not exist` or `column "..." does not exist` error opening the relevant page until you run it. One more migration since §21: the day-level Planning grid (§22) drops `weekly_plan_entries` outright and adds `plan_entries` — **any existing week-level plan data is lost**, there being no faithful row-by-row mapping from "detailer + project + week" onto "detailer + room-or-batch + date"; re-seed or rebuild your plan through the new grid after updating.) Project archive/delete, detailer nav scoping, and the switch to automatic stage-based time tracking (§23) need **no migration at all** — no new tables or columns, just new/changed endpoints and frontend behavior. One thing worth knowing if you're on an install with real in-progress work: any manual timer left running before you update will simply keep running (nothing stops it), but there's no more Stop button to end it from the UI — either put that room On Hold, move it to its next stage, or (as a Manager/Team Leader/Admin) delete the stray `TimeEntry` row directly if it's stuck. **§24 (the simplified 9-stage pipeline) does need a migration — run `alembic upgrade head` before restarting the backend.** Unlike every earlier stage-list change, this one is safe to run on an install with real rooms already in progress: it does not just re-seed `workflow_stages`, it remaps any room (and any stage-history event) still sitting on one of the four removed pre-drafting stages (Setup, 3D Modelling, Waiting for Check Measure, Final Detailing) onto IFA Drafted, deletes those four now-unused stage rows, renumbers the remaining nine, and recomputes every room's progress percentage against the new 9-stage total — no rooms, no stage history, and no time entries are lost. You do **not** need to re-run `python seed.py` for this one (do it only if you also want the refreshed sample data, same as any other update). The Stage Timeline tab (§25) needs **no migration at all** — it's a new read-only endpoint plus a new frontend tab, computing everything from data that already exists. Team Leader's admin bypass (§26) also needs **no migration** — it's a one-line change to `require_role()`'s existing bypass check, no new tables or columns. **§27 (the admin-configurable Planning week-start day) does need a migration** — run `alembic upgrade head` before restarting the backend to add the new `app_settings` table; the migration itself inserts the one settings row (defaulting to Tuesday) as part of the upgrade, so there's nothing further to seed and no existing data is touched. Change the day any time afterward from the Settings page (Admin or Team Leader). The Team page's Timesheet tab (§28) needs **no migration at all** — it's a new read-only endpoint (computed from the existing `time_entries`/`rooms`/`projects` tables) plus a new frontend tab. **§29 (stage-transition role enforcement and the Team Leader review-requested notification) does need a migration** — run `alembic upgrade head` before restarting the backend to add the two new `notification_type` enum values (`ifa_review_requested`/`ifc_review_requested`); no existing data is touched or re-seeded. The role-enforcement half of §29 is a backend/frontend code-only change on top of that — no schema of its own — but note it's a behavior change on an install with real users: any authenticated user (including Detailer) could previously move any room to any stage via the API, and as of this update that's gated per the three-tier rule in §29, so double-check your seeded/real users have the roles you expect before relying on it. **§30 (the package-named Start/Complete action labels) also needs a migration** — run `alembic upgrade head` to add `batches.bom_started_at`/`batches.nesting_started_at` (both nullable, both start empty for every existing batch, so nothing is backfilled or lost). Everything else in §30 is a pure relabelling of existing buttons — no behavior change on the room side at all. **§31 (role-matched Planning tasks) needs no migration at all** — it's a validation-only change (`app/api/routes/planning.py`) plus a frontend picker filter, no new tables or columns. Note it's a behavior change if you have real plan data: any *existing* mismatched plan entry (a Room task on a Nester, or vice versa — unlikely, but the old code allowed it) is left as-is by the migration-free update; only *new* creates and moves are validated going forward. **§32 (named review/client-response actions) also needs no migration** — it's a frontend-only change to the room detail page (`app/(app)/rooms/[id]/page.tsx`) plus one label revert in `RoomActions.tsx`; the transition endpoint and its `outcome`/`note` fields were already there, this only changes how they're presented to the Team Leader/Manager/Project Manager.
