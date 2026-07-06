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
    monkeypatch.delenv("WIKI_PATH", raising=False)
    monkeypatch.delenv("OBSIDIAN_VAULT_PATH", raising=False)
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
        kanban_db.add_comment(conn, blocked_id, "default", "PR creation needs reviewer decision.")
        with kanban_db.write_txn(conn):
            kanban_db.record_task_event(
                conn,
                blocked_id,
                "delivery_event",
                {"eventType": "verification_pass", "success": True, "canonicalCommand": "npm run typecheck --workspace web"},
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
    events = body["workState"]["events"]
    assert any(
        event["kind"] == "delivery_event" and event["payload"]["eventType"] == "verification_pass"
        for event in events
    )
    assert any(
        event["source"] == "comment" and event["body"] == "PR creation needs reviewer decision."
        for event in events
    )

    board = client.get("/api/board/status").json()
    assert db_path.stat().st_mtime_ns == before_mtime
    assert board["available"] is True
    assert board["counts"]["total"] == 2
    assert board["counts"]["blocked"] == 1
    assert board["counts"]["ready"] == 1
    assert {task["id"] for task in board["tasks"]} == {parent_id, blocked_id}
    assert board["tasks"][0]["createdAt"] is not None

    todo = client.get("/api/todo/status").json()
    assert todo == {
        "available": False,
        "items": [],
        "warning": "Current-session Todo is not persisted as durable project work state.",
    }
    assert db_path.stat().st_mtime_ns == before_mtime


def test_board_status_keeps_missing_board_read_only(client, tmp_path, monkeypatch):
    db_path = tmp_path / "missing-kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))

    body = client.get("/api/board/status").json()

    assert body["available"] is False
    assert body["counts"]["total"] == 0
    assert body["tasks"] == []
    assert not db_path.exists()


def test_project_control_status_lists_projects_without_writing_board(client, tmp_path, monkeypatch):
    db_path = tmp_path / "missing-kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))
    monkeypatch.setenv("WIKI_PATH", str(tmp_path / "vault"))
    project = tmp_path / "vault" / "projects" / "hermes-agent"
    project.mkdir(parents=True)
    (project / "README.md").write_text("# Hermes\n", encoding="utf-8")
    (project / "test-harness.md").write_text("# Harness\n", encoding="utf-8")
    (project / "notes.md").write_text("# Notes\n", encoding="utf-8")

    body = client.get("/api/project-control/status").json()

    assert body["vaultPath"] == str((tmp_path / "vault").resolve())
    assert body["projectsRootExists"] is True
    assert body["projects"] == [
        {
            "name": "hermes-agent",
            "path": str(project.resolve()),
            "exists": True,
            "markdownFiles": 3,
            "keyDocs": ["README.md", "test-harness.md"],
        }
    ]
    assert body["workState"]["available"] is False
    assert body["agentOps"]["available"] is False
    assert body["agentOps"]["projects"][0]["name"] == "hermes-agent"
    assert body["agentOps"]["projects"][0]["activeAgents"] == []
    assert body["delivery"]["nextAction"]["kind"] in {"idle", "verify_and_commit", "push_or_pr", "review_merge_decision"}
    assert body["tabs"] == ["Overview", "Board", "Agents", "Comms", "Harness", "Artifacts", "Knowledge", "Timeline"]
    assert not db_path.exists()


def test_project_control_status_groups_agent_ops_by_project(client, tmp_path, monkeypatch):
    db_path = tmp_path / "kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))
    monkeypatch.setenv("WIKI_PATH", str(tmp_path / "vault"))
    project = tmp_path / "vault" / "projects" / "hermes-agent"
    project.mkdir(parents=True)
    (project / "README.md").write_text("# Hermes\n", encoding="utf-8")

    conn = kanban_db.connect(db_path=db_path)
    try:
        running_id = kanban_db.create_task(
            conn,
            title="hermes-agent implement agent ops dashboard",
            body="Show agent comms for hermes-agent.",
            assignee="builder",
            tenant="hermes-agent",
            initial_status="running",
            priority=10,
        )
        conn.execute("UPDATE tasks SET status = ? WHERE id = ?", ("running", running_id))
        queued_id = kanban_db.create_task(
            conn,
            title="hermes-agent review queued worker",
            assignee="reviewer",
            tenant="hermes-agent",
            initial_status="running",
            priority=5,
        )
        conn.execute("UPDATE tasks SET status = ? WHERE id = ?", ("ready", queued_id))
        now = int(time.time())
        cursor = conn.execute(
            """
            INSERT INTO task_runs (task_id, profile, status, worker_pid, last_heartbeat_at, started_at, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (running_id, "builder", "running", 1234, now, now, "타이핑 로그 UI 구현 중"),
        )
        run_id = cursor.lastrowid
        conn.execute(
            "UPDATE tasks SET current_run_id = ?, worker_pid = ?, last_heartbeat_at = ? WHERE id = ?",
            (run_id, 1234, now, running_id),
        )
        kanban_db.add_comment(conn, running_id, "builder", "Research Agent → Builder: project_id는 Kanban tenant로 분류")
        with kanban_db.write_txn(conn):
            kanban_db.record_task_event(
                conn,
                running_id,
                "agent_message",
                {"eventType": "agent_message", "message": "Harness Agent requested verification"},
                run_id=run_id,
            )
        conn.commit()
    finally:
        conn.close()

    before_mtime = db_path.stat().st_mtime_ns
    body = client.get("/api/project-control/status").json()

    assert db_path.stat().st_mtime_ns == before_mtime
    hermes_ops = next(project for project in body["agentOps"]["projects"] if project["name"] == "hermes-agent")
    assert hermes_ops["activeAgents"][0]["agent"] == "builder"
    assert hermes_ops["activeAgents"][0]["taskId"] == running_id
    assert hermes_ops["activeAgents"][0]["workerPid"] == 1234
    assert hermes_ops["queuedAgents"][0]["agent"] == "reviewer"
    assert hermes_ops["queuedAgents"][0]["taskId"] == queued_id
    assert any("Research Agent" in line["text"] for line in hermes_ops["liveTranscript"])
    assert any(line["kind"] == "agent_message" and "Harness Agent" in line["text"] for line in hermes_ops["comms"])


def test_project_control_status_includes_read_only_delivery_sync(client, tmp_path, monkeypatch):
    db_path = tmp_path / "missing-kanban.db"
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))
    monkeypatch.setenv("WIKI_PATH", str(tmp_path / "vault"))
    monkeypatch.setattr(web_server, "load_config", lambda: {"terminal": {"cwd": str(repo)}})

    subprocess.run(["git", "init"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "-b", "feature/delivery-sync"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
    (repo / "tracked.py").write_text("print('ok')\n", encoding="utf-8")
    subprocess.run(["git", "add", "tracked.py"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
    (repo / "pending.py").write_text("print('dirty')\n", encoding="utf-8")

    body = client.get("/api/project-control/status").json()

    assert body["delivery"]["gitRoot"] == str(repo.resolve())
    assert body["delivery"]["github"]["branch"] == "feature/delivery-sync"
    assert body["delivery"]["dirtyFiles"] == [{"status": "??", "path": "pending.py"}]
    assert body["delivery"]["nextAction"]["kind"] == "verify_and_commit"
    assert body["delivery"]["github"]["warning"] == "No GitHub remote found for the current repository."
    assert not db_path.exists()


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
        if args[:3] == ["gh", "pr", "list"]:
            assert args[4] == "hoonkim1092-web/hermes-agent"
            assert "--state" in args and args[args.index("--state") + 1] == "merged"
            assert "--base" in args and args[args.index("--base") + 1] == "main"
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=json.dumps(
                    [
                        {
                            "number": 6,
                            "url": "https://github.com/hoonkim1092-web/hermes-agent/pull/6",
                            "title": "Refresh roadmap",
                            "headRefName": "feat/roadmap",
                            "baseRefName": "main",
                            "mergedAt": "2026-07-03T03:42:27Z",
                            "mergeCommit": {"oid": "eeb389bf26b9d75eb735d918f93e0ac753577e33"},
                            "reviewDecision": "APPROVED",
                            "statusCheckRollup": [
                                {
                                    "name": "build",
                                    "status": "COMPLETED",
                                    "conclusion": "SUCCESS",
                                    "detailsUrl": "https://checks.example/build",
                                }
                            ],
                        }
                    ]
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
    assert github["mergedPullRequests"] == [
        {
            "number": 6,
            "url": "https://github.com/hoonkim1092-web/hermes-agent/pull/6",
            "title": "Refresh roadmap",
            "headRefName": "feat/roadmap",
            "baseRefName": "main",
            "mergedAt": "2026-07-03T03:42:27Z",
            "mergeCommit": "eeb389bf26b9d75eb735d918f93e0ac753577e33",
            "reviewDecision": "APPROVED",
            "checks": [
                {"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS", "url": "https://checks.example/build"},
            ],
            "kanbanEvidence": [],
        }
    ]
    assert not (tmp_path / "missing-kanban.db").exists()


def test_knowledge_status_links_merged_delivery_to_kanban_run_evidence(client, tmp_path, monkeypatch):
    vault = tmp_path / "docs" / "wiki"
    vault.mkdir(parents=True)
    (vault / "SCHEMA.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "index.md").write_text("# Index\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    (tmp_path / "tracked.py").write_text("print('ok')\n", encoding="utf-8")
    db_path = tmp_path / "kanban.db"
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db_path))

    subprocess.run(["git", "init"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmp_path, check=True)
    subprocess.run(["git", "remote", "add", "hoon", "https://github.com/hoonkim1092-web/hermes-agent.git"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "tracked.py"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=tmp_path, check=True, stdout=subprocess.DEVNULL)

    conn = kanban_db.connect(db_path=db_path)
    try:
        task_id = kanban_db.create_task(
            conn,
            title="Ship merged delivery evidence",
            body=(
                "Delivered PR https://github.com/hoonkim1092-web/hermes-agent/pull/6 "
                "from feat/roadmap."
            ),
            priority=7,
        )
        now = int(time.time())
        conn.execute(
            "UPDATE tasks SET status = ?, completed_at = ?, result = ? WHERE id = ?",
            (
                "done",
                now,
                "Squash merged eeb389bf26b9d75eb735d918f93e0ac753577e33.",
                task_id,
            ),
        )
        conn.execute(
            """
            INSERT INTO task_runs (task_id, status, started_at, ended_at, outcome, summary, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                "done",
                now,
                now,
                "completed",
                "Verified PR #6 with npm run typecheck --workspace web",
                json.dumps({"verification": {"typecheck": "pass", "build": "pass"}}),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    original_run = web_server.subprocess.run

    def fake_run(args, *run_args, **run_kwargs):
        if args[:3] == ["gh", "pr", "view"]:
            return subprocess.CompletedProcess(args, 1, stdout="", stderr="no pull requests found")
        if args[:3] == ["gh", "pr", "list"]:
            assert args[4] == "hoonkim1092-web/hermes-agent"
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=json.dumps(
                    [
                        {
                            "number": 6,
                            "url": "https://github.com/hoonkim1092-web/hermes-agent/pull/6",
                            "title": "Refresh roadmap",
                            "headRefName": "feat/roadmap",
                            "baseRefName": "main",
                            "mergedAt": "2026-07-03T03:42:27Z",
                            "mergeCommit": {"oid": "eeb389bf26b9d75eb735d918f93e0ac753577e33"},
                            "reviewDecision": "APPROVED",
                            "statusCheckRollup": [
                                {
                                    "name": "build",
                                    "status": "COMPLETED",
                                    "conclusion": "SUCCESS",
                                    "detailsUrl": "https://checks.example/build",
                                }
                            ],
                        }
                    ]
                ),
                stderr="",
            )
        return original_run(args, *run_args, **run_kwargs)

    monkeypatch.setattr(web_server.shutil, "which", lambda name: "gh" if name == "gh" else shutil.which(name))
    monkeypatch.setattr(web_server.subprocess, "run", fake_run)

    before_mtime = db_path.stat().st_mtime_ns
    body = client.get("/api/knowledge/status", params={"path": str(vault)}).json()

    assert db_path.stat().st_mtime_ns == before_mtime
    merged_pr = body["gitNexus"]["github"]["mergedPullRequests"][0]
    assert merged_pr["kanbanEvidence"] == [
        {
            "taskId": task_id,
            "title": "Ship merged delivery evidence",
            "status": "done",
            "latestRunSummary": "Verified PR #6 with npm run typecheck --workspace web",
            "verification": {"typecheck": "pass", "build": "pass"},
        }
    ]


def test_knowledge_session_promotion_proposal_is_read_only(client, tmp_path, monkeypatch):
    from hermes_state import SessionDB

    db_path = tmp_path / "state.db"
    session_db = SessionDB(db_path=db_path)
    try:
        session_db.create_session("20260703_120000_promote", "cli")
        session_db.set_session_title("20260703_120000_promote", "Promote session notes")
        session_db.append_message(
            "20260703_120000_promote",
            "user",
            "Decision: session to wiki promotion must stay proposal-only before apply. "
            "Touch hermes_cli/web_server.py and web/src/pages/KnowledgePage.tsx. "
            "See PR https://github.com/hoonkim1092-web/hermes-agent/pull/12.",
        )
        session_db.append_message(
            "20260703_120000_promote",
            "assistant",
            "Risk: writing docs/wiki automatically could conflict with existing notes. "
            "Candidate wiki target should cover Knowledge Hub / Git Nexus session promotion.",
        )
    finally:
        session_db.close()

    def open_test_db(profile=None):
        return SessionDB(db_path=db_path)

    monkeypatch.setattr(web_server, "_open_session_db_for_profile", open_test_db)
    target = tmp_path / "docs" / "wiki" / "knowledge" / "decisions" / "session-promotion.md"

    body = client.get(
        "/api/knowledge/session-promotion-proposal",
        params={"session_id": "20260703_120000_promote"},
    ).json()

    assert body["available"] is True
    assert body["sessionId"] == "20260703_120000_promote"
    assert body["preview"]["mode"] == "proposal-only"
    assert body["preview"]["applyRequired"] is True
    assert body["preview"]["applyEndpoint"] is None
    assert "hermes_cli/web_server.py" in body["affectedFiles"]
    assert "web/src/pages/KnowledgePage.tsx" in body["affectedFiles"]
    assert body["affectedPullRequests"] == ["https://github.com/hoonkim1092-web/hermes-agent/pull/12"]
    assert any("proposal-only" in decision for decision in body["durableDecisions"])
    assert any(note["path"] == "knowledge/decisions/session-promotion.md" for note in body["candidateNotes"])
    assert any("automatically" in risk for risk in body["risks"])
    assert not target.exists()


def test_knowledge_status_requires_auth(tmp_path):
    unauth = TestClient(web_server.app)

    assert unauth.get("/api/knowledge/status", params={"path": str(tmp_path)}).status_code == 401
