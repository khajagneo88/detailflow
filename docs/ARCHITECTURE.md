# DetailFlow — Architecture & MVP Design

Status: V1/MVP foundation, now through its fourth build stage plus seven follow-up additions (admin section and the review/approval workflow in §11, detailer self-service/My Work/Reports in §12, time tracking in §13, the apartment/room creation UI in §14, the Team page's Workload tab in §15, weekly planning in §16, the Team page's presence dot in §17, paste-from-spreadsheet bulk room creation in §18, past-week completed/not-completed marking on the Planning page in §19, and linking the timer to On Hold/Ready for Check in §20). This document is the reference for decisions made in this stage. Update it as the schema evolves — do not let it drift from the code.

## 1. Product Interpretation

DetailFlow tracks a Cabinet Vision detailing department's actual unit of work: a **room**, moving through a **fixed workflow** (Setup → 3D Modelling → Waiting for Check Measure → Final Detailing → Initial Review → Issued for Approval → Internal Review → Drawings Submitted → [Revision ⇄ Drawings Submitted, if markups come back] → Issued for Construction → Complete — see §11.2 for why stages 5-11 were redesigned from the original TL Check/Corrections/Approved/BOM/Nesting list), inside a hierarchy of **Company → Project → (optional) Apartment → Room**. It is not a generic kanban tool: statuses, roles and the checking/review cycle are specific to how a detailing team actually works, and the schema is deliberately relational (workflow stages, reviews, time entries are first-class tables, not strings or JSON blobs) so that reporting ("who is blocked", "what's overdue", "hours by stage") is a normal query rather than a parsing exercise.

Two ideas drive every modelling decision below: **project status and workflow stage are separate concepts** (a project's overall status is a coarse summary; a room's workflow stage is the operational detail), and **apartments are optional** — rooms belong to a project always, and to an apartment only when one exists.

## 2. System Architecture

```
Next.js 14 (App Router, TS, Tailwind, shadcn/ui)
        │  fetch, credentials: 'include'
        ▼
FastAPI (Python) — REST JSON API, versioned under /api
        │  SQLAlchemy ORM (sync, psycopg2)
        ▼
PostgreSQL 16
```

Frontend and backend are two separate deployables that only talk over HTTP. The backend never renders HTML; the frontend never touches the database directly. This keeps the door open to a future mobile client or a Cabinet Vision desktop-side integration hitting the same API.

Auth: JWT stored in an **httpOnly, SameSite=Lax cookie** set by the backend on `/api/auth/login`. Not `localStorage` — that's readable by any injected script (XSS) and there's no reason to accept that risk for a business app. The frontend never parses the token; it calls `GET /api/auth/me` to learn who's logged in and calls `POST /api/auth/logout` to clear the cookie. CORS is configured with `allow_credentials=True` and an explicit origin allowlist (the frontend's dev/prod URLs) — required for cookies to cross origins.

Role-based authorization is enforced **only** in FastAPI dependencies (`api/deps.py::require_role(...)`), never inferred from the frontend. The frontend hides buttons the user's role can't use, but every mutating endpoint independently re-checks the role and, where relevant, that the user is actually assigned to the project/room in question. The UI is a convenience, not a security boundary.

File storage (S3-compatible, e.g. Supabase Storage) is deliberately **not wired up yet**, but the schema anticipates it: any future `documents` table references a `storage_key` + `bucket`, never a raw local file path, and attaches polymorphically to project/apartment/room via nullable FKs (same pattern as blockers, see §6). Nothing in this MVP needs to be redesigned to add it later.

## 3. Repository Structure

```
detailflow/
├── docker-compose.yml          # postgres (+ backend/frontend in later stage)
├── .env.example
├── README.md
├── docs/
│   └── ARCHITECTURE.md         # this file
├── backend/
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── seed.py                 # dev seed data
│   └── app/
│       ├── main.py              # FastAPI app, CORS, router mounting
│       ├── core/
│       │   ├── config.py        # pydantic-settings, reads .env
│       │   └── security.py      # password hashing, JWT encode/decode
│       ├── db/
│       │   ├── base_class.py    # declarative Base
│       │   ├── session.py       # engine, SessionLocal, get_db dependency
│       │   └── base.py          # imports all models so Alembic sees them
│       ├── models/               # one file per entity, SQLAlchemy ORM
│       │   ├── room_stage_event.py   # added V1.1 — see §11.3
│       │   └── comment.py            # added V1.1 — see §11.4
│       ├── schemas/              # one file per entity, Pydantic (request/response)
│       ├── api/
│       │   ├── deps.py          # get_current_user, require_role, MANAGEMENT_ROLES (V1.1)
│       │   └── routes/          # one router per resource
│       │       ├── comments.py       # added V1.1
│       │       └── workflow_stages.py  # added V1.1 — GET /api/workflow-stages for the stage picker
│       └── services/             # business rules that don't belong in a route handler
└── frontend/
    ├── app/
    │   ├── login/page.tsx
    │   └── (app)/                # route group: sidebar layout + auth guard
    │       ├── layout.tsx
    │       ├── dashboard/page.tsx
    │       ├── projects/page.tsx
    │       ├── projects/[id]/page.tsx
    │       ├── projects/new/page.tsx   # added V1.1 — project creation form
    │       ├── rooms/[id]/page.tsx     # added V1.1 — stage transitions, comments, stage history
    │       ├── my-work/page.tsx
    │       ├── team/page.tsx           # V1.1: admin-only user creation + role/active editing
    │       ├── reports/page.tsx
    │       └── settings/page.tsx
    ├── components/
    │   ├── ui/                   # hand-rolled primitives (no Radix — see below)
    │   │   ├── dialog.tsx             # added V1.1 — modal used by the "add team member" form
    │   │   ├── select.tsx             # added V1.1 — styled native <select>
    │   │   └── textarea.tsx           # added V1.1
    │   └── layout/                # Sidebar, Header
    ├── features/
    │   ├── auth/                  # AuthContext, useAuth
    │   ├── projects/               # api calls + types + view components for projects
    │   ├── users/                  # added V1.1 — admin user create/update calls
    │   └── rooms/                   # added V1.1 — room get, stage-transition and comment calls
    └── lib/
        ├── api-client.ts          # fetch wrapper (base URL, credentials, error handling)
        └── roles.ts                # added V1.1 — canManage(), mirrors MANAGEMENT_ROLES for UI gating
```

The shadcn CLI can't reach `ui.shadcn.com` from this sandbox's network allowlist, so every primitive under `components/ui/` (including the V1.1 additions) is hand-rolled rather than generated — plain Tailwind classes, no Radix dependency. `Dialog` closes on Escape/backdrop click; `Select` is a styled native `<select>` rather than a custom listbox, which is enough for the app's short option lists (role, priority, stage, comment type) and keeps native keyboard behaviour for free.

`services/` holds logic that spans more than one model or enforces a business rule (e.g. "only one active timer per user", "a review must reference a room the reviewer can see") — it exists so route handlers stay thin and rules aren't duplicated across endpoints. `features/` on the frontend groups a domain's API calls, types and components together instead of scattering them across a single flat `components/` folder.

## 4. Database Schema (MVP tables)

```
users
  id            PK
  email         unique, not null
  hashed_password
  full_name
  role          enum: admin | manager | team_leader | detailer   -- Manager added in V1.1, see §11.1
  is_active     bool, default true
  created_at, updated_at

projects
  id                    PK
  project_number        unique, not null
  name                  not null
  client_name
  builder
  site_address
  project_manager
  description
  priority              enum: low | normal | high | urgent
  status                enum: not_started | in_progress | waiting_for_information |
                              waiting_for_check_measure | under_review |
                              ready_for_production | on_hold | complete
  team_leader_id        FK -> users.id, nullable
  start_date, detailing_due_date, installation_date   (date)
  estimated_hours       numeric, nullable
  notes
  is_archived           bool, default false
  created_at, updated_at

project_assignments                # many-to-many: users <-> projects, with metadata
  id            PK
  project_id    FK -> projects.id, not null
  user_id       FK -> users.id, not null
  created_at
  UNIQUE (project_id, user_id)

apartments
  id                    PK
  project_id            FK -> projects.id, not null
  name                  not null            -- "Apartment 101"
  level
  apartment_type        -- free text now; FK to apartment_templates later (see §7)
  description
  assigned_detailer_id  FK -> users.id, nullable
  due_date
  status                enum: not_started | in_progress | waiting_for_information |
                              waiting_for_check_measure | under_review | on_hold | complete
  notes
  created_at, updated_at

workflow_stages           # lookup table — system-defined rows, seeded once
  id            PK
  key           unique   -- "setup", "modelling_3d", "initial_review", "drawings_submitted", ...
  name          not null -- display label
  sequence      int, unique, not null   -- fixed ordering; see §11.2 for the current 11-stage list

rooms
  id                    PK
  project_id            FK -> projects.id, not null
  apartment_id          FK -> apartments.id, nullable
  name                  not null          -- "Kitchen" (free text, not an enum — §8)
  code
  description
  assigned_detailer_id  FK -> users.id, nullable
  priority              enum: low | normal | high | urgent
  due_date
  workflow_stage_id     FK -> workflow_stages.id, not null (default = "setup")
  workflow_status       enum: not_started | in_progress | blocked | waiting |
                              ready_for_review | changes_required | complete
  progress              int (0-100), computed/derived — see §5, stored as a cache column
  estimated_hours       numeric, nullable
  notes
  created_at, updated_at
  CHECK: apartment_id IS NULL OR apartment.project_id = room.project_id   (see §9)

room_stage_events         # added V1.1 — append-only audit log of every stage move, see §11.3
  id                    PK
  room_id               FK -> rooms.id, ON DELETE CASCADE, not null
  from_stage_id         FK -> workflow_stages.id, ON DELETE RESTRICT, nullable (null = room's first event)
  to_stage_id           FK -> workflow_stages.id, ON DELETE RESTRICT, not null
  outcome               enum: approved | approved_with_comments | markups_required, nullable
                              -- set at the Drawings Submitted decision point (§11.2); null elsewhere
  note                  text, nullable
  changed_by_id         FK -> users.id, ON DELETE SET NULL, nullable
  created_at            timestamptz, server default now()

comments                  # added V1.1 — notes/RFIs/blockers, one polymorphic table, see §11.4
  id                    PK
  project_id            FK -> projects.id, ON DELETE RESTRICT, not null
  apartment_id          FK -> apartments.id, ON DELETE RESTRICT, nullable
  room_id               FK -> rooms.id, ON DELETE RESTRICT, nullable
  workflow_stage_id     FK -> workflow_stages.id, ON DELETE SET NULL, nullable
                              -- snapshot of the room's stage at post time, for later filtering/reporting
  type                  enum: note | rfi | blocker, default "note"
  title                 nullable
  body                  text, not null
  status                enum: open | resolved, default "open"
  created_by_id         FK -> users.id, ON DELETE SET NULL, nullable
  resolved_by_id        FK -> users.id, ON DELETE SET NULL, nullable
  resolved_at           timestamptz, nullable
  created_at, updated_at
```

Deferred to a future stage (named here so the FK shape below doesn't need to change later): `time_entries`, a dedicated `activity_logs` table, and a first-class `blockers` table with its own SLA/escalation fields (today a blocker is `comments.type = 'blocker'` — see §11.4 for why that's enough for the MVP and what a dedicated table would add later). These are fully designed in the original spec and will slot in as their own migration once there's a UI to exercise them.

## 5. Entity Relationships

- **users → projects**: many-to-many through `project_assignments` (a project has many detailers; a user works on many projects). `team_leader_id` on `projects` is a separate one-to-many (one team leader per project, a team leader leads many projects) — deliberately *not* folded into `project_assignments`, because "leads this project" and "is assigned to do detailing work on it" are different facts (a team leader may lead a project without being a working detailer on it, or vice versa on a small team).
- **projects → apartments**: one-to-many, required FK. Deleting a project must not silently cascade-delete apartments with real history — see §6.
- **projects → rooms**: one-to-many, required FK — a room always belongs to a project directly, independent of whether it also belongs to an apartment.
- **apartments → rooms**: one-to-many, **optional** FK (`apartment_id` nullable) — this is the modelling decision the whole spec insists on. A room's true parent-project is always `room.project_id`; `apartment_id` is an optional refinement, not a replacement path to the project. That's why both FKs exist on `rooms` rather than deriving project through the apartment.
- **users → apartments/rooms** (`assigned_detailer_id`): one-to-many, nullable. Deliberately *not* the only assignment mechanism — §17 of the spec requires multiple detailers per project and flexible splitting, which `project_assignments` already provides at the project level; `assigned_detailer_id` on room/apartment is the fine-grained "who does this specific piece of work" pointer. A room's assigned detailer should be a subset check against the project's assignment list; enforced in `services/`, not the DB (a hard FK/trigger for this is possible but adds migration pain for little benefit at MVP size).
- **workflow_stages → rooms**: one-to-many (lookup FK, not an enum column) — chosen specifically so a future "configurable workflow" feature (§9 of the spec) only needs to let admins edit rows in `workflow_stages` and doesn't require a schema migration or an application redeploy. An enum column would have made that a breaking change later.

## 6. Delete Behaviour / Data Integrity

- **Soft delete over hard delete for anything with history.** `projects` gets `is_archived` rather than a delete endpoint — a project with recorded time entries or reviews (once those tables exist) must never disappear. "Archive" is exposed in the UI; a real `DELETE` is not offered for projects in the MVP.
- Apartments and rooms *can* be hard-deleted **only** while they have no dependent history — enforced in the service layer with an explicit check before the delete, returning 409 Conflict otherwise. This matches spec §32 ("delete where safe"). As of V1.1, a room's guard checks both `room_stage_events` and `comments`: a room with any recorded stage move or any comment/RFI/blocker against it can no longer be hard-deleted, only reassigned/edited — it must be reasoned about, at MVP scale, as a room that has "started."
- Foreign keys from `apartments`/`rooms` to `projects`, and `rooms` to `apartments`, use `ON DELETE RESTRICT` (not CASCADE) — an accidental project delete must not be able to take rooms with it silently. Since projects aren't hard-deletable in the UI anyway, this is a safety net against direct DB operations, not the primary guard.
- `assigned_detailer_id` FKs use `ON DELETE SET NULL` — deactivating/removing a user must not corrupt room/apartment rows; it just un-assigns them (paired with `is_active` on `users` rather than deleting user rows at all, so historical "who did this" data never breaks).
- **Cross-project integrity**: a room's `apartment_id`, if set, must point to an apartment belonging to the *same* `project_id`. Enforced at the application layer in `services/room_service.py` (checked on create and on any reassignment) plus a DB-level `CHECK`-style validation is impractical in plain PostgreSQL without a trigger, so this is a service-layer invariant backed by a test — flagged in §9 as a risk to keep an eye on if raw SQL/admin tooling is ever added later.
- Passwords are never stored or logged in plaintext; hashing uses bcrypt via `passlib`.

## 7. Authentication

FastAPI's `OAuth2PasswordBearer`-style flow, but token delivery via httpOnly cookie instead of `Authorization` header (see §2 for the reasoning). Flow:

1. `POST /api/auth/login` (email + password, form or JSON) → verify against `users.hashed_password` → issue a JWT (`sub`=user id, `role`, short expiry, e.g. 12h) → `Set-Cookie: access_token=...; HttpOnly; SameSite=Lax; Secure (prod)`.
2. Every protected route depends on `get_current_user`, which reads the cookie, decodes/validates the JWT, loads the `User` row, and 401s on any failure (expired, tampered, missing, inactive user).
3. `require_role(...)` wraps `get_current_user` and 403s if the role doesn't match — used per-route. As of V1.1, `api/deps.py::MANAGEMENT_ROLES = (UserRole.MANAGER, UserRole.TEAM_LEADER)` is the shared tuple for "can create/edit/delete projects, apartments and rooms" (Admin bypasses every role check automatically, so it doesn't need to be listed); see §11.1 for why Manager and Team Leader are both in that tuple rather than Manager alone.
4. `POST /api/auth/logout` clears the cookie. There's no server-side session store in the MVP (stateless JWT) — acceptable at this scale; a revocation list is a reasonable future addition if "force logout" becomes a requirement.

No refresh-token rotation in the MVP — a 12-hour token that requires re-login is a fine trade for the complexity it avoids right now.

## 8. Workflow-State Architecture

Rejected approach: a free-text or enum `stage` column directly on `rooms`. Chosen approach: `workflow_stages` as its own table, `rooms.workflow_stage_id` as a FK, seeded once with the 12 fixed stages from the spec (`sequence` column preserves their order for progress calculation and UI ordering). This is the one place the spec explicitly calls out ("do not simply store the stage as an arbitrary string... design the architecture so configurable workflow stages could be introduced later") and the lookup-table pattern is the standard way to get that flexibility without an enum migration later.

Separately, `rooms.workflow_status` (not started / in progress / blocked / waiting / ready for review / changes required / complete) stays a plain enum — it's a small, genuinely fixed set describing *how* work is going within whatever stage the room is in, not *which* stage. Conflating the two (e.g. "stage=blocked") would make it impossible to know what a room is blocked *from*.

Progress percentage is **not** a field the user edits. For the MVP it's derived as `sequence(current_stage) / total_stages`, computed at read time (or cached on write) — nothing is typed in by hand. Once room-level checklists and stage history exist, this calculation gets richer without changing the column's meaning.

## 9. MVP Roadmap (day 1 → day 2 → later sessions)

Day 1 (original MVP foundation): DB connection + migrations, auth foundation (JWT cookie, roles), `User`, `Project`, `ProjectAssignment`, `Apartment`, `Room`, `WorkflowStage` models and CRUD-ish routes, seed data, and the frontend shell (login, sidebar layout, dashboard placeholder, projects list + detail).

Day 2 (this stage — see §11 for the full reasoning): the Manager role; the workflow-stage redesign implementing the actual review/approval cycle (Initial Review → Issued for Approval → Internal Review → Drawings Submitted → Revision/Issued for Construction); `room_stage_events` as an append-only audit log of every stage move; `comments` as the note/RFI/blocker table; admin user management (create, edit role, deactivate); the New Project form; and the room detail page (stage transition control, comment thread, stage history timeline).

Deliberately still deferred, in order, for future sessions: (1) time tracking (`time_entries`, start/stop timer rule, manual entry, active-timer-uniqueness constraint); (2) a dedicated `blockers` table with its own SLA/escalation fields, if `comments.type = 'blocker'` (§11.4) turns out not to be enough once the team is using it daily; (3) a general `activity_logs` table (today, `room_stage_events` + `comments` cover "what happened to this room", but nothing yet answers "everything user X did" or "everything that happened project-wide"); (4) My Work page logic (real urgency sorting) and the Team Leader/Manager dashboard's real metrics (currently placeholders); (5) apartment templates; (6) specifications (appliances/finishes/hardware) with many-to-many room assignment; (7) document storage; (8) BOM/nesting/drawings stage tracking (dropped from the fixed stage list in the day-2 redesign — see §11.2 — pending its own module); (9) AI document scanning; (10) analytics; (11) notifications (nobody is yet told an RFI was raised against their room, or that a room they lead was moved to Revision — currently something has to be checked for manually).

## 10. Risks / Decisions Worth Revisiting

- **Cross-project apartment/room integrity** is enforced in the service layer, not the database. Fine at this scale; if the team ever writes directly against the DB (bulk import tooling, etc.) this needs a trigger or it can be silently violated.
- **`assigned_detailer_id` vs `project_assignments`**: nothing currently stops assigning a room to a detailer who isn't in the project's assignment list. Decide before building the checking workflow whether this should be a hard constraint (reject at the API) or a soft warning — it changes how the assignment UI behaves.
- **Stateless JWT with no revocation**: fine for MVP; revisit if "immediately deactivate a user's active session" becomes a real requirement (e.g. someone leaves the company).
- **`workflow_status` scope**: currently one status per room, not per stage-visit. If a room bounces back into "Corrections" and later returns to "Final Detailing", history of *why* is only reconstructable once `room_stage_history` exists — worth building that table before the checking workflow (item 2 in the roadmap) rather than after.
- **Progress caching**: storing `progress` as a column (vs. always computing it) trades a small write-time cost for cheap dashboard reads. Revisit if it ever drifts from the true derived value — that's a sign it should become a computed property instead.

## 11. V1.1 — Admin Section, Project Creation, and the Review/Approval Workflow

This section covers the second build stage: an admin section for adding detailers/managers/team leaders, a project-creation UI, and — the bulk of the work — replacing the placeholder "TL Check → Corrections → Approved → BOM → Nesting → Drawings & Reports → Ready for Production" tail of the fixed workflow with the team's actual shop-drawing review/approval cycle, plus per-stage comment threads for RFIs and blockers.

### 11.1 The Manager role

The request described three kinds of people to onboard: detailers, "managers", and (implicitly, since they already existed) team leaders. Rather than assume "manager" was just another name for "team leader," this was asked directly, and the answer was that Manager is a **new, higher-level role**, distinct from Team Leader — not a merge. `UserRole` is now `admin | manager | team_leader | detailer`, in that order.

Where this shows up: `api/deps.py::MANAGEMENT_ROLES = (UserRole.MANAGER, UserRole.TEAM_LEADER)` replaces the single `UserRole.TEAM_LEADER` check that used to gate project/apartment/room creation, edit and delete — both roles can manage projects; Admin bypasses role checks entirely as before. User account management (create/edit role/deactivate other users) stays Admin-only — nothing about "Manager" implies HR-type authority over accounts, only project-management authority over work. The frontend mirrors this with `lib/roles.ts::canManage()`, purely for hiding buttons the API would reject anyway (see §2 — the UI is never the actual boundary).

### 11.2 Redesigning the workflow stages

The original 12-stage list carried placeholder names for the checking cycle (TL Check, Corrections, Approved, BOM, Nesting, Drawings & Reports, Ready for Production) that were never going to match how this team actually gets shop drawings approved. The request spelled out the real sequence: Initial Review, then Issued for Approval, then Internal Review, then the drawings are actually submitted — and what comes back either approves the room (move on to Issued for Construction) or comes back with markups (do a Revision).

Two structural questions had to be settled before touching code, and both were asked directly rather than assumed:

- **Does this replace the tail of the existing workflow, or layer on top of it?** Answer: replace. Stages 1-4 (Setup, 3D Modelling, Waiting for Check Measure, Final Detailing) are untouched — they're the solitary modelling work a detailer does before anything is reviewable. Stages 5-11 are now the review cycle: `initial_review → issued_for_approval → internal_review → drawings_submitted → (revision ⇄ drawings_submitted) → issued_for_construction → complete`.
- **Does review happen per-project, per-apartment, or per-room?** Answer: per room. Each room moves through its own review cycle independently — a kitchen can be in Revision while the laundry in the same apartment is already Issued for Construction. This is why `room_stage_events` and `comments` both key off `room_id`, not `apartment_id` or `project_id` alone.

BOM and Nesting were dropped from the fixed list rather than kept as unused stages — they were always a future-roadmap module that was never built (see §9), and reintroducing them once that module exists is a pure data change (`DEFAULT_WORKFLOW_STAGES` + a re-seed) plus wiring, not a schema change, because stages are rows in a lookup table, not an enum (§8).

The one genuine decision point in the new sequence is **Drawings Submitted**: that's where an outcome gets recorded (Approved / Approved with Comments / Markups Required) before the room moves on. Every other transition — including the two decision-adjacent hops around it (Internal Review → Drawings Submitted, Revision → Drawings Submitted on resubmission) — is a plain move with an optional free-text note and no required outcome. The room detail page only shows the outcome selector when the room's *current* stage is `drawings_submitted`, i.e. exactly at that fork.

### 11.3 `room_stage_events`: an audit log, not a "current review" row

The obvious alternative to a `room_stage_events` table was a `reviews` table — one row per review round, with a status column that gets updated as the round progresses. That was rejected: a review round *is* a stage transition (the room moves from one workflow stage to another), optionally carrying an outcome and a note, so modelling it as a second, parallel "what stage is this room actually in" concept would just invite the two to drift out of sync. Instead, every stage move — including the everyday ones between Setup and Final Detailing, not just the review-cycle ones — writes one `room_stage_events` row: `from_stage_id` (nullable, null only for a room's very first event), `to_stage_id`, `outcome` (nullable — only meaningful at the Drawings Submitted fork), `note`, `changed_by_id`, `created_at`. Rows are never updated or deleted (`ON DELETE CASCADE` from `rooms` is the only way one disappears, when the room itself is hard-deleted while it still has no history — which by construction can't happen once an event exists). This is the same reasoning as `assigned_detailer_id` history preservation in §6: history that gets overwritten isn't history.

Two consequences worth knowing about: (1) `GET /rooms/{id}/stage-events` is what renders the "stage history" timeline on the room detail page, in creation order — it's a direct read of this table, no derived state. (2) A room bouncing Drawings Submitted → Revision → Drawings Submitted → Revision (repeated markups) produces a full, honest trail instead of a single row that gets clobbered each time — this was flagged as a risk to fix in §10 of the day-1 doc ("history of *why* is only reconstructable once `room_stage_history` exists") and is now resolved.

Stage transitions go through their own endpoint (`POST /rooms/{id}/stage-transitions`), not the general `PATCH /rooms/{id}`. `RoomUpdate` no longer accepts `workflow_stage_id` at all — a stage change that went through a plain field edit would silently skip writing the audit row, defeating the entire point of the table. `workflow_status` (blocked/waiting/etc., see §8) stays a plain editable field on `PATCH /rooms/{id}`, since flagging yourself blocked mid-stage is a legitimate small edit, not a stage change.

### 11.4 `comments`: one polymorphic table for notes, RFIs, and blockers

The request asked for three things that all look, structurally, like "a threaded remark against a room": a comment section during each stage, RFIs (requests for information), and a way to flag a blocking issue. Building three separate tables (`notes`, `rfis`, `blockers`) would have tripled the create/list/resolve logic for no real benefit, since the only thing that differs between them is a label and, for blockers, arguably some urgency. Instead there's one `comments` table with a `type` discriminator (`note | rfi | blocker`) and a `status` (`open | resolved`, with `resolved_by_id`/`resolved_at` set on resolve and cleared on reopen).

`comments.workflow_stage_id` is set once, at creation, from the room's *current* stage at that moment — a snapshot, not a live FK to "whatever stage the room is in now." This is what makes "show me every comment raised during Internal Review" a real query later, even after the room has moved on to Drawings Submitted or Revision.

This is deliberately the simplest thing that could work for the MVP: any authenticated user can create, resolve, or reopen a comment (unlike stage transitions and project/room management, there's no role gate here — raising an RFI or flagging a blocker is something a detailer needs to be able to do just as much as a manager). A dedicated `blockers` table would earn its keep once there's a real need for blocker-specific fields a comment doesn't have — an SLA timer, an escalation path, a required resolution reason — none of which was asked for yet; see §9.

### 11.5 A SQLAlchemy gotcha worth documenting for future migrations

`sqlalchemy.Enum(SomePyEnum, name="...")` stores a Python enum **member's `.name`** in the database column by default — not `.value` — even though every enum in this codebase is a `class X(str, enum.Enum)`, which makes members behave like their `.value` (lowercase) string everywhere in Python and in Pydantic serialization. So the existing `user_role` Postgres enum holds `ADMIN`, `TEAM_LEADER`, `DETAILER` (uppercase names), not `admin`/`team_leader`/`detailer`, and the hand-written migration that added Manager had to add `'MANAGER'` (confirmed against the running dev DB with `SELECT enum_range(NULL::user_role)` before shipping — the first draft used lowercase and would have silently created a `manager`/`MANAGER` mismatch on a fresh Postgres enum value).

This matters because Alembic's autogenerate **does not detect enum-value additions at all** — adding a role, a comment type, a stage-transition outcome, or anything else backed by a native Postgres enum always needs a hand-written `op.execute("ALTER TYPE ... ADD VALUE IF NOT EXISTS '...'")`, and it always needs to use the enum member's *name* casing, not its value, unless the column was explicitly declared with `values_callable` to do otherwise (none of this codebase's enums are). It also has to run in `with op.get_context().autocommit_block():` — Postgres won't let `ALTER TYPE ... ADD VALUE` run inside the same transaction as other DDL. Both of these are called out inline in the migration that added Manager (`alembic/versions/68428e0795c7_...py`) — read that file's comments before writing the next enum-adding migration.

### 11.6 What shipped on the frontend

- **Admin section** (`/team`, gated on `role === "admin"` for the mutating controls): create a user (name, email, role, temporary password — shown once, shared out of band), change a user's role inline, and deactivate/reactivate a user (an admin can't deactivate their own account, checked both client-side and server-side). Every other role sees the same table read-only.
- **New Project** (`/projects/new`, gated by `canManage()`): a single form covering the project's core fields, priority/status, key dates, a team-leader-or-manager picker, and multi-select detailer assignment — submits to `POST /projects` and lands on the new project's detail page.
- **Room detail page** (`/rooms/[id]`, linked from every room row in a project's Apartments & Rooms tab): an overview card (stage, status, priority, detailer, due date, progress); a "Move stage" control that lists every other stage and, only when the room's current stage is the Drawings Submitted decision point (§11.2), an outcome selector; a comment thread with type/status badges, a create form, and resolve/reopen buttons; and a stage-history timeline rendering every `room_stage_events` row in order. `GET /rooms/{id}` was added (previously rooms were only ever fetched as part of a project's room list) with an `apartment_name` convenience field on `RoomRead` so the page's breadcrumb doesn't need a second request.
- `GET /workflow-stages` was added specifically to populate the "Move stage" picker and has no write counterpart — the stage list itself is still only edited by re-seeding, consistent with §8's "configurable workflow is a future feature, not this one."

Verified end-to-end before packaging: role-differentiated `curl` checks against every new/changed endpoint (Manager can create projects, a Detailer is correctly 403'd from the same, the full stage-event history and comment thread come back with the right nested objects, resolving/reopening a comment works, admin user creation enforces email uniqueness and self-deactivation is blocked), then a full browser walkthrough (login → create a Manager user as Admin → create a project → open a room already mid-Revision from seed data → post and resolve a comment → move it through Drawings Submitted → Issued for Construction, confirming the outcome field only appears at the decision point and the stage history renders the whole trail correctly) — see the delivery notes for how to re-run this.

## 12. V1.2 — Detailer Self-Service, My Work, and Reports

The third build stage: a simplified action set for detailers on the room detail page, a real My Work page, and a Reports page with charts and a timeline. No new tables — everything here reads and writes the tables §4 and §11 already defined; this section is entirely about new read endpoints and frontend surfaces.

### 12.1 Simplified detailer actions vs. the manager's full picker

The room detail page's "Move stage" control (§11.6) is genuinely the right tool for a manager or team leader — they need to pick *any* stage and record an outcome at the Drawings Submitted decision point. It's the wrong tool for a detailer's day-to-day: "which of 11 stages do I move this to" is a question a detailer answering "am I done with my part yet" shouldn't have to think about. So the room detail page now branches on `user.role`: a detailer sees a `DetailerActionsCard` (`frontend/app/(app)/rooms/[id]/page.tsx`) with three plain actions — **Start** (`workflow_status → in_progress`, via the existing `PATCH /rooms/{id}`, no new endpoint), **On Hold** (an inline form — RFI or Blocker, one required question/description field — that posts a `Comment` and sets `workflow_status → blocked` in the same action, directly answering "flag it with relevant question(s)" from the request that started this stage), and **Ready for Check**, which advances the room to *the* next stage rather than asking which one.

"The next stage" needed one piece of real logic, not just `sequence + 1`: resubmitting after a Revision goes to Drawings Submitted (sequence 8), which is *before* Revision (sequence 9) in the fixed order — a detailer fixing markups is going back to the review checkpoint, not forward past it. `frontend/lib/room-workflow.ts::getReadyForCheckTarget()` is the one function that knows this (a small `NEXT_STAGE_OVERRIDES` map for that one case, `sequence + 1` for everything else) and is shared by both the room detail page and My Work so the two surfaces can never disagree about what "ready" means. The button hides itself entirely while a room sits in any of the stages that are genuinely waiting on someone else (Initial Review, Issued for Approval, Internal Review, Drawings Submitted, Issued for Construction, Complete) — there's nothing for the detailer to click there, and showing a disabled button would just invite "why can't I click this."

This is a frontend-only distinction — `POST /rooms/{id}/stage-transitions` still has no role restriction (§11.6's reasoning stands: a detailer legitimately drives their own room's early stages). Nothing stops a manager from opening the same room and using their full picker instead; the two UIs are just different front doors onto the same endpoint.

One backend fix rode along with this: `transition_room_stage()` (`app/services/room_service.py`) only set `workflow_status → READY_FOR_REVIEW` when a room entered Issued for Approval or Internal Review. Initial Review and Drawings Submitted are exactly the same kind of checkpoint — a detailer just moved the room into them and is now waiting on someone else — so both are now included. Without this, a room a detailer just marked "Ready for Check" into Initial Review would still read `in_progress`, which is exactly backwards.

### 12.2 `GET /rooms/mine` — the cross-project worklist

Every existing room-listing endpoint before this stage was scoped to one project (`GET /projects/{id}/rooms`). My Work needs the opposite: one detailer's rooms across every project they're on. `GET /rooms/mine` (registered in `app/api/routes/rooms.py` *before* `GET /rooms/{room_id}` — a route-ordering detail worth remembering, since Starlette would otherwise try to parse `"mine"` as an integer room id and 422) returns exactly that, pre-sorted by urgency: blocked, then changes-required, then genuinely overdue, then everything else active, then rooms waiting on someone else, then complete rooms last — ties within a bucket break on soonest due date, then priority. The ordering is computed with SQL `CASE` expressions rather than fetched-then-sorted in Python, so it scales the same way any other query does as room counts grow.

The frontend does the same bucketing again, client-side, purely for the section headings ("Needs your attention", "Overdue", "In progress", "Waiting on review", "Complete") — it doesn't re-sort, since the backend's order already matches the bucket order. Deliberately duplicated logic in one direction only (backend orders, frontend labels) rather than sending bucket names from the API — the bucket labels are a presentation concern, not data.

### 12.3 Reports: two new read endpoints, no new tables

`GET /reports/stage-summary` (room counts per stage, every stage included even at zero, optionally scoped to a project) and `GET /reports/rooms` (a cross-project room listing enriched with project/apartment name, filterable by project, stage, and status — the same shape as every other room listing, just without the single-project restriction) are the two endpoints the Reports page is built on, plus `GET /reports/attention-summary` for the three headline numbers (rooms needing attention, open RFIs, open blockers). None of this is new state — it's all `Room`, `RoomStageEvent`-adjacent, and `Comment` data that already existed; these endpoints just answer cross-cutting questions ("how many rooms are in each stage") that no single-project or single-room endpoint could answer.

A Gantt-style timeline needs a start and end date per room. There's no explicit "work started" timestamp — `room_stage_events` only has entries from a room's *first* transition onward, so a room that hasn't moved yet has no rows at all. Rather than add a column or backfill an event on room creation, the timeline uses `room.created_at` as the start and `room.due_date` as the end (falling back to created_at + 14 days when there's no due date, so the bar is still visible rather than a zero-width sliver). This is a deliberate approximation, not a durability guarantee — if "when did work actually start" needs to be exact later, that's the moment to add a real event at room creation, not before.

### 12.4 Why the Gantt bars use 3 colors, not 7

The obvious first design colored each Gantt bar by its exact `workflow_status` (7 values, reusing the badge color mapping everywhere else in the app). Run through the dataviz skill's palette validator, that set fails outright — red (blocked/changes-required) and green (complete) sit at ΔE 4.2 under a deuteranopia simulation, well below even the "legal only with a text label" 6-8 floor, and several other pairs (red vs. orange, in particular) fail the full-color-vision floor too. Cutting the categorical set down to a plain red/blue/green triad (attention/active/complete) still fails the same red-vs-green check — that pairing is a structural problem with using both colors as competing identities in one view, not a fixable shade choice.

The fix was to stop treating "complete" as a competing color at all: complete rooms render in a de-emphasized gray, attention stays the accent red, everything else is the app's primary blue. That's an **emphasis** palette (one accent color that matters, everything else recedes), not a categorical one, and it passes the validator's CVD and contrast checks. The exact status was never hue-only anyway — every bar carries its precise stage/status in its hover tooltip, and the filterable room table directly below the timeline states it in text via the same `Badge` component used everywhere else in the app — but this way the color itself is also honest for colorblind readers, not just backed up by text for them. `node scripts/validate_palette.js` (from the dataviz skill) is the tool that caught this; re-run it against any future chart color choice before shipping it, rather than eyeballing contrast.

### 12.5 What shipped on the frontend

- **My Work** (`/my-work`) replaces the placeholder: five urgency-ordered sections, each room showing its project/apartment breadcrumb, stage, status and priority badges, due date, and — for detailers — inline Start / Ready for Check buttons (flagging a problem still goes through the room detail page, since that form needs more room than a table row has).
- **Room detail page** (`/rooms/[id]`) gained the detailer/manager branch described in §12.1.
- **Reports** (`/reports`) is new: a project + stage filter row (scoping everything below it, per the dataviz skill's filter-composition rule), three KPI stat tiles, the stage-breakdown bar chart, the Gantt-style timeline, and a full filterable room table underneath (the required accessible "table view" alongside the charts).

## 13. V1.3 — Time Tracking

The fourth build stage: a start/stop timer plus manual backfill entries, logged against a room, with a header-level indicator of whatever's currently running and a logged-vs-estimated hours view in Reports. This is the one feature from the original spec that nothing before this stage actually captured — `rooms.estimated_hours` existed since day one, but nothing recorded what was *actually* spent.

### 13.1 One table, two ways to fill it in

`time_entries` (`app/models/time_entry.py`) has exactly one shape whether a row came from a live timer or a manual entry — `room_id`, `user_id`, `started_at`, `ended_at`, `duration_minutes`, a `source` discriminator (`timer` / `manual`), and an optional `note`. A running timer is the one row where `ended_at`/`duration_minutes` are null; everything else — a stopped timer or a manual entry — has all four timestamps/durations filled in. This mirrors the `Comment` table's one-table-with-a-discriminator decision in §11.3 for the same reason: a report that wants "hours logged on this room" shouldn't have to `UNION` two tables to get it.

The two sources differ in *which* number is authoritative. A timer's `duration_minutes` is always derived — computed from `ended_at - started_at` the moment it's stopped (`services/time_entry_service.py::stop_timer`). A manual entry inverts that: the user types the duration directly (that's the number they actually know — "I spent about 90 minutes on this yesterday," not exact clock times), and `ended_at` is *derived* from it (`started_at + duration_minutes`) purely so the row has a consistent start/end shape for the timeline-style queries that don't care which source produced a row.

### 13.2 Only one running timer per user — enforced twice, on purpose

A user can only plausibly be doing one thing at a time, so at most one `time_entries` row per `user_id` may have `ended_at IS NULL`. This is a partial unique index (`ux_time_entries_one_active_per_user`, `postgresql_where=text("ended_at IS NULL")` in the model's `__table_args__`), not an application-level check alone — the real guarantee has to live in the database, because two "start timer" requests from the same user landing at once is a race an app-level `SELECT` then `INSERT` cannot fully close. `start_timer()` still does the friendly check first (fast path, and it's what lets the 409 response name *which* room the existing timer is running on), but if that check loses a race, the `IntegrityError` from the index violation is caught and translated into the same clean 409 rather than leaking a raw database error to the frontend.

Autogenerate did correctly detect and render this partial index (`postgresql_where` shows up in both `upgrade()` and `downgrade()` of the migration) — worth calling out since it's exactly the kind of clause autogenerate has been known to drop; it was verified by hand against the live schema (`\d time_entries`) after migrating, not just trusted from the generated file.

### 13.3 API shape

- `GET /time-entries/active` — the current user's running timer, if any, across every room. Returns `null` (200) rather than 404 when nothing's running, specifically so the header's polling indicator never has to treat an empty result as an error.
- `POST /rooms/{id}/time-entries/start` / `POST /time-entries/{id}/stop` — start and stop. Stop is restricted to the entry's own owner (nobody stops someone else's timer for them, even a manager — if it's running, it's running on the person doing the work).
- `POST /rooms/{id}/time-entries` — a manual entry (`started_at` + `duration_minutes` + optional `note`).
- `GET /rooms/{id}/time-entries` — the full list for a room, newest first, joined with `user` and `room.project` so the frontend never needs a second request just to show who logged what and which project a room belongs to.
- `PATCH` / `DELETE /time-entries/{id}` — edit or remove a manual entry or a *stopped* timer (a still-running timer can't be edited here — stop it first, or delete it outright). Creator-or-management-role guard, matching the pattern in `api/deps.py::MANAGEMENT_ROLES` plus Admin: whoever logged the time can fix their own mistake, and Manager/Team Leader/Admin can clean up on anyone's behalf.
- `GET /reports/time-summary` — logged vs. estimated hours per room (and totals), optionally scoped to a project. A `LEFT JOIN` against a per-room `SUM(duration_minutes)` subquery, so a room with nothing logged yet still appears at zero rather than being dropped from the report.

### 13.4 Frontend: one shared "what's running" state, not two

The header's running-timer chip and the room detail page's Time card both need to know the same fact — is a timer running, and if so where — so that fact lives in exactly one place: `TimeTrackingContext` (`features/time-entries/TimeTrackingContext.tsx`), mounted once in the authenticated `(app)` layout alongside the header. It polls `GET /time-entries/active` every 30s as a background safety net (catches a timer started/stopped from another tab or device) but every start/stop *this* tab performs updates the shared state immediately, so the common case never waits on the poll.

This mattered for one specific piece of UX: starting a timer on room B while one is already running on room A shouldn't just 409 and stop there. The Time card checks whether the active entry belongs to *this* room, *another* room, or doesn't exist, and offers a one-click "Switch timer here" when it's elsewhere — stop the old one, start the new one, both through the same context so the header updates in lockstep. Nothing about this is a new endpoint; it's the existing start/stop pair called in sequence from the frontend.

The live-ticking elapsed-time display (header chip and Time card both show it) is a `useElapsedSeconds` hook (`lib/time.ts`) with a `setInterval` tick — written to satisfy `eslint-plugin-react-hooks`'s `set-state-in-effect` rule (enabled in this Next.js version's lint config), which flags a `setState` call written directly in an effect body. The fix in both this hook and `TimeTrackingContext`'s poll effect is the same pattern: `setState` only ever runs from *inside* a `setInterval`/`setTimeout` callback (an external-system event, which the rule is fine with), never as a bare statement in the effect body itself — including the very first fetch/tick, which is scheduled via `setTimeout(fn, 0)` rather than called inline.

## 14. Apartment & Room Creation UI (gap fix)

A gap surfaced after V1.1 shipped: `POST /projects/{id}/apartments` and `POST /projects/{id}/rooms` have existed on the backend, correctly role-guarded, since the second build stage — but the project detail page only ever *displayed* apartments and rooms, with no "Add apartment" / "Add room" control anywhere in the UI. Seed data made this easy to miss, since every apartment and room in the demo dataset is created directly via the ORM in `seed.py`, never through these endpoints. A manager or team leader had no way to add either through the app itself.

### 14.1 What shipped

Two dialog forms on the project detail page's Apartments & Rooms tab (`frontend/app/(app)/projects/[id]/page.tsx`), visible only to Manager/Team Leader/Admin (mirroring `api/deps.py::MANAGEMENT_ROLES` client-side, same pattern as the Time card's edit/delete guard in §13.3) — a detailer sees the same read-only tab as before:

- **Add apartment** — one toolbar button, opens a form (name, level, type, detailer, due date, description, notes).
- **Add room** — a toolbar button (no apartment preselected) plus a small "+ Room" button on every apartment card (preselects that apartment, but the apartment field stays editable in case it's actually meant for a different one). Both open the same `AddRoomDialog`; the dialog unmounts on close and remounts keyed on which apartment it was opened for, so its form state never leaks between "add room to apartment A" and "add room to apartment B" without needing an effect to resync it.

Both dialogs append the created row into local state (`setApartments`/`setRooms`) rather than re-fetching the whole project, so the new apartment/room appears immediately without a round trip.

### 14.2 The bug this exposed: `create_room` crashed on every call

Building the frontend form and actually calling `POST /projects/{id}/rooms` for the first time — as opposed to reading it back from data seeded via the ORM — surfaced a real backend bug that had been there since the endpoint was written: it 500'd on every request (visible client-side as a CORS error, same misleading symptom as the reports bug in an earlier session — the fetch fails before any CORS header is attached, and Chrome reports that as a CORS failure rather than surfacing the actual 500).

`create_room` (`app/api/routes/rooms.py`) built the new `Room` with `workflow_stage_id=default_stage.id` and then immediately called `refresh_room_progress(db, room)`, which reads `room.workflow_stage.sequence` — but `room.workflow_stage` is a relationship, and this row hadn't been flushed to the database yet, so SQLAlchemy had no way to lazy-load it: `room.workflow_stage` was `None`, and `.sequence` on `None` raised `AttributeError`. This never showed up before because `update_room` and `transition_room_stage` (the two other callers of `refresh_room_progress`) both either flush-and-refresh the row first or set `room.workflow_stage` (the object, not just the FK) directly before calling it — `create_room` was the one place that only set the FK. The fix: construct the room with `workflow_stage=default_stage` (the object) instead of `workflow_stage_id=default_stage.id` — SQLAlchemy still derives the FK column from it on flush, but now the relationship is available immediately, matching the pattern the other two callers already used.

Worth internalizing for future endpoints: any code path that reads a just-constructed, not-yet-flushed row's relationship needs the relationship set directly, not just its FK column — a working `curl` test against a fresh row (not one loaded back out of the database) is the way this class of bug gets caught before a user does.

## 15. Team Page: a "Workload" Tab

A follow-up request: managers need a single place to see what every detailer currently has on, without opening My Work as each of them in turn. No new tables or endpoints — this is a second view over data `GET /reports/rooms` (§12.3) and `GET /users` already return, both already open to any authenticated user, so the Team page fetches both once and does the grouping client-side.

### 15.1 What shipped

`frontend/app/(app)/team/page.tsx` gained a `Tabs` control: **Team** (the existing user table, unchanged) and **Workload** (new). The Workload tab renders one card per detailer — name, a "N current jobs · M complete" summary, "needs attention"/"overdue" count badges when either is non-zero, and a `RoomTable` (§14.1's table, extended below) listing that detailer's non-complete rooms, sorted by urgency. Rooms are grouped client-side from one unfiltered `GET /reports/rooms` call (`Map<detailerId, Room[]>` keyed on `room.assigned_detailer.id`) rather than one request per detailer — a manager with a handful of detailers doesn't need a waterfall of near-identical fetches.

Deliberately visible to every role, not gated to Manager/Team Leader/Admin like the Add apartment/room controls in §14.1 — unlike creating or editing work, *looking* at who's got what is exactly the same read `GET /reports/rooms` and `GET /users` already allow any authenticated user to do, and a detailer seeing their teammates' workload is not a privileged view of anything they couldn't already piece together from My Work and the project pages.

### 15.2 Sharing the urgency logic with My Work, not copying it

My Work (§12.2) already had its own bucketing logic (`Bucket`, `bucketFor`, `BUCKET_META`, `BUCKET_ORDER`) to decide what counts as "needs attention" vs. "on track" for one detailer's own rooms. The Workload tab needed the exact same judgment call, just applied per-card instead of to a single list — so that logic moved out of `my-work/page.tsx` into `frontend/lib/room-workflow.ts`, and both pages import it from there. A `compareRoomUrgency(a, b)` comparator was added alongside it (bucket order, then soonest due date — the same tie-break `GET /rooms/mine` already applies server-side, per §12.2) so each Workload card can sort its rooms without duplicating that ordering logic a second time. The alternative — letting the Workload tab grow its own copy of "what's urgent" — was rejected for the reason §12.2 gives for keeping the backend and frontend bucket definitions from drifting: two surfaces answering "is this room in trouble" differently is a bug waiting to be noticed by a manager comparing them side by side.

`RoomTable` (§14.1) gained two optional props to make it fit both contexts: `showDetailer` (default on — a project's room list still wants the assigned detailer's name in every row) and `showProject` (default off — turned on only here, since a single Workload card's rows span every project a detailer touches, and each row needs to say which one).

### 15.3 What "current" means here

A detailer's card counts everything with `workflow_status !== "complete"` as current — not just `in_progress`. A room sitting in `not_started`, or one parked in `ready_for_review`/`waiting` (waiting on someone else, per `bucketFor`), is still that detailer's responsibility in the sense a manager scanning this tab cares about: it's on their plate, even if the ball is momentarily in someone else's court. Completed rooms are counted (the card's "M complete" summary) but not listed row-by-row — once a room is done there's nothing left to oversee about it here; the full history is still on the room detail page and in Reports.

## 16. Weekly Planning

A second follow-up request: a lightweight tool to sketch out, roughly, which detailer is working on which project in a given week — deliberately not a scheduling system with hours or capacity math, just enough for a manager to say "John's on Richmond this week, Sarah's on Smith Residence."

### 16.1 One new table, at exactly the granularity asked for

`weekly_plan_entries` (`app/models/weekly_plan_entry.py`): `project_id`, `user_id`, `week_start` (always a Monday — see §16.3), an optional free-text `note`, and `created_by_id`. Nothing at the room level and no hours column — three explicit choices made up front rather than assumed, the same way the Manager role (§11.1) and the review-cycle redesign (§11.2) were settled by asking directly instead of guessing: the granularity is detailer + project + week, not detailer + room, and a plan entry doesn't carry an estimated-hours number the way `rooms.estimated_hours` or a time entry does. A `UniqueConstraint` on `(project_id, user_id, week_start)` stops the same person being double-planned onto the same project in the same week, but deliberately allows several *different* projects for one person in one week — a split week (half on Richmond, half on Smith Residence) is a normal, expected shape here, not an edge case to prevent.

### 16.2 Planning also assigns — the plan and `project_assignments` are meant to stay in sync one-way

The obvious alternative was to make this a pure forecast, fully decoupled from `project_assignments` (§5), so a plan could say one thing while the real assignment said another without either being "wrong." That was the other option on the table, and it was rejected in favor of the plan actively driving the assignment: `weekly_plan_service.create_entry()` checks whether the planned user is already in `project_assignments` for that project and adds them if not, in the same transaction as the plan entry. Practically, this means planning is also the fastest way to put a detailer onto a project for the first time — a manager sketching next week's plan doesn't need a separate trip to the project's edit form first.

This link is deliberately **one-way and non-retracting**: deleting a plan entry (un-planning someone) does not remove the `ProjectAssignment` it created. Once someone is a real assignee of a project, that's a sticky fact — the same reasoning as every other "don't silently undo a real assignment" decision in this codebase (§6, §11.1) — and a plan being a rough weekly sketch shouldn't be the thing that un-assigns someone just because next week's plan looks different. If unassigning someone from a project is ever needed, that's `PATCH /projects/{id}` (§11.6's New Project form already supports editing `assigned_detailer_ids`), not a side effect of tidying up an old week's plan.

Because a `WeeklyPlanEntry.project_id` is `ON DELETE CASCADE` from `projects`, re-seeding (which deletes and recreates every project — see `seed.py`) clears the whole table for free without needing its own explicit `.delete()` call, the same way it already clears `time_entries` by cascading through `rooms`.

### 16.3 Weeks are always Mondays, normalised server-side

`week_start` is never trusted as-sent — `weekly_plan_service.monday_of()` floors whatever date arrives to that date's Monday before it's stored, and the frontend's `lib/week.ts::mondayOf()` does the same floor client-side so the displayed week always matches what a create call would actually save against. This means `GET /planning/weekly?week_start=<any date in the week>` works no matter which day of that week is passed — the route normalises the query param the same way — so the frontend's "prev/next week" buttons only need to add or subtract 7 days from a known Monday and never have to reason about which day of the week they started from.

### 16.4 API and role gating

- `GET /planning/weekly?week_start=` — every plan entry for that week, across every project. Open to any authenticated user, matching `GET /reports/rooms` and `GET /users` (§12.3, §15.1) — seeing the plan is exactly the same kind of read.
- `POST /planning/weekly` / `DELETE /planning/weekly/{id}` — creating or removing a plan entry is gated to `MANAGEMENT_ROLES` (+ Admin), the same guard as project/apartment/room creation (§14.1) — appropriate here specifically *because* creating a plan entry also mutates `project_assignments` (§16.2), not because viewing the plan needs protecting.

### 16.5 Frontend

A new top-level `/planning` page (its own sidebar entry, not a third Team page tab — a week-picker-driven grid is a different enough shape of view from Team's user table and Workload cards that it earns its own place) with a week-navigation header (prev/next/"This week", `lib/week.ts::addWeeks`/`formatWeekRange`) and one row per detailer. Each row shows that detailer's planned projects as removable chips (a project's optional note surfaces as the chip's `title` tooltip rather than always-visible text, keeping a full week's plan scannable at a glance) plus, for management roles only, an inline "+ Plan project…" control — a `<select>` that only lists projects the detailer isn't already planned on that week (client-side mirror of the backend's uniqueness constraint, so the 409 case in practice never happens through the UI, only if two managers race each other). A detailer viewing their own or a teammate's row sees the same chips with no remove control and no add form — read-only, matching the backend's role gating (§16.4).

## 17. Presence: a Green/Red/Grey Status Dot on the Team Page

A third follow-up request: at-a-glance status next to each detailer on the Team page — green while they're actively working a job, red when they're around but not on anything, grey when they're not logged in or not at work. This needed one new fact the app didn't track at all yet ("is this person's session actually active right now") plus one fact it already had (a running timer, from §13).

### 17.1 Presence as a heartbeat riding on existing traffic, not a new "I'm here" mechanism

The naive approach — a dedicated `POST /presence/ping` the frontend calls on an interval — was rejected in favor of piggybacking on requests that already happen: `User.last_seen_at` (`app/models/user.py`) is bumped inside `get_current_user` (`app/api/deps.py`), the dependency nearly every authenticated route already depends on. Every request a logged-in user makes — loading a page, the header's 30s timer poll, anything — silently keeps their presence current, with no new network traffic and no new frontend code to remember to call.

The one deliberate throttle: `get_current_user` only actually writes `last_seen_at` when it's null or more than 60 seconds stale, not on every single request. Presence only needs roughly-a-minute resolution, so turning what would otherwise be a write on nearly every request in the app into "at most once a minute per user" was worth the small amount of staleness it introduces. This is the same kind of judgment call as the progress-caching tradeoff in §10 — a cheap read/write balance, revisit only if it ever actually causes a problem.

### 17.2 Deriving three states from two facts, entirely client-side

The backend exposes exactly two raw facts and does no "is this person online" computation itself: `User.last_seen_at` (via `UserRead`) and `GET /reports/active-timers` (every currently-running timer, across every user — a companion to §13's single-user `GET /time-entries/active`, needed here because the Team page has to know about *everyone's* timers, not just the viewer's own). `frontend/lib/presence.ts::presenceStatus(user, hasActiveTimer)` combines them into one of three states — deliberately kept out of the API response as a precomputed status string, so the "how stale is too stale" threshold (currently 90 seconds — roughly one missed 30s poll's worth of tolerance, tuned against the same `TimeTrackingContext` poll interval that already exists) can be tuned or made configurable later without an API version bump:

- **grey ("offline")**: the account is deactivated, has never been seen (`last_seen_at` null — true for every seed account until someone actually logs in), or was last seen more than 90 seconds ago.
- **green ("working")**: seen within the last 90 seconds *and* has a row in `/reports/active-timers`.
- **red ("idle")**: seen within the last 90 seconds, no running timer.

This ordering matters: `is_active`/staleness is checked first regardless of timer state, so a deactivated account or a stale session never shows green just because a timer happens to still be running server-side (an edge case that shouldn't come up given §13.3's rule that only the entry's own owner can stop a timer, but the status function doesn't rely on that invariant holding elsewhere to stay correct).

### 17.3 Where the dot renders, and why it isn't color-only

`components/ui/presence-dot.tsx::PresenceDot` renders a small colored circle carrying a `title`/`aria-label` with the same meaning in words ("Working on a job right now" / "Online, nothing in progress" / "Offline") — the same accessibility reasoning as §12.4's Gantt-chart rework: color communicates at a glance, but nothing here is *only* color. It appears in exactly the two places §15 already shows "who is this detailer" — the Team tab's user table (every row, every role, not just detailers — an admin or manager's own presence shows too) and the Workload tab's per-detailer card header — rather than spreading it to every place a detailer's name appears elsewhere in the app (project cards, room rows), which was the scope explicitly ruled out when this was asked about directly rather than assumed.

Because presence changes on its own over time — someone logs out, starts a job, goes stale — the Team page now re-polls both `GET /users` and `GET /reports/active-timers` every 30 seconds while it's open (`app/(app)/team/page.tsx`), the same interval `TimeTrackingContext` already uses elsewhere, so the dots stay roughly live for a manager who leaves the page open rather than only reflecting the moment it was loaded.

## 18. Bulk Add Rooms (paste from a spreadsheet)

A fourth follow-up request: this team keeps its room lists in a Google Sheet, and re-typing every room into the one-at-a-time "Add room" dialog (§14.1) for a new apartment building is slow. This adds a paste-based bulk create, entirely on the frontend — no new backend endpoint, no new table. It just calls the existing `POST /projects/{id}/apartments` and `POST /projects/{id}/rooms` repeatedly, the same two calls `AddApartmentDialog`/`AddRoomDialog` already make one at a time.

### 18.1 What the sheet actually looks like, and why parsing is a guess with an editable preview, not a format

Asked directly rather than assumed: this team's sheets are usually a single column of room names, with the apartment folded into the name itself when there is one — "Kitchen 101", "Ensuite 101" — not a separate Apartment column. `lib/bulk-paste.ts::parseBulkRoomText()` handles that shape (peeling a trailing number off the end of each line as the apartment) and, since a spreadsheet copy/paste preserves tabs between cells, also auto-detects a genuine two-column paste (any line containing a tab is split on it instead) without needing to ask which one is coming.

Peeling a trailing number off a room name is a heuristic, not a rule — "Bedroom 2" in a house project with no apartments would misparse as apartment "2". Rather than trying to make the heuristic smarter (e.g. only apply it to projects that already have apartments — which would break the common case of a *first* apartment-building paste, when the project has none yet), `BulkAddRoomsDialog` treats every parsed row as a draft: the preview step (`features/projects/BulkAddRoomsDialog.tsx`) shows every row's room name and apartment in plain editable text inputs, with nothing sent to the backend until "Create rooms" is clicked. A wrong guess costs a click to fix (or a "Clear all apartments" button to fix every row in a no-apartments project at once) — a fixed heuristic can't get purely-textual "was that a room name or an apartment number" reliably right, so being wrong safely was the design goal, not being right rarely.

### 18.2 Apartment matching and dedup — never create the same apartment twice from one paste

A paste is a *project's* rooms, not one apartment's — the same apartment name typically repeats across many rows ("Kitchen 101", "Ensuite 101", "Wardrobe 101", …). Before creating anything, `handleCreate()` collects every distinct non-empty apartment name across the batch (case-insensitive) and resolves each exactly once: reuse an existing apartment if the project already has one with that name (case-insensitive match against the `apartments` already loaded on the page — the same list `AddRoomDialog`'s apartment picker uses), otherwise create it — before any room in that apartment is created, so every room create already has a real `apartment_id` rather than being created unassigned and reassigned after. Both the apartment-name normalisation ("101" → "Apartment 101", matching this app's existing naming convention so it lines up with what `seed.py` and `AddApartmentDialog` already produce) and the dedup live in the frontend; the backend endpoints being called are unaware anything is happening in bulk.

### 18.3 Partial failure is reported per row, not rolled back

This deliberately isn't a single atomic transaction. Rows are created one at a time (apartments first, then rooms, in the order pasted) so that if one row is malformed — or an apartment fails to create — every other row still succeeds, and the result screen lists exactly which room(s) failed and why, with everything else already sitting in the project. Rolling the whole batch back on one bad row would punish pasting 50 correct rows for one typo; per-row reporting matches how a manager would actually want to fix it (correct the one bad line and paste just that one again, or fix it by hand in the app). Rooms whose apartment failed to create are reported as "skipped" rather than silently created unassigned — an explicit, visible outcome rather than a silent data mismatch between what the sheet said and what landed in the app.

### 18.4 Defaults apply to the whole batch; per-room detail stays a follow-up edit

The bulk dialog collects one priority, one optional detailer, and one optional due date, applied to every room in that paste — it deliberately doesn't try to parse those per-row from the sheet, since the team's sheets don't carry them (§18.1). A batch that needs to split across two priorities or detailers is two pastes, not one — simpler than a wider per-row form that would fight with the one-column paste shape being solved for here. Code, description, estimated hours and notes aren't collected at all in bulk; anything needing those goes through the single-room "Add room" dialog or the room detail page afterward, same as a room created any other way.

## 19. Planning: Marking Past Weeks Green/Red

A fifth follow-up request on top of §16: once a planned week is over, show at a glance whether each plan item actually happened — green for "yes", red for "no" — rather than the plan chip staying the same neutral color forever, before and after the week it describes.

### 19.1 "Completed" means "logged any time that week", not a manual checkbox

Asked directly rather than assumed: the alternative was a manual "mark as done" control on each plan chip, decoupled from anything else in the app. That was rejected in favor of deriving the status automatically from data the app already has — a detailer's own `time_entries` (§13) — because a manual checkbox is one more thing a team leader has to remember to tick, and can drift from reality (marked done but no time logged, or vice versa) the same way a decoupled forecast could drift from `project_assignments` (§16.2). A plan item is green if that detailer logged *any* time entry against that project during that plan's week, red if they didn't — nothing more granular than a yes/no; whether they logged 20 minutes or 8 hours doesn't change the color, though the exact hours are still available in the tooltip (§19.3).

This is one-directional in scope: it reuses `time_entries` purely as a read for this feature. It doesn't touch §16.2's rule that a plan entry drives `project_assignments` — that link stays exactly as it was, un-retracting and independent of whether anything was ever logged.

### 19.2 One new report endpoint, no new table and no migration

`GET /reports/time-logged?week_start=` (`app/api/routes/reports.py`) returns every `(user_id, project_id)` pair with at least one time entry whose `started_at` falls in the 7 days starting `week_start`, alongside the summed `logged_minutes` for that pair. A pair with nothing logged simply has no row — the frontend treats "no row" as "nothing logged," not as an error or a zero to distinguish from a missing row.

Like `weekly_plan_service.monday_of()` (§16.3), `week_start` is treated as a plain UTC calendar week (`[week_start 00:00 UTC, week_start + 7 days)`) rather than resolved per-user local time — consistent with, not more precise than, the rest of the planning feature, and the frontend only ever calls it with one of its own already-Monday-normalised week values (§16.3), so the endpoint doesn't re-normalise `week_start` itself. This is a pure read over the existing `time_entries` and `rooms` tables (joined to get from a time entry to its project) — no new table, no new column, and no migration to run when updating.

### 19.3 Past/current/future decided client-side; the plan chip does triple duty

`lib/week.ts::isPastWeek(mondayIso)` compares ISO date strings directly against `mondayOf()` (valid because weeks are always Monday-aligned, so string comparison is chronological comparison) to decide whether the currently-viewed week is fully over. The Planning page (`app/(app)/planning/page.tsx`) only fetches `GET /reports/time-logged` at all when the viewed week is past — the current and every future week have nothing to judge yet, so their chips stay the same neutral "info" color they always were, and the page shows no legend line. Viewing a past week adds a one-line legend under that week's heading ("Past week — green means they logged time on it that week, red means nothing was logged") and recolors every existing plan chip:

- **green**: the detailer has a row in that week's `time-logged` response for that project.
- **red**: the detailer is planned on that project for that week but has no row.

The chip's tooltip (`title`) does triple duty depending on the week: a future/current-week chip shows the plan's own note (unchanged from §16.5); a past green chip shows the actual hours logged that week plus the note ("Logged 2.0h that week · finishing kitchens"); a past red chip says plainly that nothing was logged. Nothing here is color-only, the same accessibility rule as the presence dot (§17.3) and the Gantt rework (§12.4).

Removing or adding a plan entry for a past week still works exactly as it did before (§16.5) — this feature only changes how an existing chip is colored and labelled, not whether it can be edited.

## 20. Linking the Timer to the Detailer Action Set

A sixth follow-up request, but not a new feature on its own — a gap between two things that already existed. §12.1 gave detailers Start / On Hold / Ready for Check on the room detail page; §13 gave them an independent Start timer / Stop on the same page. Nothing connected the two: a detailer could put a room On Hold or mark it Ready for Check while their timer kept running on it, and the only way to close that time entry out was to separately remember the Time card's own Stop button.

### 20.1 On Hold and Ready for Check now stop a timer running on that room, not just record the workflow change

Asked directly rather than assumed, since this changes existing button behavior: should stopping the timer stay a fully separate, manual action, or should it ride along with On Hold / Ready for Check? The answer was to link them. `DetailerActionsCard` (`frontend/app/(app)/rooms/[id]/page.tsx`) now reads `activeEntry` from the same `TimeTrackingContext` the Time card already uses (§13.4), and both `handleOnHoldSubmit()` and `handleReadyForCheck()` call a shared `stopTimerIfRunningHere()` first — a no-op if nothing is running on this room, otherwise `TimeTrackingContext.stop()` followed by a re-fetch of the room's time-entry list so the Time card's total and history update in the same round trip rather than going stale until the next poll.

This is entirely a frontend change — no new endpoint, no schema change. The existing `stop()` call already knew how to close out whichever entry is currently active; the only new logic is *when* it fires. `activeEntry` is shared context state, so the header's running-timer chip, the Time card, and this new auto-stop all agree about what's running without any of them polling each other directly.

### 20.2 Why silently, not with a confirmation dialog

The obvious alternative — "Are you sure? This will also stop your timer" — was rejected the same way §16.2 rejected pausing on the plan/assignment link: a confirmation dialog on an action a detailer already chose to take (they clicked On Hold or Ready for Check on purpose) just adds a click without adding a real decision point. Instead, a one-line note appears in the "Your actions" card whenever a timer is running on that room — "Your timer is running on this room — it'll stop automatically when you use either action above" — stated before the fact, not asked as a confirmation after. Nothing here is a silent side effect: the note makes the behavior visible ahead of the click, matching this app's running rule (§17.3, §19.3) that anything conveyed through a state change also gets a line of text, not just an assumption that the user will notice.

### 20.3 What this does not change

Starting the timer is still a separate action from marking a room "Start"ed — clicking the workflow Start button does not also start the timer, only the reverse (stopping) is linked. A detailer who wants to review a room before actually starting the clock still can. Likewise, nothing about `stop_timer()`'s own behavior changed (§13.1's duration-derivation, §13.2's one-timer-per-user constraint) — this section only changes which frontend actions call the existing `stop()`.
