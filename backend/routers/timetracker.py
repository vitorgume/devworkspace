import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.db.connection import get_connection
from backend.models.schemas import (
    TimeEntry,
    TimeEntryPauseRequest,
    TimeEntrySetElapsedRequest,
    TimeEntrySetWorkedTodayRequest,
    TimeEntryStartBatchRequest,
    TimeEntryStartRequest,
    TimeEntryUpdateRequest,
    TrackingState,
)

router = APIRouter()

ENTRY_COLUMNS = "id, task_id, started_at, paused_at, duration_seconds, share_count"

# Effective time credited to a task: wall clock divided by how many tasks were
# being worked on during that stretch. GREATEST guards rows written before the
# share_count column existed or edited to 0 by hand.
EFFECTIVE_SECONDS = "duration_seconds / GREATEST(share_count, 1)"
TE_EFFECTIVE_SECONDS = "te.duration_seconds / GREATEST(te.share_count, 1)"


def _fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(query, params)
        return list(cursor.fetchall())
    finally:
        cursor.close()
        conn.close()


def _fetch_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(query, params)
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def _debug(message: str) -> None:
    if os.getenv("DEVWORKSPACE_DEBUG") == "1":
        print(f"[timetracker] {message}")


def _active_task_ids(cursor: Any) -> list[int]:
    cursor.execute("SELECT task_id FROM time_entries WHERE paused_at IS NULL ORDER BY id")
    return [int(r["task_id"]) for r in cursor.fetchall()]


def _open_entries(cursor: Any) -> list[dict[str, Any]]:
    cursor.execute(
        f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE paused_at IS NULL "
        "ORDER BY started_at DESC, id DESC"
    )
    return list(cursor.fetchall())


def _resegment(cursor: Any, next_task_ids: list[int]) -> list[int]:
    """Close every running segment and open a fresh one per task in next_task_ids.

    All simultaneously running timers consume the same wall clock, so each open
    segment is stamped with how many tasks were sharing it. Whenever that set
    changes - a task joins, a task is paused - the current segments are closed
    and new ones opened with the new divisor. That keeps the split exact instead
    of retroactively rewriting time already worked under a different number of
    parallel tasks.

    Returns the resulting list of active task ids.
    """
    open_ids = [int(r["id"]) for r in _open_entries(cursor)]
    if open_ids:
        placeholders = ", ".join(["%s"] * len(open_ids))
        cursor.execute(
            "UPDATE time_entries SET paused_at = NOW(), "
            "duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()) "
            f"WHERE id IN ({placeholders})",
            tuple(open_ids),
        )
        # Segments that close within the same second carry no time and would
        # only clutter the entry list (e.g. starting three tasks in a row).
        cursor.execute(
            f"DELETE FROM time_entries WHERE duration_seconds = 0 AND id IN ({placeholders})",
            tuple(open_ids),
        )

    unique_ids = list(dict.fromkeys(int(t) for t in next_task_ids))
    share_count = len(unique_ids)
    for task_id in unique_ids:
        cursor.execute(
            "INSERT INTO time_entries (task_id, started_at, paused_at, duration_seconds, share_count) "
            "VALUES (%s, NOW(), NULL, 0, %s)",
            (task_id, share_count),
        )
    _debug(f"resegmented to {unique_ids} (share_count={share_count})")
    return unique_ids


def _tracking_state(cursor: Any) -> dict[str, Any]:
    active = _open_entries(cursor)
    return {"active": active, "share_count": len(active)}


def _task_exists(cursor: Any, task_id: int) -> bool:
    cursor.execute("SELECT 1 FROM tasks WHERE id = %s", (task_id,))
    return cursor.fetchone() is not None


@router.post("/start", status_code=201, response_model=TrackingState)
def start_timer(payload: TimeEntryStartRequest):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        task_id = int(payload.task_id)
        if not _task_exists(cursor, task_id):
            raise HTTPException(status_code=404, detail="Task not found")
        active = _active_task_ids(cursor)
        if task_id in active:
            raise HTTPException(status_code=400, detail="Task already has an active entry")
        _resegment(cursor, active + [task_id])
        conn.commit()
        return _tracking_state(cursor)
    finally:
        cursor.close()
        conn.close()


@router.post("/start-batch", status_code=201, response_model=TrackingState)
def start_timers(payload: TimeEntryStartBatchRequest):
    """Start several tasks as one parallel session, or add them to a running one."""
    requested = list(dict.fromkeys(int(t) for t in payload.task_ids))
    if not requested:
        raise HTTPException(status_code=400, detail="task_ids must not be empty")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        for task_id in requested:
            if not _task_exists(cursor, task_id):
                raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        active = _active_task_ids(cursor)
        _resegment(cursor, active + requested)
        conn.commit()
        return _tracking_state(cursor)
    finally:
        cursor.close()
        conn.close()


@router.post("/pause", response_model=TrackingState)
def pause_timer(payload: TimeEntryPauseRequest):
    _debug(f"pause hit entry_id={payload.entry_id}")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = %s",
            (payload.entry_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found")
        if row["paused_at"] is not None:
            raise HTTPException(status_code=400, detail="Entry already paused")

        paused_task_id = int(row["task_id"])
        remaining = [t for t in _active_task_ids(cursor) if t != paused_task_id]
        _resegment(cursor, remaining)
        conn.commit()
        return _tracking_state(cursor)
    finally:
        cursor.close()
        conn.close()


@router.post("/pause-task/{task_id}", response_model=TrackingState)
def pause_task(task_id: int):
    """Pause a task by id, without needing to know its current entry."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        active = _active_task_ids(cursor)
        if int(task_id) not in active:
            raise HTTPException(status_code=400, detail="Task has no active entry")
        _resegment(cursor, [t for t in active if t != int(task_id)])
        conn.commit()
        return _tracking_state(cursor)
    finally:
        cursor.close()
        conn.close()


@router.post("/pause-all", response_model=TrackingState)
def pause_all():
    """Stop the whole parallel session at once."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        _resegment(cursor, [])
        conn.commit()
        return _tracking_state(cursor)
    finally:
        cursor.close()
        conn.close()


@router.get("/active", response_model=list[TimeEntry])
def list_active_entries():
    return _fetch_all(
        f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE paused_at IS NULL "
        "ORDER BY started_at DESC"
    )


@router.get("/task/{task_id}/entries", response_model=list[TimeEntry])
def list_task_entries(task_id: int):
    return _fetch_all(
        f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE task_id = %s ORDER BY started_at DESC",
        (task_id,),
    )


@router.patch("/entry/{entry_id}", response_model=TimeEntry)
def update_entry(entry_id: int, payload: TimeEntryUpdateRequest):
    if payload.started_at is None and payload.paused_at is None and payload.share_count is None:
        raise HTTPException(status_code=400, detail="At least one field must be provided")
    if payload.share_count is not None and payload.share_count < 1:
        raise HTTPException(status_code=400, detail="share_count must be >= 1")

    row = _fetch_one(
        f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = %s",
        (entry_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")

    started_at = payload.started_at if payload.started_at is not None else row["started_at"]
    paused_at = payload.paused_at if payload.paused_at is not None else row["paused_at"]
    share_count = (
        payload.share_count if payload.share_count is not None else int(row["share_count"] or 1)
    )

    if paused_at is not None and started_at is not None and paused_at < started_at:
        raise HTTPException(status_code=400, detail="paused_at must be >= started_at")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if paused_at is None:
            cursor.execute(
                "UPDATE time_entries SET started_at = %s, paused_at = NULL, "
                "duration_seconds = 0, share_count = %s WHERE id = %s",
                (started_at, share_count, entry_id),
            )
        else:
            cursor.execute(
                "UPDATE time_entries SET started_at = %s, paused_at = %s, "
                "duration_seconds = TIMESTAMPDIFF(SECOND, %s, %s), share_count = %s "
                "WHERE id = %s",
                (started_at, paused_at, started_at, paused_at, share_count, entry_id),
            )
        conn.commit()
        cursor.execute(
            f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = %s",
            (entry_id,),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update entry")
        return updated
    finally:
        cursor.close()
        conn.close()


@router.patch("/entry/{entry_id}/elapsed", response_model=TimeEntry)
def set_entry_elapsed(entry_id: int, payload: TimeEntrySetElapsedRequest):
    if payload.elapsed_seconds < 0:
        raise HTTPException(status_code=400, detail="elapsed_seconds must be >= 0")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = %s",
            (entry_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found")

        elapsed = int(payload.elapsed_seconds)
        if row["paused_at"] is None:
            cursor.execute(
                "UPDATE time_entries "
                "SET started_at = DATE_SUB(NOW(), INTERVAL %s SECOND) "
                "WHERE id = %s",
                (elapsed, entry_id),
            )
        else:
            cursor.execute(
                "UPDATE time_entries "
                "SET started_at = DATE_SUB(paused_at, INTERVAL %s SECOND), duration_seconds = %s "
                "WHERE id = %s",
                (elapsed, elapsed, entry_id),
            )
        conn.commit()

        cursor.execute(
            f"SELECT {ENTRY_COLUMNS} FROM time_entries WHERE id = %s",
            (entry_id,),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update entry")
        return updated
    finally:
        cursor.close()
        conn.close()


@router.patch("/task/{task_id}/worked-today")
def set_task_worked_today(task_id: int, payload: TimeEntrySetWorkedTodayRequest):
    if payload.worked_today_seconds < 0:
        raise HTTPException(status_code=400, detail="worked_today_seconds must be >= 0")

    target = int(payload.worked_today_seconds)
    current = _fetch_one(
        f"SELECT COALESCE(SUM({EFFECTIVE_SECONDS}), 0) AS worked_today_seconds "
        "FROM time_entries "
        "WHERE task_id = %s AND DATE(started_at) = CURDATE()",
        (task_id,),
    )
    current_seconds = round(float((current or {}).get("worked_today_seconds") or 0))
    delta = target - current_seconds
    if delta == 0:
        return {"task_id": task_id, "worked_today_seconds": target, "delta_seconds": 0}

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # A manual adjustment is credited in full to this task, never split.
        cursor.execute(
            "INSERT INTO time_entries (task_id, started_at, paused_at, duration_seconds, share_count) "
            "VALUES (%s, NOW(), NOW(), %s, 1)",
            (task_id, delta),
        )
        conn.commit()
        return {"task_id": task_id, "worked_today_seconds": target, "delta_seconds": delta}
    finally:
        cursor.close()
        conn.close()


def _task_totals_sql(where: str) -> str:
    """Per-task totals in both effective (split) and raw (wall clock) seconds."""
    return (
        "SELECT "
        "t.id AS task_id, "
        "t.name AS task_name, "
        "t.total_hours AS estimated_hours, "
        f"COALESCE(SUM({TE_EFFECTIVE_SECONDS}), 0) AS worked_seconds, "
        "COALESCE(SUM(te.duration_seconds), 0) AS raw_worked_seconds, "
        "COALESCE(SUM(CASE WHEN DATE(te.started_at) = CURDATE() "
        f"  THEN {TE_EFFECTIVE_SECONDS} ELSE 0 END), 0) AS worked_today_seconds, "
        "COALESCE(SUM(CASE WHEN DATE(te.started_at) = CURDATE() "
        "  THEN te.duration_seconds ELSE 0 END), 0) AS raw_worked_today_seconds "
        "FROM tasks t "
        "LEFT JOIN time_entries te ON te.task_id = t.id "
        f"WHERE {where} "
        "GROUP BY t.id, t.name, t.total_hours "
        "ORDER BY t.created_at DESC"
    )


def _serialize_tasks(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "task_id": int(r["task_id"]),
            "task_name": r["task_name"],
            "estimated_hours": float(r["estimated_hours"] or 0),
            "worked_seconds": round(float(r["worked_seconds"] or 0)),
            "raw_worked_seconds": int(r["raw_worked_seconds"] or 0),
            "worked_today_seconds": round(float(r["worked_today_seconds"] or 0)),
            "raw_worked_today_seconds": int(r["raw_worked_today_seconds"] or 0),
        }
        for r in rows
    ]


@router.get("/sprint-summary")
def sprint_summary(sprint_id: int = Query(...)):
    total_estimated = _fetch_one(
        "SELECT COALESCE(SUM(total_hours), 0) AS total_estimated_hours "
        "FROM tasks WHERE sprint_id = %s",
        (sprint_id,),
    )
    tasks = _serialize_tasks(_fetch_all(_task_totals_sql("t.sprint_id = %s"), (sprint_id,)))

    return {
        "total_estimated_hours": float(total_estimated["total_estimated_hours"] or 0),
        "total_worked_seconds": sum(t["worked_seconds"] for t in tasks),
        "total_raw_worked_seconds": sum(t["raw_worked_seconds"] for t in tasks),
        "tasks": tasks,
    }


@router.get("/tag-summary")
def tag_summary(project_id: int = Query(...), tag: str | None = Query(default=None)):
    where = "t.project_id = %s"
    params: list[Any] = [project_id]
    if tag:
        where += " AND t.tag = %s"
        params.append(tag)

    total_estimated = _fetch_one(
        "SELECT COALESCE(SUM(total_hours), 0) AS total_estimated_hours FROM tasks WHERE project_id = %s"
        + (" AND tag = %s" if tag else ""),
        tuple(params),
    )
    tasks = _serialize_tasks(_fetch_all(_task_totals_sql(where), tuple(params)))

    return {
        "total_estimated_hours": float((total_estimated or {}).get("total_estimated_hours") or 0),
        "total_worked_seconds": sum(t["worked_seconds"] for t in tasks),
        "total_raw_worked_seconds": sum(t["raw_worked_seconds"] for t in tasks),
        "tasks": tasks,
    }
