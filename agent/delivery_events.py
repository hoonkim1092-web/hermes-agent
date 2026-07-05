"""Best-effort delivery event recording for Kanban-backed Hermes work.

This module is intentionally passive. It observes terminal command results and,
when the current process is running a Kanban task, records delivery provenance
(commit/push/PR/verification) into the durable Kanban board. The dashboard can
then read task_runs/task_events instead of inferring progress from chat text.
"""

from __future__ import annotations

import json
import os
import re
import shlex
from pathlib import Path
from typing import Any, Optional


_URL_RE = re.compile(r"https://github\.com/[^\s]+/pull/\d+")
_SHA_RE = re.compile(r"\b[0-9a-f]{7,40}\b", re.IGNORECASE)
_SHELL_SPLIT_RE = re.compile(r"\s*(?:&&|\|\||;)\s*")
_MAX_COMMAND_CHARS = 500
_MAX_OUTPUT_CHARS = 1200


def _segments(command: str) -> list[list[str]]:
    out: list[list[str]] = []
    for segment in _SHELL_SPLIT_RE.split(command.strip()):
        if not segment:
            continue
        try:
            tokens = shlex.split(segment)
        except ValueError:
            continue
        while tokens and tokens[0] in {"env", "command", "time"}:
            tokens = tokens[1:]
        while tokens and "=" in tokens[0] and not tokens[0].startswith("-"):
            tokens = tokens[1:]
        if tokens:
            out.append(tokens)
    return out


def _short_output(output: str) -> str:
    text = (output or "").strip()
    if len(text) <= _MAX_OUTPUT_CHARS:
        return text
    return text[:500] + "\n…[truncated]…\n" + text[-500:]


def _first_pr_url(output: str) -> str | None:
    match = _URL_RE.search(output or "")
    return match.group(0) if match else None


def _commit_sha(output: str) -> str | None:
    # `git commit` commonly prints: [branch abc1234] subject
    first_line = (output or "").splitlines()[0] if output else ""
    match = _SHA_RE.search(first_line)
    return match.group(0) if match else None


def _classify_delivery_command(command: str, exit_code: int, output: str) -> Optional[dict[str, Any]]:
    """Return a delivery event payload for known delivery commands."""
    for tokens in _segments(command):
        if len(tokens) >= 2 and tokens[0] == "git" and tokens[1] == "commit":
            return {
                "eventType": "commit",
                "success": exit_code == 0,
                "commit": _commit_sha(output),
            }
        if len(tokens) >= 2 and tokens[0] == "git" and tokens[1] == "push":
            return {"eventType": "push", "success": exit_code == 0}
        if len(tokens) >= 3 and tokens[0] == "gh" and tokens[1] == "pr" and tokens[2] == "create":
            return {
                "eventType": "pr_created",
                "success": exit_code == 0,
                "url": _first_pr_url(output),
            }
        if len(tokens) >= 3 and tokens[0] == "gh" and tokens[1] == "pr" and tokens[2] == "merge":
            return {
                "eventType": "pr_merged",
                "success": exit_code == 0,
                "url": _first_pr_url(output),
            }
    return None


def _verification_payload(
    verification_evidence: Optional[dict[str, Any]],
    exit_code: int,
) -> Optional[dict[str, Any]]:
    if not verification_evidence:
        return None
    status = str(verification_evidence.get("status") or ("passed" if exit_code == 0 else "failed"))
    return {
        "eventType": "verification_pass" if status == "passed" else "verification_fail",
        "success": status == "passed",
        "status": status,
        "kind": verification_evidence.get("kind"),
        "scope": verification_evidence.get("scope"),
        "canonicalCommand": verification_evidence.get("canonical_command"),
    }


def _active_run_id() -> Optional[int]:
    raw = (os.environ.get("HERMES_KANBAN_RUN_ID") or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _merge_run_metadata(existing: str | None, event: dict[str, Any]) -> str:
    try:
        metadata = json.loads(existing) if existing else {}
    except Exception:
        metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}
    events = metadata.get("deliveryEvents")
    if not isinstance(events, list):
        events = []
    events.append({k: v for k, v in event.items() if k not in {"command", "outputSummary"}})
    metadata["deliveryEvents"] = events[-20:]
    if event.get("eventType") in {"verification_pass", "verification_fail"}:
        verification = metadata.get("verification")
        if not isinstance(verification, dict):
            verification = {}
        key = str(event.get("kind") or event.get("canonicalCommand") or "verification")
        verification[key] = "pass" if event.get("success") else "fail"
        metadata["verification"] = verification
    return json.dumps(metadata, ensure_ascii=False)


def record_terminal_delivery_event(
    *,
    command: str,
    cwd: str | Path | None,
    exit_code: int,
    output: str,
    verification_evidence: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """Record a terminal-derived delivery event on the active Kanban task.

    Returns the recorded event summary, or ``None`` when there is no active
    Kanban task or the command is not a delivery/verification event.
    """
    task_id = (os.environ.get("HERMES_KANBAN_TASK") or "").strip()
    if not task_id:
        return None

    event = _verification_payload(verification_evidence, exit_code)
    if event is None:
        event = _classify_delivery_command(command, exit_code, output)
    if event is None:
        return None

    event.update(
        {
            "command": command[:_MAX_COMMAND_CHARS],
            "cwd": str(cwd or ""),
            "exitCode": int(exit_code),
            "outputSummary": _short_output(output),
        }
    )

    from hermes_cli import kanban_db as kb

    conn = kb.connect()
    try:
        run_id = _active_run_id()
        if run_id is None:
            row = conn.execute("SELECT current_run_id FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if row and row["current_run_id"]:
                run_id = int(row["current_run_id"])
        with kb.write_txn(conn):
            if not conn.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
                return None
            kb.record_task_event(conn, task_id, "delivery_event", event, run_id=run_id)
            if run_id is not None:
                row = conn.execute("SELECT metadata FROM task_runs WHERE id = ?", (run_id,)).fetchone()
                if row is not None:
                    conn.execute(
                        "UPDATE task_runs SET metadata = ? WHERE id = ?",
                        (_merge_run_metadata(row["metadata"], event), run_id),
                    )
        return {"task_id": task_id, "run_id": run_id, **event}
    finally:
        conn.close()
