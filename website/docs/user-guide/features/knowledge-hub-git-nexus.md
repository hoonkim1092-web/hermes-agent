---
title: Knowledge Hub and Git Nexus
sidebar_label: Knowledge Hub
---

# Knowledge Hub and Git Nexus

Knowledge Hub is a proposed dashboard workflow for turning sources, work state, session history, review output, and project handoff notes into an Obsidian-compatible LLM Wiki. Git Nexus is the code-centered companion view that connects those notes back to commits, files, symbols, reviews, sessions, work-state tasks, and optional handoff exports.

The feature is intentionally thin: it should not add a second agent runtime, a new core orchestration loop, a new task database, or a new memory database. It should use Hermes's existing primitives: dashboard pages, skills, file/search tools, session search, cron jobs, kanban, the per-session todo tool, and project-local markdown files.

## Goals

- Make it easy to drop material into an inbox and ask Hermes to organize it.
- Keep raw sources immutable and separate from synthesized wiki pages.
- Preserve provenance for claims, code references, sessions, reviews, and commits.
- Treat Hermes Kanban as the durable work-state source of truth, with the per-session Todo list as active in-session focus.
- Provide safe automation: propose diffs first, auto-apply only low-risk changes, and require approval for destructive or high-confidence-changing edits.
- Surface stale or skewed knowledge when referenced code moves or referenced commits are missing locally.
- Use `NEXT_STEPS.md` only as a human-readable export or handoff view, not as a second task registry.
- Let Obsidian remain the human browsing/editing UI while the dashboard acts as the agent control plane.

## Non-goals

- Do not port another project's orchestration engine into Hermes core.
- Do not create a new core model tool for wiki management.
- Do not replace Obsidian or the existing file browser.
- Do not silently delete notes, overwrite contested claims, or rewrite handoff files without review.
- Do not make Git Nexus a new source of truth. It is an index over git, sessions, reviews, and markdown.
- Do not recreate AF-style `NEXT_STEPS.md` ownership as a new Hermes file or DB. Kanban/Todo already owns work state.
- Do not add `.hermes/project_state/tasks.json`, a parallel task registry, or another work queue for Knowledge Hub.

## Concept summary

| Layer | Responsibility | Backing store |
| --- | --- | --- |
| Knowledge Hub | Ingest, classify, propose wiki updates, run wiki health checks | Markdown vault + Hermes skills/tools |
| LLM Wiki | Schema, index, log, raw sources, entity/concept/query pages | Obsidian-compatible markdown |
| Obsidian | Human graph view, editing, Dataview queries, sync | Same markdown vault |
| Work State | Current task status, blocked decisions, next actions, assignees, handoffs | Hermes Kanban + per-session Todo context |
| Git Nexus | Connect notes to files, symbols, commits, sessions, reviews, and work state | Git + session DB + Kanban + Todo context + markdown refs |
| Automation | Scheduled inbox processing, stale checks, weekly health reports | Hermes cron/kanban |

## Work-state source of truth

Knowledge Hub should read from the existing Hermes work primitives instead of inventing a second project task system.

| Primitive | Role in the graph | Notes |
| --- | --- | --- |
| Kanban | Durable project work state: status, blocked decisions, next actions, assignee, priority, task links, comments, run summaries, verification metadata | Primary source for anything that must survive sessions, restarts, and worker handoffs. |
| Todo | Active single-session focus list: what the current agent is doing right now | Useful as a live focus signal and compression-surviving checklist, but not cross-session durable project state. |
| Git/GitHub | Branches, commits, PRs, changed files, review gates | Code truth and delivery provenance. |
| Session DB | Conversation originals and decision rationale | Evidence source, not a task board. |
| docs/wiki | Durable decisions, architecture notes, incidents, code notes, claim/evidence/implication pages | Knowledge truth, not current task status. |
| `NEXT_STEPS.md` | Optional human-readable export/handoff generated from Kanban, Todo, git, sessions, and docs | A view, not the source of truth. Editing it should not be the primary way to mutate work state. |

Dashboard rule: if a screen asks “what is next, who owns it, why is it blocked, what verified it?”, it should read Kanban first, enrich with Todo/session/git/wiki links when available, and only then offer an export/handoff view.

## Recommended vault shape

For a project-local vault:

```text
repo/
├── NEXT_STEPS.md        # optional human export, not task truth
└── docs/wiki/
    ├── SCHEMA.md
    ├── index.md
    ├── log.md
    ├── inbox/
    │   ├── sources/
    │   ├── sessions/
    │   ├── reviews/
    │   └── tasks/       # captured task artifacts only; live state stays in Kanban
    ├── raw/
    │   ├── sources/
    │   ├── sessions/
    │   └── reviews/
    ├── code/
    │   ├── symbols.md
    │   ├── modules/
    │   └── decisions/
    ├── knowledge/
    │   ├── concepts/
    │   ├── patterns/
    │   ├── incidents/
    │   └── comparisons/
    └── queries/
```

For a cross-project personal wiki, the same shape can live under `WIKI_PATH` / `OBSIDIAN_VAULT_PATH`, with per-project folders inside `raw/` and `knowledge/`.

## Note contract

Knowledge notes should prefer claim/evidence/implication over prose-only summaries.

```yaml
---
title: Review Gate Provider Parity
type: pattern
created: 2026-07-02
updated: 2026-07-02
sources:
  - raw/sessions/2026-06-25-review-gate.md
code_refs:
  - core/providers/session_adapter.py:583
  - core/providers/session_adapter.py:691
created_commit: d75f3c49
confidence: high
status: active
---
```

Required body sections for project knowledge:

- `Claim` — the durable fact or decision.
- `Evidence` — raw source, session, review, commit, file, or line references.
- `Implication` — how future agents should use the knowledge.
- `Links` — Obsidian `[[wikilinks]]` to related notes.

## Knowledge Hub dashboard UX

### Inbox

- Add URL.
- Upload PDF/Markdown/text.
- Paste memo.
- Import session.
- Import review output.
- Import git diff or PR summary.

Inbox item states:

```text
pending -> analyzed -> proposed -> applied | skipped
```

### Proposed changes

Hermes should present proposed changes before writing when an operation touches existing notes or handoff files.

Example proposal:

```text
Source: 2026-07-02 AF orchestration discussion

[+] Create knowledge/concepts/thin-orchestration-layer.md
[~] Update code/orchestration.md
[~] Update NEXT_STEPS.md
[+] Add wikilinks to 3 notes
[!] Potential conflict with existing note: af-dynamic-orchestrator.md

Actions:
- Apply safe changes
- Review diff
- Ask Hermes to revise
- Skip
```

Safe auto-apply candidates:

- Move inbox item into `raw/`.
- Create a new low-risk note with provenance.
- Append a log entry.
- Add missing index entries for newly-created notes.
- Report broken links/stale refs.

Approval-required candidates:

- Edit `NEXT_STEPS.md`.
- Overwrite existing notes.
- Delete or archive notes.
- Resolve contested claims.
- Raise confidence to `high`.
- Rewrite code references after a stale/skew finding.

### Vault browser

The dashboard should show:

- `SCHEMA.md`, `index.md`, and `log.md` health.
- Pending inbox count.
- Recent notes.
- Broken wikilinks.
- Orphan notes.
- Low-confidence and contested notes.
- Stale/skewed code references.
- Linked Kanban/Todo work-state signals without mutating them.

The first read-only slice is `/api/knowledge/status`. It accepts an optional
`path` query parameter; without one it scans `WIKI_PATH`, `OBSIDIAN_VAULT_PATH`,
or the active project `docs/wiki` path. It reports vault existence,
`SCHEMA.md`/`index.md`/`log.md` health, markdown/inbox/raw counts,
frontmatter usage, broken wikilinks, orphan candidates, and an embedded
read-only Git Nexus summary: nearest git root, dirty files, recent commits,
parsed `code_refs` / `created_commit`, file-to-note reverse links, and
read-only stale/skew checks for missing referenced files or missing local
commits. It performs no writes.

### Automation

Dashboard toggles should create or update Hermes cron jobs instead of creating a new scheduler:

- Process inbox every N hours.
- Run wiki doctor daily.
- Generate weekly knowledge health report.
- Suggest handoff updates after coding sessions.
- File review gate findings after reviews.

## Git Nexus dashboard UX

Git Nexus connects the project graph:

```text
commit / diff / branch / PR
  -> files and symbols
  -> Kanban tasks and current-session todos
  -> sessions
  -> reviews
  -> knowledge notes
  -> NEXT_STEPS export/handoff view
```

Primary views:

1. Timeline — sessions, decisions, commits, reviews, knowledge updates, and handoff changes.
2. Files & Symbols — reverse index from file or symbol to notes/reviews/sessions.
3. Commits — commits annotated with related sessions, reviews, and knowledge updates.
4. Sessions — promote a session into wiki notes or attach it to a commit/task.
5. Reviews — PASS/WARN/BLOCK history and linked diffs.
6. Knowledge Links — `code_refs`, `created_commit`, source refs, and stale candidates.
7. Work State — Kanban tasks and current-session todos enriched with related files, notes, commits, reviews, sessions, and optional NEXT_STEPS export lines.

Example file view:

```text
core/providers/session_adapter.py

Referenced by:
- knowledge/session-distillation-provider-parity.md
- NEXT_STEPS.md line 115
- reviews/2026-06-23-s2-3.md

Recent commits:
- 68cd91c2 S2-3 wiring
- d75f3c49 review-gate skip

Sessions:
- 2026-06-23 S2-3 wiring complete
- 2026-06-24 precision audit
```

## Backend design

Phase 1 can be read-only and filesystem-backed:

- Scan configured vault path for markdown files.
- Parse frontmatter conservatively with existing YAML dependencies.
- Extract `[[wikilinks]]`, `code_refs`, `sources`, and `created_commit`.
- Read git status/history through the terminal/backend process, not browser JS.
- Read durable task state through the existing Kanban DB/API layer; do not create a second Knowledge Hub task table.
- Treat the per-session Todo list as an active-session signal only unless a session export includes it.
- Read sessions through the existing session DB APIs.
- Return summaries for the dashboard page.

Phase 2 adds proposal generation:

- Dashboard sends an inbox item plus operation intent.
- Hermes launches an agent run with `llm-wiki` and `obsidian` skills.
- Agent writes proposed patches into a temp proposal directory or returns a structured file-change plan.
- Dashboard displays the diff.
- User applies, revises, skips, or schedules.

Phase 3 adds automation:

- Dashboard creates cron jobs with self-contained prompts.
- Jobs use `workdir` and skills to process a specific vault/project.
- Cron output is local unless the user configures gateway delivery.

## Implementation phases

### MVP 0: Navigation and design surface

- Add a dashboard Knowledge page that documents the workflow and serves as the landing page.
- Add this documentation page.
- No backend writes.

### MVP 1: Read-only vault status

- Add a page input for vault path.
- Add `/api/knowledge/status` returning schema/index/log presence, inbox counts, note counts, frontmatter counts, broken wikilinks, orphan candidates, and warning counts.
- Show status cards in the dashboard.
- Keep the endpoint read-only and filesystem-backed.

### MVP 2: Git Nexus read-only index

- Extend `/api/knowledge/status` with an embedded `gitNexus` summary returning git status, recent commits, parsed `code_refs`, `created_commit`, and reverse file-to-note links.
- Show the Git Nexus summary card in the dashboard.

### MVP 3: Stale/skew read-only checks

- Flag `code_refs` whose referenced file is missing under the nearest git root.
- Flag `created_commit` values that do not resolve to a local commit.
- Surface both warning lists in the Git Nexus dashboard card without attempting repairs.
- Keep Timeline, Files, Commits, and Knowledge Links tabs as the next richer UX slice.

### MVP 4: Kanban/Todo read-only work-state links

- Extend the Knowledge/Git Nexus dashboard with a read-only work-state section backed by existing Kanban board data.
- Show task status, blocked items, current next actions, assignees, parent/child links, latest completed run summaries, and verification metadata when available.
- Link tasks to files/commits/notes/sessions using existing task body, comments, run metadata, and git refs; avoid adding a new task registry or schema unless a small optional link field is proven necessary.
- If current session Todo data is available in the active agent/session context, display it as "current focus" rather than durable project truth.

#### Work list

1. Inspect the existing Kanban CLI/API/storage shape and pick the narrowest read-only integration point for the dashboard backend.
2. Add a read-only backend summary for work state: task id/title/status, blocked reason, next action, assignee, priority, linked files/commits/sessions/notes, latest run summary, and verification metadata when present.
3. Keep Todo separate: expose it only when current-session context is available, label it as active focus, and never persist it as project truth.
4. Add a compact Work State panel to `KnowledgePage.tsx` that consumes the read-only summary and degrades cleanly when Kanban or Todo data is unavailable.
5. Add/extend tests for the backend summary: empty board, blocked task, task with links, missing Kanban data, and read-only/no-write behavior.
6. Update docs/dashboard copy only as needed; do not add `.hermes/project_state/tasks.json`, a markdown task registry, or a new work queue.

### MVP 5: Safe proposals

- Add inbox item processing that produces a diff proposal.
- Allow apply-safe, review-diff, revise, and skip.
- Block destructive changes behind explicit confirmation.

### MVP 6: Automation

- Add dashboard buttons that create cron jobs for inbox processing, daily doctor, and weekly report.
- Use existing cron job storage and prompts; do not create a new scheduler.

## Guardrails

- Raw files are immutable after ingest.
- Existing notes are patched, not blindly rewritten.
- Destructive actions require approval.
- `NEXT_STEPS.md` edits require approval by default.
- Kanban remains the durable work-state source of truth; Todo is session focus; `NEXT_STEPS.md` is an export/handoff view.
- Do not introduce a parallel task DB, `.hermes/project_state/tasks.json`, or markdown task registry for Knowledge Hub.
- Confidence upgrades require evidence from multiple sources or user approval.
- Stale/skew findings are advisory until explicitly applied.
- The page must work without Obsidian installed because the vault is plain markdown.

## Relationship to AF-style orchestration

This design imports the useful discipline from AF-style workflows without importing a separate orchestration engine:

- Keep planning-first and review-gate discipline as skills/policies.
- Keep deterministic provenance, code references, stale/skew checks, and handoff rules.
- Reuse Hermes dashboard, skills, session search, cron, kanban, and file tools.
- Avoid duplicating provider runners, task boards, or agent loops.
