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
import { api, type KnowledgeStatusResponse } from "@/lib/api";
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
      "Inbox-driven organizer for sources, sessions, reviews, and handoff notes. It writes to an Obsidian-compatible LLM Wiki, not a new database.",
    icon: BookOpen,
  },
  {
    title: "Git Nexus",
    description:
      "Code-centered index connecting commits, files, symbols, sessions, reviews, NEXT_STEPS, and knowledge notes.",
    icon: GitBranch,
  },
  {
    title: "Thin orchestration",
    description:
      "Uses existing Hermes skills, file tools, session search, cron, and kanban instead of adding another agent runtime.",
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
    title: "MVP 3 — Safe proposals",
    status: "Planned",
    items: [
      "Process inbox into proposed diffs",
      "Apply safe changes",
      "Require approval for risky edits",
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
      "Existing notes, NEXT_STEPS, archive/delete actions, and confidence upgrades require review before apply.",
  },
  {
    title: "Git Nexus is an index",
    description:
      "Truth stays in git, the session DB, reviews, and markdown. Nexus connects them; it does not replace them.",
  },
];

const VAULT_TREE = String.raw`repo/
├── NEXT_STEPS.md
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    queueMicrotask(() => loadStatus(""));
    // Run once with the backend default path; manual refreshes go through the
    // header control below.
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
                Turn dropped sources, prior sessions, review output, and project
                handoff notes into a linked markdown vault. Obsidian remains the
                human graph/editor; Hermes manages inbox processing, provenance,
                stale checks, and automation.
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
              <p className="pl-4">-&gt; sessions</p>
              <p className="pl-4">-&gt; reviews</p>
              <p className="pl-4">-&gt; knowledge notes</p>
              <p className="pl-4">-&gt; NEXT_STEPS</p>
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
            <li>1. Add Git Nexus reverse links from file paths to notes and sessions.</li>
            <li>2. Show timeline tabs for commits, reviews, sessions, and knowledge updates.</li>
            <li>3. Add stale/skew checks for code_refs and created_commit metadata.</li>
            <li>4. Add proposal/diff flow before any risky write.</li>
          </ol>
        </CardContent>
      </Card>

      <PluginSlot name="knowledge:bottom" />
    </div>
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
          <Badge tone={nexus.isGitRepo ? "success" : "outline"} className="shrink-0 text-xs">
            {nexus.isGitRepo ? "Indexed" : "No repo"}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Dirty files" value={nexus.dirtyFiles.length} />
          <Metric label="Recent commits" value={nexus.recentCommits.length} />
          <Metric label="code_refs" value={nexus.codeRefCount} />
          <Metric label="commit refs" value={nexus.commitRefCount} />
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
            icon={Network}
            title="File → notes"
            empty="No code_refs reverse links yet."
            items={linkedFiles.map((link) => `${link.file} → ${link.notes.join(", ")}`)}
          />
        </div>
      </CardContent>
    </Card>
  );
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
