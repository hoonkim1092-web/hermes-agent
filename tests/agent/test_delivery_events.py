import json
import time

from agent.delivery_events import record_terminal_delivery_event
from hermes_cli import kanban_db


def test_terminal_delivery_event_records_to_active_kanban_run(tmp_path, monkeypatch):
    db_path = tmp_path / "kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))

    conn = kanban_db.connect(db_path=db_path)
    try:
        task_id = kanban_db.create_task(conn, title="Ship delivery events", body="", priority=1)
        now = int(time.time())
        run_id = conn.execute(
            """
            INSERT INTO task_runs (task_id, profile, status, started_at)
            VALUES (?, ?, ?, ?)
            """,
            (task_id, "default", "running", now),
        ).lastrowid
        conn.execute("UPDATE tasks SET current_run_id = ? WHERE id = ?", (run_id, task_id))
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setenv("HERMES_KANBAN_TASK", task_id)
    recorded = record_terminal_delivery_event(
        command="python -m pytest tests/example.py -q",
        cwd=tmp_path,
        exit_code=0,
        output="1 passed",
        verification_evidence={
            "status": "passed",
            "kind": "test",
            "scope": "targeted",
            "canonical_command": "pytest",
        },
    )

    assert recorded is not None
    assert recorded["eventType"] == "verification_pass"
    conn = kanban_db.connect(db_path=db_path)
    try:
        event = conn.execute(
            "SELECT * FROM task_events WHERE task_id = ? AND kind = 'delivery_event'",
            (task_id,),
        ).fetchone()
        assert event["kind"] == "delivery_event"
        assert event["run_id"] == run_id
        payload = json.loads(event["payload"])
        assert payload["eventType"] == "verification_pass"
        assert payload["canonicalCommand"] == "pytest"
        run = conn.execute("SELECT metadata FROM task_runs WHERE id = ?", (run_id,)).fetchone()
        metadata = json.loads(run["metadata"])
        assert metadata["verification"] == {"test": "pass"}
        assert metadata["deliveryEvents"][0]["eventType"] == "verification_pass"
    finally:
        conn.close()


def test_terminal_delivery_event_records_pr_create_url(tmp_path, monkeypatch):
    db_path = tmp_path / "kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))
    conn = kanban_db.connect(db_path=db_path)
    try:
        task_id = kanban_db.create_task(conn, title="Open PR", body="", priority=1)
    finally:
        conn.close()

    monkeypatch.setenv("HERMES_KANBAN_TASK", task_id)
    recorded = record_terminal_delivery_event(
        command="gh pr create --repo hoonkim1092-web/hermes-agent",
        cwd=tmp_path,
        exit_code=0,
        output="https://github.com/hoonkim1092-web/hermes-agent/pull/17\n",
    )

    assert recorded is not None
    assert recorded["eventType"] == "pr_created"
    assert recorded["url"] == "https://github.com/hoonkim1092-web/hermes-agent/pull/17"
