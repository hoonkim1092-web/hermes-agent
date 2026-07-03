import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  GitBranch,
  Inbox,
  Network,
  RefreshCw,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Input } from "@nous-research/ui/ui/components/input";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { usePageHeader } from "@/contexts/usePageHeader";
import { api, type KnowledgeSessionPromotionProposal, type KnowledgeStatusResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PluginSlot } from "@/plugins";

const DOCS_URL = "https://hermes-agent.nousresearch.com/docs/user-guide/features/knowledge-hub-git-nexus";

interface SummaryCard {
  title: string;
  description: string;
  icon: typeof Database;
}

interface PhaseCard {
  title: string;
  status: string;
  items: string[];
}

interface GuardrailCard {
  title: string;
  description: string;
}

const SUMMARY_CARDS: SummaryCard[] = [
  {
    title: "Knowledge Hub",
    description:
      "Inbox-driven organizer for sources, work state, sessions, reviews, and handoff notes. It writes to an Obsidian-compatible LLM Wiki, not a new database.",
    icon: BookOpen,
  },
  {
    title: "Git Nexus",
    description:
      "Code-centered index connecting commits, files, symbols, sessions, reviews, work-state tasks, optional handoff exports, and knowledge notes.",
    icon: GitBranch,
  },
  {
    title: "Thin orchestration",
    description:
      "Uses existing Hermes skills, file tools, session search, cron, Kanban, and Todo instead of adding another agent runtime or task database.",
    icon: Workflow,
  },
];

const PHASES: PhaseCard[] = [
  {
    title: "MVP 0 — Design surface",
    status: "Applied now",
    items: [
      "Dashboard landing page",
      "Detailed docs page",
      "No backend writes",
    ],
  },
  {
    title: "MVP 1 — Read-only vault status",
    status: "Applied now",
    items: [
      "Vault path input",
      "SCHEMA/index/log health",
      "Inbox and note counts",
    ],
  },
  {
    title: "MVP 2 — Git Nexus index",
    status: "Applied now",
    items: [
      "Recent commits and dirty files",
      "Parsed code_refs and created_commit",
      "File-to-note reverse links",
    ],
  },
  {
    title: "MVP 3 — Stale/skew checks",
    status: "Applied now",
    items: [
      "Missing code_refs",
      "Missing created_commit refs",
      "Read-only warning surface",
    ],
  },
  {
    title: "MVP 4 — Work-state links",
    status: "Applied now",
    items: [
      "Read existing Kanban tasks",
      "Show blocked decisions, links, and current focus",
      "Surface latest run and verification evidence",
    ],
  },
  {
    title: "MVP 5 — GitHub delivery status",
    status: "Applied now",
    items: [
      "Read current branch PR metadata through gh",
      "Show PR mergeability and review decision",
      "Show PR check names and conclusions",
      "Connect merged PRs to Kanban run evidence",
    ],
  },
  {
    title: "MVP 6 — Proposal/diff preview",
    status: "Design next",
    items: [
      "Preview intended files, commands, and git refs before writes",
      "Require explicit apply for branches, commits, PRs, and note rewrites",
      "Record accepted changes back to Kanban run evidence",
    ],
  },
];

const GUARDRAILS: GuardrailCard[] = [
  {
    title: "Raw sources are immutable",
    description:
      "Captured sessions, URLs, PDFs, and review output live under raw/ and are read-only after ingest.",
  },
  {
    title: "Diff first for risky edits",
    description:
      "Existing notes, NEXT_STEPS exports, archive/delete actions, and confidence upgrades require review before apply.",
  },
  {
    title: "Preview before write",
    description:
      "Branch creation, commits, PRs, note rewrites, and archive/delete actions should show planned files, commands, and refs before an explicit apply.",
  },
  {
    title: "Git Nexus is an index",
    description:
      "Truth stays in git, Kanban, session Todo context, the session DB, reviews, and markdown. Nexus connects them; it does not replace them.",
  },
];

const VAULT_TREE = String.raw`repo/
├── NEXT_STEPS.md  # optional export, not task truth
└── docs/wiki/
    ├── SCHEMA.md
    ├── index.md
    ├── log.md
    ├── inbox/
    ├── raw/
    ├── code/
    ├── knowledge/
    └── queries/`;

export default function KnowledgePage() {
  const { setAfterTitle, setEnd } = usePageHeader();
  const [vaultPath, setVaultPath] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [status, setStatus] = useState<KnowledgeStatusResponse | null>(null);
  const [proposal, setProposal] = useState<KnowledgeSessionPromotionProposal | null>(null);
  const [proposalSessionId, setProposalSessionId] = useState("");
  const [proposalLoading, setProposalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProposal = useCallback((sessionId = proposalSessionId) => {
    setProposalLoading(true);
    api
      .getKnowledgeSessionPromotionProposal(sessionId)
      .then((next) => {
        setProposal(next);
        setProposalSessionId(next.sessionId ?? sessionId);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setProposalLoading(false));
  }, [proposalSessionId]);

  const loadStatus = useCallback((path = vaultPath) => {
    setLoading(true);
    setError(null);
    api
      .getKnowledgeStatus(path)
      .then((next) => {
        setStatus(next);
        setVaultPath(next.requestedPath ?? "");
        setDraftPath(next.requestedPath ?? next.vaultPath);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [vaultPath]);

  useEffect(() => {
    queueMicrotask(() => {
      loadStatus("");
      loadProposal("");
    });
    // Run once with the backend default path/session; manual refreshes go through the
    // header control and proposal card below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    setAfterTitle(
      <Badge tone="outline" className="text-xs">
        Read-only preview
      </Badge>,
    );
    setEnd(
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          className="h-8 w-72 max-w-[50vw] text-xs"
          placeholder="Vault path (default: project docs/wiki)"
          value={draftPath}
          onChange={(event) => setDraftPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setVaultPath(draftPath.trim());
              loadStatus(draftPath.trim());
            }
          }}
        />
        <Button
          size="icon"
          ghost
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            setVaultPath(draftPath.trim());
            loadStatus(draftPath.trim());
          }}
          disabled={loading}
          aria-label="Refresh knowledge status"
        >
          {loading ? <Spinner /> : <RefreshCw />}
        </Button>
        <Button
          size="sm"
          outlined
          onClick={() => window.open(DOCS_URL, "_blank", "noopener,noreferrer")}
        >
          Open design doc
        </Button>
      </div>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [draftPath, loadStatus, loading, setAfterTitle, setEnd]);

  return (
    <div className="flex flex-col gap-6">
      <PluginSlot name="knowledge:top" />

      {error && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {status && <VaultStatus status={status} loading={loading} />}
      {status && <GitNexusStatus status={status} />}
      {status && <WorkStateStatus status={status} />}
      <SessionPromotionProposal
        loading={proposalLoading}
        proposal={proposal}
        sessionId={proposalSessionId}
        setSessionId={setProposalSessionId}
        onRefresh={() => loadProposal(proposalSessionId)}
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardContent className="space-y-5 py-6">
            <div className="flex flex-col gap-2">
              <p className="font-sans text-display text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Knowledge Hub + Git Nexus
              </p>
              <h2 className="font-mondwest text-display text-2xl tracking-wider text-foreground">
                Organic knowledge organization for Hermes projects
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Turn dropped sources, work state, prior sessions, review output,
                and project handoff notes into a linked markdown vault. Obsidian
                remains the human graph/editor; Hermes manages inbox processing,
                provenance, stale checks, and automation.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {SUMMARY_CARDS.map((item) => (
                <FeatureCard key={item.title} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Connected graph
              </h3>
            </div>
            <div className="rounded border border-border bg-background/50 p-3 font-mono-ui text-xs leading-5 text-muted-foreground">
              <p>commit / diff / branch</p>
              <p className="pl-4">-&gt; files and symbols</p>
              <p className="pl-4">-&gt; Kanban tasks and current-session todos</p>
              <p className="pl-4">-&gt; sessions</p>
              <p className="pl-4">-&gt; reviews</p>
              <p className="pl-4">-&gt; knowledge notes</p>
              <p className="pl-4">-&gt; NEXT_STEPS export</p>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              The goal is code archaeology: show why a file changed, which
              decisions support it, and which notes become stale when it moves.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Recommended vault shape
              </h3>
            </div>
            <pre className="overflow-x-auto rounded border border-border bg-background/50 p-3 text-xs leading-5 text-muted-foreground">
              {VAULT_TREE}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Implementation phases
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {PHASES.map((phase) => (
                <Phase key={phase.title} phase={phase} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {GUARDRAILS.map((item) => (
          <Card key={item.title}>
            <CardContent className="space-y-3 py-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-sans text-display text-sm uppercase tracking-[0.14em] text-foreground">
                  {item.title}
                </h3>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
              Next engineering slice
            </h3>
          </div>
          <ol className="grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
            <li>1. Treat proposal/diff preview as a read-first planning surface, not a write engine.</li>
            <li>2. Preview file targets, commands, git refs, risks, and expected Kanban evidence before apply.</li>
            <li>3. Require explicit user action before creating branches, commits, PRs, note rewrites, or archive/delete changes.</li>
            <li>4. After an accepted apply, write the outcome back to Kanban run evidence so Work State and Git Nexus stay connected.</li>
          </ol>
        </CardContent>
      </Card>

      <PluginSlot name="knowledge:bottom" />
    </div>
  );
}

function SessionPromotionProposal({
  loading,
  onRefresh,
  proposal,
  sessionId,
  setSessionId,
}: {
  loading: boolean;
  onRefresh: () => void;
  proposal: KnowledgeSessionPromotionProposal | null;
  sessionId: string;
  setSessionId: (value: string) => void;
}) {
  const candidateLines = proposal?.candidateNotes.map(
    (note) => `${note.path} [${note.confidence}] ${note.reason}`,
  ) ?? [];
  const boundaryLines = proposal
    ? [
        `mode: ${proposal.preview.mode}`,
        `explicit apply required: ${proposal.preview.applyRequired ? "yes" : "no"}`,
        ...(proposal.preview.applyEndpoint ? [`apply endpoint: ${proposal.preview.applyEndpoint}`] : []),
        ...proposal.preview.guardrails,
      ]
    : [];
  const sourceLines = proposal
    ? [
        ...(proposal.sessionId ? [`session ${proposal.sessionId}`] : []),
        ...proposal.sourceSessionRefs.filter((ref) => ref !== proposal.sessionId),
      ]
    : [];

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Session → wiki promotion proposal
              </h3>
              {loading && <Spinner className="text-muted-foreground" />}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Read-only analysis of a selected or latest Hermes session. It proposes durable wiki targets and an apply boundary without writing notes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-72 max-w-[50vw] text-xs"
              placeholder="Session id (blank: latest)"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onRefresh();
                }
              }}
            />
            <Button size="sm" outlined onClick={onRefresh} disabled={loading}>
              {loading ? <Spinner /> : "Analyze"}
            </Button>
          </div>
        </div>

        {proposal?.warning && (
          <p className="rounded border border-border bg-background/40 p-3 text-sm leading-6 text-muted-foreground">
            {proposal.warning}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Messages" value={proposal?.messageCount ?? 0} />
          <Metric label="Candidate notes" value={proposal?.candidateNotes.length ?? 0} />
          <Metric label="Write targets" value={proposal?.preview.writeTargets.length ?? 0} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <NexusList icon={FileText} title="Candidate wiki notes" empty="No candidate notes yet." items={candidateLines} />
          <NexusList icon={CheckCircle2} title="Durable decisions" empty="No durable decision snippets detected yet." items={proposal?.durableDecisions ?? []} />
          <NexusList icon={Network} title="Sources / files / PRs" empty="No source, file, or PR references detected yet." items={dedupe([...sourceLines, ...(proposal?.affectedFiles ?? []), ...(proposal?.affectedPullRequests ?? [])])} />
          <NexusList icon={AlertTriangle} title="Risks / conflicts" empty="No risk snippets detected yet." items={proposal?.risks ?? []} />
          <NexusList icon={ShieldCheck} title="Preview / apply boundary" empty="No apply boundary available yet." items={boundaryLines} />
          <NexusList icon={Inbox} title="Proposed write targets" empty="No proposed write targets yet." items={proposal?.preview.writeTargets ?? []} />
        </div>
      </CardContent>
    </Card>
  );
}

function VaultStatus({
  loading,
  status,
}: {
  loading: boolean;
  status: KnowledgeStatusResponse;
}) {
  const healthOk = status.exists && status.health.schema && status.health.index && status.health.log;
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              {healthOk ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Vault status
              </h3>
              {loading && <Spinner className="text-muted-foreground" />}
            </div>
            <p className="truncate font-mono-ui text-xs text-muted-foreground">
              {status.vaultPath}
            </p>
          </div>
          <Badge tone={healthOk ? "success" : "outline"} className="shrink-0 text-xs">
            {healthOk ? "Healthy" : status.exists ? "Needs setup" : "Missing"}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Markdown" value={status.counts.markdownFiles} />
          <Metric label="Inbox" value={status.counts.inboxItems} />
          <Metric label="Raw files" value={status.counts.rawFiles} />
          <Metric label="Broken links" value={status.counts.brokenLinks} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <HealthPill label="SCHEMA.md" ok={status.health.schema} />
          <HealthPill label="index.md" ok={status.health.index} />
          <HealthPill label="log.md" ok={status.health.log} />
        </div>

        <div className="grid gap-2 text-xs leading-5 text-muted-foreground md:grid-cols-3">
          <p>sources frontmatter: {status.counts.notesWithSources}</p>
          <p>code_refs frontmatter: {status.counts.notesWithCodeRefs}</p>
          <p>created_commit frontmatter: {status.counts.notesWithCommitRefs}</p>
        </div>

        {status.warnings.length > 0 && (
          <div className="rounded border border-border bg-background/40 p-3 text-sm leading-6 text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Warnings</p>
            <ul className="list-disc space-y-1 pl-5">
              {status.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GitNexusStatus({ status }: { status: KnowledgeStatusResponse }) {
  const nexus = status.gitNexus;
  const latestCommits = nexus.recentCommits.slice(0, 4);
  const dirtyFiles = nexus.dirtyFiles.slice(0, 6);
  const linkedFiles = nexus.fileToNotes.slice(0, 6);
  const missingCodeRefs = nexus.missingCodeRefs.slice(0, 6);
  const missingCommitRefs = nexus.missingCommitRefs.slice(0, 6);
  const staleCount = nexus.missingCodeRefs.length + nexus.missingCommitRefs.length;
  const github = nexus.github;
  const pr = github.pullRequest;
  const prLines = pr
    ? [
        `#${pr.number ?? "?"} [${pr.state ?? "unknown"}] ${pr.title ?? "Untitled PR"}`,
        `${pr.headRefName ?? github.branch ?? "branch"} → ${pr.baseRefName ?? "base"}`,
        `mergeable: ${pr.mergeable ?? "unknown"}${pr.reviewDecision ? ` · review: ${pr.reviewDecision}` : ""}`,
        ...(pr.url ? [pr.url] : []),
      ]
    : [];
  const checkLines = github.checks.map(
    (check) => `${check.name}: ${check.conclusion ?? check.status ?? "pending"}`,
  );
  const mergedPrLines = github.mergedPullRequests.map((mergedPr) => {
    const mergedAt = mergedPr.mergedAt ? mergedPr.mergedAt.slice(0, 10) : "merged";
    const commit = mergedPr.mergeCommit ? ` · ${mergedPr.mergeCommit.slice(0, 7)}` : "";
    return `#${mergedPr.number ?? "?"} ${mergedAt}${commit} ${mergedPr.title ?? "Untitled PR"}`;
  });
  const mergedProvenanceLines = github.mergedPullRequests.flatMap((mergedPr) => {
    const prLabel = `#${mergedPr.number ?? "?"}`;
    const rows: string[] = [];
    if (mergedPr.reviewDecision) {
      rows.push(`${prLabel} review: ${mergedPr.reviewDecision}`);
    }
    rows.push(
      ...mergedPr.checks.map(
        (check) => `${prLabel} ${check.name}: ${check.conclusion ?? check.status ?? "pending"}`,
      ),
    );
    return rows;
  });
  const mergedEvidenceLines = github.mergedPullRequests.flatMap((mergedPr) => {
    const prLabel = `#${mergedPr.number ?? "?"}`;
    return mergedPr.kanbanEvidence.flatMap((evidence) => {
      const rows = [`${prLabel} ↔ ${evidence.taskId ?? "task"} [${evidence.status ?? "unknown"}] ${evidence.title ?? "Untitled task"}`];
      if (evidence.latestRunSummary) {
        rows.push(`${prLabel} ${evidence.taskId ?? "task"} run: ${evidence.latestRunSummary}`);
      }
      const verification = formatVerificationEvidence(evidence.verification);
      if (verification) {
        rows.push(`${prLabel} ${evidence.taskId ?? "task"} verification: ${verification}`);
      }
      return rows;
    });
  });

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Git Nexus
              </h3>
            </div>
            <p className="truncate font-mono-ui text-xs text-muted-foreground">
              {nexus.gitRoot ?? "No git repository found above the vault"}
            </p>
          </div>
          <Badge tone={nexus.isGitRepo && staleCount === 0 ? "success" : "outline"} className="shrink-0 text-xs">
            {nexus.isGitRepo ? (staleCount === 0 ? "Indexed" : `${staleCount} stale refs`) : "No repo"}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-9">
          <Metric label="Dirty files" value={nexus.dirtyFiles.length} />
          <Metric label="Recent commits" value={nexus.recentCommits.length} />
          <Metric label="code_refs" value={nexus.codeRefCount} />
          <Metric label="commit refs" value={nexus.commitRefCount} />
          <Metric label="Missing files" value={nexus.missingCodeRefs.length} />
          <Metric label="Missing commits" value={nexus.missingCommitRefs.length} />
          <Metric label="PR" value={pr ? pr.number ?? 1 : 0} />
          <Metric label="Checks" value={github.checks.length} />
          <Metric label="Merged PRs" value={github.mergedPullRequests.length} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <NexusList
            icon={FileText}
            title="Dirty files"
            empty="Working tree is clean or unavailable."
            items={dirtyFiles.map((file) => `${file.status.trim() || "??"} ${file.path}`)}
          />
          <NexusList
            icon={Clock}
            title="Recent commits"
            empty="No commits found."
            items={latestCommits.map((commit) => `${commit.shortHash} ${commit.subject}`)}
          />
          <NexusList
            icon={GitBranch}
            title="GitHub PR"
            empty={github.warning || "No pull request found for the current branch."}
            items={prLines}
          />
          <NexusList
            icon={ShieldCheck}
            title="PR checks"
            empty={github.warning || "No GitHub status checks found for this PR."}
            items={checkLines}
          />
          <NexusList
            icon={CheckCircle2}
            title="Merged delivery"
            empty="No recently merged pull requests found for main."
            items={mergedPrLines}
          />
          <NexusList
            icon={ShieldCheck}
            title="Merged review/checks"
            empty="No review decisions or status checks found for merged PRs."
            items={dedupe(mergedProvenanceLines)}
          />
          <NexusList
            icon={ShieldCheck}
            title="Merged delivery + run evidence"
            empty="No merged PRs are linked to completed Kanban run evidence yet."
            items={dedupe(mergedEvidenceLines)}
          />
          <NexusList
            icon={Network}
            title="File → notes"
            empty="No code_refs reverse links yet."
            items={linkedFiles.map((link) => `${link.file} → ${link.notes.join(", ")}`)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <NexusList
            icon={AlertTriangle}
            title="Missing code_refs"
            empty="All code_refs resolve to files in the git root."
            items={missingCodeRefs.map((link) => `${link.file} → ${link.notes.join(", ")}`)}
          />
          <NexusList
            icon={AlertTriangle}
            title="Missing commit refs"
            empty="All created_commit refs resolve to local commits."
            items={missingCommitRefs.map((link) => `${link.commit} → ${link.notes.join(", ")}`)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function WorkStateStatus({ status }: { status: KnowledgeStatusResponse }) {
  const work = status.workState;
  const focusLines = work.currentFocus.items.map(
    (item) => `${item.status} ${item.id}: ${item.content}`,
  );
  const taskLines = work.tasks.map((task) => {
    const owner = task.assignee ? ` @${task.assignee}` : "";
    const links =
      task.links.files.length +
      task.links.branches.length +
      task.links.prs.length +
      task.links.commits.length +
      task.links.sessions.length +
      task.links.notes.length;
    const suffix = links ? ` · ${links} link${links === 1 ? "" : "s"}` : "";
    return `${task.id} [${task.status}]${owner} ${task.title}${suffix}`;
  });
  const blockedLines = work.tasks
    .filter((task) => task.status === "blocked")
    .map((task) => `${task.id}: ${task.blockedReason || task.blockKind || "blocked"}`);
  const relationLines = work.tasks.flatMap((task) => {
    const rows = [
      ...task.links.branches.map((branch) => `${task.id} branch ${branch}`),
      ...task.links.prs.map((pr) => `${task.id} PR ${pr}`),
      ...task.links.commits.map((commit) => `${task.id} commit ${commit}`),
      ...(task.branchName ? [`${task.id} branch ${task.branchName}`] : []),
    ];
    return rows;
  });
  const sessionDocLines = work.tasks.flatMap((task) => [
    ...(task.sessionId ? [`${task.id} session ${task.sessionId}`] : []),
    ...task.links.sessions.map((sessionId) => `${task.id} session ${sessionId}`),
    ...task.links.notes.map((note) => `${task.id} note ${note}`),
    ...task.links.files.map((file) => `${task.id} file ${file}`),
  ]);
  const runEvidenceLines = work.tasks.flatMap((task) => {
    const rows: string[] = [];
    if (task.latestRunSummary) {
      rows.push(`${task.id} run: ${task.latestRunSummary}`);
    }
    const verification = formatVerificationEvidence(task.verification);
    if (verification) {
      rows.push(`${task.id} verification: ${verification}`);
    }
    return rows;
  });
  const kanbanTaskEmpty = work.available
    ? "No active Kanban tasks found. Durable project work state comes from Kanban; create tasks with `hermes kanban create`."
    : "Kanban work state is unavailable. The dashboard only reads an existing Kanban board and will not create one while rendering.";

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-sans text-display text-sm uppercase tracking-[0.16em] text-foreground">
                Work State
              </h3>
            </div>
            <p className="truncate font-mono-ui text-xs text-muted-foreground">
              {work.dbPath ?? "Kanban data unavailable"}
            </p>
          </div>
          <Badge tone={work.available ? "success" : "outline"} className="shrink-0 text-xs">
            {work.available ? `Board: ${work.board ?? "default"}` : "Unavailable"}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Tasks" value={work.counts.total} />
          <Metric label="Blocked" value={work.counts.blocked} />
          <Metric label="Running" value={work.counts.running} />
          <Metric label="Ready" value={work.counts.ready} />
          <Metric label="Review" value={work.counts.review} />
        </div>

        {work.warning && (
          <p className="rounded border border-border bg-background/40 p-3 text-sm leading-6 text-muted-foreground">
            {work.warning}
          </p>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <NexusList
            icon={Workflow}
            title="Kanban tasks"
            empty={kanbanTaskEmpty}
            items={taskLines}
          />
          <NexusList
            icon={AlertTriangle}
            title="Blocked decisions"
            empty="No blocked Kanban tasks in the current summary."
            items={blockedLines}
          />
          <NexusList
            icon={Clock}
            title="Current focus"
            empty={work.currentFocus.warning || "No active current-session Todo focus."}
            items={focusLines}
          />
          <NexusList
            icon={GitBranch}
            title="Branches / PRs / commits"
            empty="No branch, PR, or commit links found in the current summary."
            items={dedupe(relationLines)}
          />
          <NexusList
            icon={Network}
            title="Sessions / docs / files"
            empty="No session, note, or file links found in the current summary."
            items={dedupe(sessionDocLines)}
          />
          <NexusList
            icon={ShieldCheck}
            title="Run / verification evidence"
            empty="No latest run summary or verification evidence found in Kanban task runs."
            items={dedupe(runEvidenceLines)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function formatVerificationEvidence(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatVerificationEvidence(item)).filter(Boolean).join(", ") || null;
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatVerificationEvidence(item);
        return formatted ? `${key}: ${formatted}` : null;
      })
      .filter(Boolean)
      .join(" · ") || null;
  }
  return null;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items)).slice(0, 8);
}

function NexusList({
  empty,
  icon: Icon,
  items,
  title,
}: {
  empty: string;
  icon: typeof Database;
  items: string[];
  title: string;
}) {
  return (
    <div className="rounded border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="font-sans text-display text-xs uppercase tracking-[0.14em] text-foreground">
          {title}
        </p>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="truncate font-mono-ui">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-background/40 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mondwest text-display text-xl tracking-wider text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function HealthPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded border border-border bg-background/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Badge tone={ok ? "success" : "outline"} className="text-[0.65rem]">
        {ok ? "Found" : "Missing"}
      </Badge>
    </div>
  );
}

function FeatureCard({ item }: { item: SummaryCard }) {
  const Icon = item.icon;
  return (
    <div className="rounded border border-border bg-background/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-sans text-display text-sm uppercase tracking-[0.14em] text-foreground">
          {item.title}
        </h3>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
    </div>
  );
}

function Phase({ phase }: { phase: PhaseCard }) {
  return (
    <div className="rounded border border-border bg-background/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="font-sans text-display text-xs uppercase tracking-[0.14em] text-foreground">
          {phase.title}
        </h4>
        <Badge tone="outline" className="shrink-0 text-[0.65rem]">
          {phase.status}
        </Badge>
      </div>
      <ul className="space-y-1 text-sm leading-6 text-muted-foreground">
        {phase.items.map((item) => (
          <li key={item} className={cn("flex gap-2")}>
            <span aria-hidden>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
