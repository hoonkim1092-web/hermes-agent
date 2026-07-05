import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, GitBranch, LayoutDashboard, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { usePageHeader } from "@/contexts/usePageHeader";
import { api, type KnowledgeWorkState, type KnowledgeWorkStateTask } from "@/lib/api";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "todo", label: "대기", hint: "아직 시작 전" },
  { key: "ready", label: "준비됨", hint: "바로 시작 가능" },
  { key: "running", label: "진행 중", hint: "작업 중" },
  { key: "review", label: "리뷰", hint: "검토/병합 필요" },
  { key: "blocked", label: "차단됨", hint: "결정 필요" },
  { key: "done", label: "완료", hint: "최근 완료됨" },
] as const;

const STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  todo: "outline",
  ready: "secondary",
  running: "warning",
  review: "secondary",
  blocked: "destructive",
  done: "success",
};

export default function BoardPage() {
  const { setAfterTitle, setEnd } = usePageHeader();
  const [board, setBoard] = useState<KnowledgeWorkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getBoardStatus()
      .then(setBoard)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    setAfterTitle(
      <Badge tone="outline" className="text-xs">
        읽기 전용 보드
      </Badge>,
    );
    setEnd(
      <Button type="button" outlined size="sm" onClick={load} disabled={loading}>
        {loading ? <Spinner className="mr-2 h-3 w-3" /> : <RefreshCw className="mr-2 h-3 w-3" />}
        보드 새로고침
      </Button>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [load, loading, setAfterTitle, setEnd]);

  const grouped = useMemo(() => {
    const next: Record<string, KnowledgeWorkStateTask[]> = Object.fromEntries(
      COLUMNS.map((column) => [column.key, []]),
    );
    for (const task of board?.tasks ?? []) {
      const bucket = task.status in next ? task.status : "todo";
      next[bucket].push(task);
    }
    return next;
  }, [board]);

  if (loading && !board) {
    return <Spinner className="text-2xl text-primary" />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-sans text-display text-base tracking-[0.04em]">보드</h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              기존 Hermes Kanban을 Apple 스타일의 간결한 보드로 읽어옵니다. 이 화면은 작업을 생성,
              이동, 수정하지 않습니다. 변경이 필요하면 <span className="font-mono-ui">hermes kanban</span>을 사용하거나 Hermes에게 요청하세요.
            </p>
            {board?.dbPath && <p className="font-mono-ui text-xs text-muted-foreground">{board.dbPath}</p>}
          </div>
          <Badge tone={board?.available ? "success" : "outline"} className="shrink-0 text-xs">
            {board?.available ? `보드: ${board.board ?? "default"}` : "사용 불가"}
          </Badge>
        </div>
      </section>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {board?.warning && (
        <div className="rounded border border-border bg-background/40 p-3 text-sm text-muted-foreground">
          {board.warning}
        </div>
      )}

      {board && <BoardMetrics board={board} />}

      <div className="grid gap-3 xl:grid-cols-6 lg:grid-cols-3 md:grid-cols-2">
        {COLUMNS.map((column) => (
          <section key={column.key} className="min-h-[18rem] rounded-lg border border-border bg-background/40 p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-sans text-display text-xs uppercase tracking-[0.14em] text-foreground">
                  {column.label}
                </h3>
                <p className="text-[11px] text-muted-foreground">{column.hint}</p>
              </div>
              <Badge tone="outline" className="text-[10px]">
                {grouped[column.key]?.length ?? 0}
              </Badge>
            </div>
            <div className="space-y-3">
              {(grouped[column.key] ?? []).map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
              {(!grouped[column.key] || grouped[column.key].length === 0) && (
                <p className="rounded border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                  {column.label} 항목이 없습니다.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardMetrics({ board }: { board: KnowledgeWorkState }) {
  const metrics = [
    ["전체", board.counts.total],
    ["대기", board.counts.todo ?? 0],
    ["준비", board.counts.ready],
    ["진행", board.counts.running],
    ["리뷰", board.counts.review],
    ["차단", board.counts.blocked],
    ["완료", board.counts.done ?? 0],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {metrics.map(([label, value]) => (
        <Card key={String(label)}>
          <CardContent className="py-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-1 font-sans text-display text-2xl text-foreground">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TaskCard({ task }: { task: KnowledgeWorkStateTask }) {
  const linkCount = Object.values(task.links).reduce((sum, value) => sum + value.length, 0);
  const verification = formatVerification(task.verification);
  return (
    <article className={cn("rounded-lg border border-border bg-card p-3 shadow-sm", task.status === "blocked" && "border-destructive/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono-ui text-[11px] text-muted-foreground">{task.id}</p>
        <Badge tone={STATUS_TONE[task.status] ?? "outline"} className="text-[10px]">
          {task.status}
        </Badge>
      </div>
      <h4 className="mt-2 text-sm font-medium leading-5 text-foreground">{task.title}</h4>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {task.priority ? <Badge tone="outline" className="text-[10px]">P{task.priority}</Badge> : null}
        {task.assignee ? <Badge tone="secondary" className="text-[10px]">{task.assignee}</Badge> : null}
        {task.branchName ? <Badge tone="outline" className="max-w-full truncate text-[10px]">{task.branchName}</Badge> : null}
      </div>
      {task.blockedReason && (
        <p className="mt-3 flex gap-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {task.blockedReason}
        </p>
      )}
      {task.latestRunSummary && (
        <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{task.latestRunSummary}</p>
      )}
      <div className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">
        {task.links.prs[0] && <Fact icon={GitBranch} text={`PR ${task.links.prs[0]}`} />}
        {verification && <Fact icon={ShieldCheck} text={verification} />}
        {task.completedAt && <Fact icon={CheckCircle2} text={`완료 ${formatUnix(task.completedAt)}`} />}
        {!task.completedAt && task.startedAt && <Fact icon={Clock} text={`시작 ${formatUnix(task.startedAt)}`} />}
        {linkCount > 0 && <span>연결된 참조 {linkCount}개</span>}
      </div>
    </article>
  );
}

function Fact({ icon: Icon, text }: { icon: typeof GitBranch; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function formatUnix(value?: number | null): string {
  if (!value) return "";
  return new Date(value * 1000).toLocaleDateString();
}

function formatVerification(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${String(val)}`)
      .join(", ");
  }
  return String(value);
}
