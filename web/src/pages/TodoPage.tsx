import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock, ListTodo, RefreshCw } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { usePageHeader } from "@/contexts/usePageHeader";
import { api, type KnowledgeCurrentFocus, type KnowledgeCurrentFocusItem } from "@/lib/api";

const STATUS_ICON = {
  in_progress: Clock,
  pending: Circle,
  completed: CheckCircle2,
  cancelled: Circle,
} as const;

export default function TodoPage() {
  const { setAfterTitle, setEnd } = usePageHeader();
  const [todo, setTodo] = useState<KnowledgeCurrentFocus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getTodoStatus()
      .then(setTodo)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    setAfterTitle(
      <Badge tone="outline" className="text-xs">
        현재 세션
      </Badge>,
    );
    setEnd(
      <Button type="button" outlined size="sm" onClick={load} disabled={loading}>
        {loading ? <Spinner className="mr-2 h-3 w-3" /> : <RefreshCw className="mr-2 h-3 w-3" />}
        Todo 새로고침
      </Button>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [load, loading, setAfterTitle, setEnd]);

  const grouped = useMemo(() => {
    const items = todo?.items ?? [];
    return {
      in_progress: items.filter((item) => item.status === "in_progress"),
      pending: items.filter((item) => item.status === "pending"),
      completed: items.filter((item) => item.status === "completed"),
      cancelled: items.filter((item) => item.status === "cancelled"),
    };
  }, [todo]);

  if (loading && !todo) {
    return <Spinner className="text-2xl text-primary" />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-sans text-display text-base tracking-[0.04em]">할 일</h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Todo는 현재 세션에서만 쓰는 체크리스트입니다. 오래 남겨야 하는 프로젝트 작업은 의도적으로
              이곳이 아니라 보드/Kanban에 기록합니다. <span className="font-mono-ui">/clear</span>, 재시작, 내일 이후에도
              남아야 하는 일은 보드로 옮기세요.
            </p>
          </div>
          <Badge tone={todo?.available ? "success" : "outline"} className="shrink-0 text-xs">
            {todo?.available ? "실시간 세션 포커스" : "사용 불가"}
          </Badge>
        </div>
      </section>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {todo?.warning && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-sm leading-6 text-muted-foreground">{todo.warning}</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Hermes에게 <span className="font-mono-ui">현재 todo 보여줘</span>라고 요청하세요. 오래 남길 작업은:
              <span className="font-mono-ui"> 이 작업 Kanban에 남겨줘</span>.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TodoColumn title="진행 중" emptyLabel="진행 중인" items={grouped.in_progress} />
        <TodoColumn title="대기" emptyLabel="대기 중인" items={grouped.pending} />
        <TodoColumn title="완료" emptyLabel="완료된" items={grouped.completed} />
        <TodoColumn title="취소" emptyLabel="취소된" items={grouped.cancelled} />
      </div>
    </div>
  );
}

function TodoColumn({ title, emptyLabel, items }: { title: string; emptyLabel: string; items: KnowledgeCurrentFocusItem[] }) {
  return (
    <section className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-sans text-display text-xs uppercase tracking-[0.14em] text-foreground">{title}</h3>
        <Badge tone="outline" className="text-[10px]">{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.map((item) => <TodoItem key={item.id} item={item} />)}
        {items.length === 0 && (
          <p className="rounded border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
            대시보드에 표시할 {emptyLabel} Todo 항목이 없습니다.
          </p>
        )}
      </div>
    </section>
  );
}

function TodoItem({ item }: { item: KnowledgeCurrentFocusItem }) {
  const Icon = STATUS_ICON[item.status as keyof typeof STATUS_ICON] ?? Circle;
  return (
    <article className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <p className="font-mono-ui text-[11px] text-muted-foreground">{item.id}</p>
          <p className="leading-5 text-foreground">{item.content}</p>
        </div>
      </div>
    </article>
  );
}
