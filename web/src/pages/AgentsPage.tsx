import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ListChecks, MessageSquareText, RefreshCw, Users, UserRoundCheck } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { usePageHeader } from "@/contexts/usePageHeader";
import {
  api,
  type KnowledgeWorkStateTask,
  type ProjectControlAgentItem,
  type ProjectControlAgentOps,
  type ProjectControlAgentProjectOps,
  type ProjectControlStatus,
  type ProjectControlTranscriptLine,
} from "@/lib/api";

const QUEUED_TASK_STATUSES = new Set(["triage", "todo", "scheduled", "ready", "review"]);

export default function AgentsPage() {
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
        setSelectedProject((current) => current ?? next.agentOps.projects[0]?.name ?? next.projects[0]?.name ?? null);
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
        Agent Ops
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

  const selectedOps = useMemo(
    () => status?.agentOps.projects.find((project) => project.name === selectedProject) ?? status?.agentOps.projects[0] ?? null,
    [selectedProject, status?.agentOps.projects],
  );
  const metrics = useMemo(() => agentMetrics(status?.agentOps, status?.workState.tasks ?? []), [status?.agentOps, status?.workState.tasks]);
  const ownershipTasks = useMemo(
    () => selectedOwnershipTasks(status?.workState.tasks ?? [], selectedOps),
    [selectedOps, status?.workState.tasks],
  );

  if (loading && !status) {
    return <Spinner className="text-2xl text-primary" />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-sans text-display text-lg tracking-[0.04em]">Agents</h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              에이전트 실행과 대기열, live transcript, ownership task만 모아 보는 전용 화면입니다. 전체 보드와 하네스,
              산출물, 지식 카드는 Mission Control에서 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge tone={status?.agentOps.available ? "success" : "outline"} className="px-2.5 py-1 text-[11px] font-semibold">
              {status?.agentOps.available ? "Agent ops live" : "Agent ops unavailable"}
            </Badge>
            {status?.workState.board && (
              <Badge tone="outline" className="px-2.5 py-1 text-[11px] font-semibold text-foreground">
                Board: {status.workState.board}
              </Badge>
            )}
          </div>
        </div>
      </section>

      {error && <Notice tone="destructive">{error}</Notice>}
      {status?.agentOps.warning && <Notice>{status.agentOps.warning}</Notice>}
      {status?.warning && <Notice>{status.warning}</Notice>}

      <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <ProjectAside
          projects={status?.agentOps.projects ?? []}
          selectedProject={selectedOps?.name ?? selectedProject}
          onSelect={setSelectedProject}
        />

        <main className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Active agents" value={metrics.activeAgents} tone={metrics.activeAgents ? "warning" : "outline"} />
            <Metric label="Queued agents" value={metrics.queuedAgents} tone={metrics.queuedAgents ? "secondary" : "outline"} />
            <Metric label="Running tasks" value={metrics.runningTasks} tone={metrics.runningTasks ? "warning" : "outline"} />
            <Metric label="Blocked tasks" value={metrics.blockedTasks} tone={metrics.blockedTasks ? "destructive" : "outline"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <AgentCard icon={UserRoundCheck} title="Active Agents" count={selectedOps?.activeAgents.length ?? 0}>
              <AgentList agents={selectedOps?.activeAgents ?? []} empty="현재 실행 중인 에이전트가 없습니다." />
            </AgentCard>
            <AgentCard icon={Users} title="Queued Agents" count={selectedOps?.queuedAgents.length ?? 0}>
              <AgentList agents={selectedOps?.queuedAgents ?? []} empty="대기 중인 에이전트가 없습니다." />
            </AgentCard>
            <AgentCard icon={MessageSquareText} title="Live Transcript" count={selectedOps?.liveTranscript.length ?? 0}>
              <LiveTranscript lines={selectedOps?.liveTranscript ?? []} />
            </AgentCard>
            <AgentCard icon={ListChecks} title="Ownership Tasks" count={ownershipTasks.length}>
              <OwnershipTaskList tasks={ownershipTasks} />
            </AgentCard>
          </div>
        </main>
      </div>
    </div>
  );
}

function ProjectAside({
  projects,
  selectedProject,
  onSelect,
}: {
  projects: ProjectControlAgentProjectOps[];
  selectedProject: string | null | undefined;
  onSelect: (project: string) => void;
}) {
  return (
    <aside className="space-y-2 rounded-2xl border border-border bg-background/40 p-2.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="font-sans text-display text-xs uppercase tracking-[0.16em] text-muted-foreground">Projects</h3>
        <Badge tone="outline" className="text-[10px]">{projects.length}</Badge>
      </div>
      <div className="space-y-1.5">
        {projects.map((project) => {
          const active = project.activeAgents.length;
          const queued = project.queuedAgents.length;
          return (
            <button
              key={project.name}
              type="button"
              onClick={() => onSelect(project.name)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                selectedProject === project.name
                  ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                  : "border-border bg-card/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{project.name}</span>
                <Badge tone={active ? "warning" : queued ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                  {active ? `active ${active}` : queued ? `queued ${queued}` : "idle"}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                transcript {project.liveTranscript.length} · tasks {active + queued}
              </p>
            </button>
          );
        })}
        {projects.length === 0 && (
          <p className="rounded border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
            표시할 프로젝트가 없습니다.
          </p>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value, tone = "outline" }: { label: string; value: number; tone?: "outline" | "success" | "warning" | "destructive" | "secondary" }) {
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

function AgentCard({ icon: Icon, title, count, children }: { icon: typeof Users; title: string; count: number; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </span>
          <Badge tone={count ? "secondary" : "outline"} className="text-[10px]">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AgentList({ agents, empty }: { agents: ProjectControlAgentItem[]; empty: string }) {
  if (agents.length === 0) {
    return <EmptyState>{empty}</EmptyState>;
  }
  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <article key={`${agent.taskId}-${agent.agent}-${agent.status}`} className="rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{agent.agent ?? "unassigned"}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{agent.taskTitle ?? "작업 제목 없음"}</p>
            </div>
            <Badge tone={agent.status === "running" ? "warning" : "outline"} className="text-[10px]">
              {agent.status ?? "queued"}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            {agent.taskId && <Badge tone="outline" className="text-[10px]">{agent.taskId}</Badge>}
            {agent.workerPid && <Badge tone="outline" className="text-[10px]">pid {agent.workerPid}</Badge>}
            {agent.currentRunId && <Badge tone="outline" className="text-[10px]">run {agent.currentRunId}</Badge>}
          </div>
          {agent.summary && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{agent.summary}</p>}
        </article>
      ))}
    </div>
  );
}

function LiveTranscript({ lines }: { lines: ProjectControlTranscriptLine[] }) {
  if (lines.length === 0) {
    return <EmptyState>아직 표시할 live transcript가 없습니다.</EmptyState>;
  }
  return (
    <div className="space-y-2">
      {lines.slice(0, 8).map((line) => (
        <article key={`${line.source}-${line.id}-${line.taskId}`} className="rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{line.speaker ?? "system"}</p>
              <p className="mt-0.5 truncate font-mono-ui text-[10px] text-muted-foreground">{line.taskId ?? "no-task"}</p>
            </div>
            <Badge tone={line.source === "comment" ? "secondary" : "outline"} className="text-[10px]">
              {line.kind ?? line.source ?? "event"}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{line.text}</p>
        </article>
      ))}
    </div>
  );
}

function OwnershipTaskList({ tasks }: { tasks: KnowledgeWorkStateTask[] }) {
  if (tasks.length === 0) {
    return <EmptyState>현재 이 프로젝트에 배정된 ownership task가 없습니다.</EmptyState>;
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
            <Badge tone={task.status === "blocked" ? "destructive" : task.status === "running" ? "warning" : "outline"} className="text-[10px]">
              {task.status}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            {task.assignee && <Badge tone="outline" className="text-[10px]">agent {task.assignee}</Badge>}
            {task.currentRunId && <Badge tone="outline" className="text-[10px]">run {task.currentRunId}</Badge>}
            {task.workerPid && <Badge tone="outline" className="text-[10px]">pid {task.workerPid}</Badge>}
          </div>
          {task.blockedReason && <p className="mt-2 text-xs leading-5 text-destructive">{task.blockedReason}</p>}
          {task.latestRunSummary && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.latestRunSummary}</p>}
        </article>
      ))}
    </div>
  );
}

function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "destructive" }) {
  return (
    <div className={`rounded border p-3 text-sm ${tone === "destructive" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-background/40 text-muted-foreground"}`}>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">{children}</p>;
}

function agentMetrics(agentOps: ProjectControlAgentOps | null | undefined, tasks: KnowledgeWorkStateTask[]) {
  const projects = agentOps?.projects ?? [];
  return {
    activeAgents: projects.reduce((sum, project) => sum + project.activeAgents.length, 0),
    queuedAgents: projects.reduce((sum, project) => sum + project.queuedAgents.length, 0),
    runningTasks: tasks.filter((task) => task.status === "running").length,
    blockedTasks: tasks.filter((task) => task.status === "blocked").length,
  };
}

function selectedOwnershipTasks(tasks: KnowledgeWorkStateTask[], selectedOps: ProjectControlAgentProjectOps | null): KnowledgeWorkStateTask[] {
  if (!selectedOps) return [];
  const selectedIds = new Set(
    [...selectedOps.activeAgents, ...selectedOps.queuedAgents]
      .map((agent) => agent.taskId)
      .filter((taskId): taskId is string => Boolean(taskId)),
  );
  return tasks
    .filter((task) => selectedIds.has(task.id) || (Boolean(task.assignee) && (task.status === "running" || QUEUED_TASK_STATUSES.has(task.status))))
    .slice(0, 8);
}
