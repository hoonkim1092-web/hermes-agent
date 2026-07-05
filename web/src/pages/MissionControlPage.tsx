import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Boxes,
  FolderKanban,
  GitBranch,
  MessageSquare,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { usePageHeader } from "@/contexts/usePageHeader";
import { api, type ProjectControlStatus, type ProjectControlDeliverySync, type KnowledgeWorkStateTask } from "@/lib/api";

const MISSION_TABS = [
  ["Overview", "현재 미션과 보드 상태를 한눈에 봅니다."],
  ["Board", "Kanban task graph와 상태를 표시합니다."],
  ["Agents", "assignee/worker 관점으로 진행 중인 일을 봅니다."],
  ["Comms", "task event, comment, blocker 흐름을 추적합니다."],
  ["Harness", "실제 실행 검증 evidence를 모읍니다."],
  ["Artifacts", "산출물 경로와 PR/file 링크를 찾습니다."],
  ["Knowledge", "프로젝트별 지식저장창고 문서를 연결합니다."],
  ["Timeline", "mission 이벤트를 시간순으로 봅니다."],
] as const;

export default function MissionControlPage() {
  const { setAfterTitle, setEnd } = usePageHeader();
  const [status, setStatus] = useState<ProjectControlStatus | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getProjectControlStatus()
      .then((next) => {
        setStatus(next);
        setSelectedProject((current) => current ?? next.projects[0]?.name ?? null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    setAfterTitle(
      <Badge tone="outline" className="text-xs">
        AF-style 관제
      </Badge>,
    );
    setEnd(
      <Button type="button" outlined size="sm" onClick={load} disabled={loading}>
        {loading ? <Spinner className="mr-2 h-3 w-3" /> : <RefreshCw className="mr-2 h-3 w-3" />}
        새로고침
      </Button>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [load, loading, setAfterTitle, setEnd]);

  const selected = useMemo(
    () => status?.projects.find((project) => project.name === selectedProject) ?? status?.projects[0] ?? null,
    [selectedProject, status?.projects],
  );
  const tasks = status?.workState.tasks ?? [];
  const runningTasks = tasks.filter((task) => task.status === "running");
  const blockedTasks = tasks.filter((task) => task.status === "blocked");
  const harnessTasks = tasks.filter((task) => task.verification || task.latestRunSummary).slice(0, 5);
  const artifactTasks = tasks.filter((task) => countTaskLinks(task) > 0).slice(0, 5);

  if (loading && !status) {
    return <Spinner className="text-2xl text-primary" />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-sans text-display text-lg tracking-[0.04em]">Project Control Center</h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              큰 작업을 AF-style mission으로 볼 수 있는 읽기 전용 관제 화면입니다. Kanban이 작업 상태의 SSOT이고,
              이 화면은 보드, 에이전트, 하네스, 산출물, 지식저장창고를 한곳에 모아 보여줍니다.
            </p>
            {status?.vaultPath && <p className="font-mono-ui text-xs text-muted-foreground">Vault: {status.vaultPath}</p>}
          </div>
          <div className="flex max-w-md flex-wrap gap-2 lg:justify-end">
            <Badge tone={status?.workState.available ? "success" : "outline"} className="px-2.5 py-1 text-[11px] font-semibold">
              {status?.workState.available ? `Board: ${status.workState.board ?? "default"}` : "Board unavailable"}
            </Badge>
            <Badge tone="outline" className="px-2.5 py-1 text-[11px] font-semibold text-foreground">
              Dashboard = View
            </Badge>
            <Badge tone="outline" className="px-2.5 py-1 text-[11px] font-semibold text-foreground">
              Kanban = SSOT
            </Badge>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {status?.warning && (
        <div className="rounded border border-border bg-background/40 p-3 text-sm text-muted-foreground">
          {status.warning}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-2xl border border-border bg-background/40 p-2.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="font-sans text-display text-xs uppercase tracking-[0.16em] text-muted-foreground">Projects</h3>
            <Badge tone="outline" className="text-[10px]">{status?.projects.length ?? 0}</Badge>
          </div>
          <div className="space-y-1.5">
            {(status?.projects ?? []).map((project) => (
              <button
                key={project.name}
                type="button"
                onClick={() => setSelectedProject(project.name)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  selected?.name === project.name
                    ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                    : "border-border bg-card/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{project.name}</span>
                  <Badge tone={project.exists ? "success" : "outline"} className="shrink-0 text-[10px]">
                    {project.exists ? "vault" : "missing"}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate font-mono-ui text-[10px] leading-4">{project.path}</p>
              </button>
            ))}
            {status && status.projects.length === 0 && (
              <p className="rounded border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                projects 디렉터리에 표시할 프로젝트가 없습니다.
              </p>
            )}
          </div>
        </aside>

        <main className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="전체 작업" value={status?.workState.counts.total ?? 0} />
            <Metric label="진행 중" value={status?.workState.counts.running ?? 0} tone="warning" />
            <Metric label="차단" value={status?.workState.counts.blocked ?? 0} tone="destructive" />
            <Metric label="완료" value={status?.workState.counts.done ?? 0} tone="success" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <ControlCard icon={Activity} title="Overview">
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">선택 프로젝트</p>
                <p className="mt-1 truncate text-base font-semibold text-foreground">{selected?.name ?? "없음"}</p>
                <p className="mt-1 truncate font-mono-ui text-[11px] text-muted-foreground">
                  {selected?.path ?? status?.projectsRoot ?? "No project path"}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="outline" className="px-2 py-1 text-[10px] font-medium">Markdown {selected?.markdownFiles ?? 0}</Badge>
                {selected?.keyDocs.map((doc) => (
                  <Badge key={doc} tone="secondary" className="px-2 py-1 text-[10px] font-medium">{doc}</Badge>
                ))}
              </div>
            </ControlCard>
            {status?.delivery && <DeliverySyncCard delivery={status.delivery} />}
            <ControlCard icon={Boxes} title="Agents">
              <TaskList tasks={runningTasks} empty="현재 running agent/task가 없습니다." />
            </ControlCard>
            <ControlCard icon={MessageSquare} title="Comms / Blockers">
              <TaskList tasks={blockedTasks} empty="차단된 task가 없습니다." />
            </ControlCard>
            <ControlCard icon={ShieldCheck} title="Harness">
              <TaskList tasks={harnessTasks} empty="표시할 harness/run evidence가 없습니다." showVerification />
            </ControlCard>
            <ControlCard icon={PackageCheck} title="Artifacts">
              <TaskList tasks={artifactTasks} empty="연결된 PR/file/session artifact가 없습니다." showLinks />
            </ControlCard>
            <ControlCard icon={GitBranch} title="Mission tabs">
              <div className="grid gap-2 sm:grid-cols-2">
                {MISSION_TABS.map(([name, hint]) => (
                  <div key={name} className="rounded-lg border border-border bg-background/40 p-2">
                    <p className="text-xs font-medium text-foreground">{name}</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
            </ControlCard>
          </div>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "outline" }: { label: string; value: number; tone?: "outline" | "success" | "warning" | "destructive" }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <Badge tone={tone} className="px-2 py-0.5 text-[10px] font-medium">live</Badge>
        </div>
        <p className="mt-2 font-sans text-display text-3xl leading-none text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ControlCard({ icon: Icon, title, children }: { icon: typeof Activity; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DeliverySyncCard({ delivery }: { delivery: ProjectControlDeliverySync }) {
  const pr = delivery.github.pullRequest;
  const dirtyCount = delivery.dirtyFiles.length;
  return (
    <ControlCard icon={GitBranch} title="Delivery Sync">
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">다음 액션</p>
        <p className="mt-1 text-sm font-medium leading-5 text-foreground">{delivery.nextAction.label}</p>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
        <p className="truncate">
          branch: <span className="font-mono-ui text-foreground">{delivery.github.branch ?? "unknown"}</span>
        </p>
        <p className="truncate">
          repo: <span className="font-mono-ui text-foreground">{delivery.github.repo ?? "unavailable"}</span>
        </p>
        {pr ? (
          <a className="truncate text-primary underline-offset-4 hover:underline" href={pr.url ?? undefined} target="_blank" rel="noreferrer">
            PR #{pr.number}: {pr.title ?? pr.state ?? "open"}
          </a>
        ) : (
          <p>{delivery.github.warning ?? "현재 branch에 연결된 PR이 없습니다."}</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={dirtyCount ? "warning" : "success"} className="text-[10px]">dirty {dirtyCount}</Badge>
        {pr?.mergeable && <Badge tone="outline" className="text-[10px]">{pr.mergeable}</Badge>}
        {delivery.github.checks.length > 0 && <Badge tone="outline" className="text-[10px]">checks {delivery.github.checks.length}</Badge>}
      </div>
    </ControlCard>
  );
}

function TaskList({ tasks, empty, showVerification = false, showLinks = false }: { tasks: KnowledgeWorkStateTask[]; empty: string; showVerification?: boolean; showLinks?: boolean }) {
  if (tasks.length === 0) {
    return <p className="rounded border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <article key={task.id} className="rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono-ui text-[11px] text-muted-foreground">{task.id}</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">{task.title}</p>
            </div>
            <Badge tone={task.status === "blocked" ? "destructive" : task.status === "done" ? "success" : "outline"} className="text-[10px]">
              {task.status}
            </Badge>
          </div>
          {task.assignee && <p className="mt-2 text-xs text-muted-foreground">agent: {task.assignee}</p>}
          {task.blockedReason && <p className="mt-2 text-xs leading-5 text-destructive">{task.blockedReason}</p>}
          {showVerification && Boolean(task.latestRunSummary || task.verification) && (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {task.latestRunSummary ?? formatVerification(task.verification)}
            </p>
          )}
          {showLinks && <p className="mt-2 text-xs text-muted-foreground">linked artifacts: {countTaskLinks(task)}</p>}
        </article>
      ))}
    </div>
  );
}

function countTaskLinks(task: KnowledgeWorkStateTask): number {
  return Object.values(task.links).reduce((sum, value) => sum + value.length, 0);
}

function formatVerification(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${String(val)}`)
      .join(", ");
  }
  return String(value);
}
