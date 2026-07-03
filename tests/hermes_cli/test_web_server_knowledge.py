from pathlib import Path
import json
import shutil
import subprocess
import time

import pytest

from hermes_cli import web_server
from hermes_cli import kanban_db

pytest.importorskip("starlette.testclient")
from starlette.testclient import TestClient


@pytest.fixture
def client():
    previous = getattr(web_server.app.state, "auth_required", None)
    web_server.app.state.auth_required = False
    test_client = TestClient(web_server.app)
    test_client.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN
    try:
        yield test_client
    finally:
        if previous is None:
            try:
                delattr(web_server.app.state, "auth_required")
            except AttributeError:
                pass
        else:
            web_server.app.state.auth_required = previous


def test_knowledge_status_reports_read_only_vault_health(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_DB", str(tmp_path / "missing-kanban.db"))
    vault = tmp_path / "docs" / "wiki"
    initial_sha = "deadbeef"
    if shutil.which("git"):
        subprocess.run(["git", "init"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
        subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmp_path, check=True)
        (tmp_path / "run_agent.py").write_text("print('hello')\n", encoding="utf-8")
        subprocess.run(["git", "add", "run_agent.py"], cwd=tmp_path, check=True)
        subprocess.run(["git", "commit", "-m", "initial"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)
        initial_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=tmp_path, text=True).strip()
    (vault / "inbox" / "sources").mkdir(parents=True)
    (vault / "raw" / "sessions").mkdir(parents=True)
    (vault / "knowledge" / "concepts").mkdir(parents=True)
    (vault / "SCHEMA.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "index.md").write_text("[[knowledge/concepts/agent-runtime]]\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    (vault / "inbox" / "sources" / "todo.md").write_text("inbox", encoding="utf-8")
    (vault / "raw" / "sessions" / "s1.md").write_text("raw", encoding="utf-8")
    (vault / "knowledge" / "concepts" / "agent-runtime.md").write_text(
        "---\n"
        "sources:\n"
        "  - raw/sessions/s1.md\n"
        "code_refs:\n"
        "  - run_agent.py:1\n"
        "  - missing.py:42\n"
        "created_commit:\n"
        "  - abc123\n"
        f"  - {initial_sha}\n"
        "---\n"
        "# Agent Runtime\n"
        "See [[missing-note]].\n",
        encoding="utf-8",
    )

    body = client.get("/api/knowledge/status", params={"path": str(vault)}).json()

    assert body["vaultPath"] == str(vault.resolve())
    assert body["exists"] is True
    assert body["health"] == {"schema": True, "index": True, "log": True}
    assert body["counts"]["markdownFiles"] == 6
    assert body["counts"]["inboxItems"] == 1
    assert body["counts"]["rawFiles"] == 1
    assert body["counts"]["notesWithSources"] == 1
    assert body["counts"]["notesWithCodeRefs"] == 1
    assert body["counts"]["notesWithCommitRefs"] == 1
    assert body["counts"]["brokenLinks"] == 1
    assert body["sampleBrokenLinks"] == ["missing-note"]
    assert body["gitNexus"]["codeRefCount"] == 2
    assert body["gitNexus"]["commitRefCount"] == 2
    assert body["gitNexus"]["fileToNotes"] == [
        {"file": "missing.py", "notes": ["knowledge/concepts/agent-runtime.md"]},
        {"file": "run_agent.py", "notes": ["knowledge/concepts/agent-runtime.md"]},
    ]
    assert body["gitNexus"]["missingCodeRefs"] == [
        {"file": "missing.py", "notes": ["knowledge/concepts/agent-runtime.md"]}
    ]
    assert body["gitNexus"]["missingCommitRefs"] == [
        {"commit": "abc123", "notes": ["knowledge/concepts/agent-runtime.md"]}
    ]
    if shutil.which("git"):
        assert body["gitNexus"]["isGitRepo"] is True
        assert body["gitNexus"]["gitRoot"] == str(tmp_path.resolve())
        assert body["gitNexus"]["recentCommits"][0]["subject"] == "initial"
    assert body["workState"]["available"] is False
    assert body["workState"]["counts"]["total"] == 0
    assert not (tmp_path / "missing-kanban.db").exists()


def test_knowledge_status_defaults_to_project_docs_wiki(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_DB", str(tmp_path / "missing-kanban.db"))
    vault = tmp_path / "repo" / "docs" / "wiki"
    vault.mkdir(parents=True)
    (vault / "SCHEMA.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "index.md").write_text("# Index\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    monkeypatch.setattr(web_server, "load_config", lambda: {"terminal": {"cwd": str(tmp_path / "repo")}})

    body = client.get("/api/knowledge/status").json()

    assert body["requestedPath"] is None
    assert Path(body["vaultPath"]) == vault.resolve()
    assert body["exists"] is True


def test_knowledge_status_includes_read_only_kanban_work_state(client, tmp_path, monkeypatch):
    vault = tmp_path / "docs" / "wiki"
    vault.mkdir(parents=True)
    (vault / "SCHEMA.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "index.md").write_text("# Index\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    db_path = tmp_path / "kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))

    conn = kanban_db.connect(db_path=db_path)
    try:
        parent_id = kanban_db.create_task(
            conn,
            title="Prepare work-state links",
            body="Touch web/src/pages/KnowledgePage.tsx and [[Work State]].",
            assignee="default",
            priority=3,
        )
        blocked_id = kanban_db.create_task(
            conn,
            title="Blocked dashboard decision",
            body=(
                "Needs owner for 28500dd, PR https://github.com/hoonkim1092-web/hermes-agent/pull/42, "
                "branch feat/knowledge-work-state-panel, and session 20260702_231827_17187a."
            ),
            assignee="reviewer",
            initial_status="blocked",
            priority=5,
            parents=[parent_id],
        )
        now = int(time.time())
        conn.execute(
            "UPDATE tasks SET last_failure_error = ?, block_kind = ? WHERE id = ?",
            ("needs UX approval", "needs_input", blocked_id),
        )
        conn.execute(
            """
            INSERT INTO task_runs (task_id, status, started_at, ended_at, outcome, summary, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                blocked_id,
                "blocked",
                now,
                now,
                "blocked",
                "Checked docs/wiki/code-note.md",
                json.dumps({"verification": {"typecheck": "pass"}}),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    before_mtime = db_path.stat().st_mtime_ns
    body = client.get("/api/knowledge/status", params={"path": str(vault)}).json()

    assert db_path.stat().st_mtime_ns == before_mtime
    assert body["workState"]["available"] is True
    assert body["workState"]["counts"]["total"] == 2
    assert body["workState"]["counts"]["blocked"] == 1
    assert body["workState"]["tasks"][0]["id"] == blocked_id
    assert body["workState"]["tasks"][0]["blockedReason"] == "needs UX approval"
    assert body["workState"]["tasks"][0]["parents"] == [parent_id]
    assert body["workState"]["tasks"][0]["links"]["branches"] == ["feat/knowledge-work-state-panel"]
    assert body["workState"]["tasks"][0]["links"]["commits"] == ["28500dd"]
    assert body["workState"]["tasks"][0]["links"]["prs"] == ["https://github.com/hoonkim1092-web/hermes-agent/pull/42"]
    assert body["workState"]["tasks"][0]["links"]["sessions"] == ["20260702_231827_17187a"]
    assert body["workState"]["tasks"][0]["latestRunSummary"] == "Checked docs/wiki/code-note.md"
    assert body["workState"]["tasks"][0]["verification"] == {"typecheck": "pass"}
    assert body["workState"]["tasks"][0]["links"]["files"] == ["docs/wiki/code-note.md"]
    assert body["workState"]["tasks"][1]["links"]["files"] == ["web/src/pages/KnowledgePage.tsx"]
    assert body["workState"]["currentFocus"] == {
        "available": False,
        "items": [],
        "warning": "Current-session Todo is not persisted as durable project work state.",
    }


def test_knowledge_status_includes_read_only_github_pr_status(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_DB", str(tmp_path / "missing-kanban.db"))
    vault = tmp_path / "docs" / "wiki"
    vault.mkdir(parents=True)
    (vault / "SCHEMA.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "index.md").write_text("# Index\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    (tmp_path / "tracked.py").write_text("print('ok')\n", encoding="utf-8")

    subprocess.run(["git", "init"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmp_path, check=True)
    subprocess.run(["git", "remote", "add", "hoon", "https://github.com/hoonkim1092-web/hermes-agent.git"], cwd=tmp_path, check=True)
    subprocess.run(["git", "checkout", "-b", "feat/test-pr"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "add", "tracked.py"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)

    original_run = web_server.subprocess.run

    def fake_run(args, *run_args, **run_kwargs):
        if args[:3] == ["gh", "pr", "view"]:
            assert args[3] == "feat/test-pr"
            assert args[5] == "hoonkim1092-web/hermes-agent"
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=json.dumps(
                    {
                        "number": 7,
                        "url": "https://github.com/hoonkim1092-web/hermes-agent/pull/7",
                        "state": "OPEN",
                        "title": "Add PR status",
                        "headRefName": "feat/test-pr",
                        "baseRefName": "main",
                        "isDraft": False,
                        "mergeable": "MERGEABLE",
                        "reviewDecision": "REVIEW_REQUIRED",
                        "statusCheckRollup": [
                            {"name": "typecheck", "status": "COMPLETED", "conclusion": "SUCCESS", "detailsUrl": "https://checks.example/typecheck"},
                            {"name": "tests", "status": "IN_PROGRESS", "conclusion": None},
                        ],
                    }
                ),
                stderr="",
            )
        return original_run(args, *run_args, **run_kwargs)

    monkeypatch.setattr(web_server.shutil, "which", lambda name: "gh" if name == "gh" else shutil.which(name))
    monkeypatch.setattr(web_server.subprocess, "run", fake_run)

    body = client.get("/api/knowledge/status", params={"path": str(vault)}).json()

    github = body["gitNexus"]["github"]
    assert github["available"] is True
    assert github["repo"] == "hoonkim1092-web/hermes-agent"
    assert github["branch"] == "feat/test-pr"
    assert github["pullRequest"]["number"] == 7
    assert github["pullRequest"]["mergeable"] == "MERGEABLE"
    assert github["checks"] == [
        {"name": "typecheck", "status": "COMPLETED", "conclusion": "SUCCESS", "url": "https://checks.example/typecheck"},
        {"name": "tests", "status": "IN_PROGRESS", "conclusion": None, "url": None},
    ]
    assert not (tmp_path / "missing-kanban.db").exists()


def test_knowledge_status_requires_auth(tmp_path):
    unauth = TestClient(web_server.app)

    assert unauth.get("/api/knowledge/status", params={"path": str(tmp_path)}).status_code == 401
