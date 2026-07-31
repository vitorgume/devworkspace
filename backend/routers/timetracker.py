import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.db.connection import get_connection
from backend.models.schemas import (
    TimeEntry,
    TimeEntryPauseRequest,
    TimeEntrySetElapsedRequest,
    TimeEntrySetWorkedTodayRequest,
    TimeEntryStartRequest,
    TimeEntryUpdateRequest,
)

router = APIRouter()


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


@router.post("/start", status_code=201)
def start_timer(payload: TimeEntryStartRequest):
    existing = _fetch_one(
        "SELECT id FROM time_entries WHERE task_id = %s AND paused_at IS NULL LIMIT 1",
        (payload.task_id,),
    )
    if existing:
        raise HTTPException(status_code=400, detail="Task already has an active entry")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "INSERT INTO time_entries (task_id, started_at, paused_at, duration_seconds) "
            "VALUES (%s, NOW(), NULL, 0)",
            (payload.task_id,),
        )
        conn.commit()
        entry_id = cursor.lastrowid
        return {"entry_id": entry_id}
    finally:
        cursor.close()
        conn.close()


@router.post("/pause", response_model=TimeEntry)
def pause_timer(payload: TimeEntryPauseRequest):
    if os.getenv("DEVWORKSPACE_DEBUG") == "1":
        print(f"[timetracker] pause hit entry_id={payload.entry_id}")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, task_id, started_at, paused_at, duration_seconds "
            "FROM time_entries WHERE id = %s",
            (payload.entry_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found")
        if row["paused_at"] is not None:
            raise HTTPException(status_code=400, detail="Entry already paused")

        cursor.execute(
            "UPDATE time_entries "
            "SET paused_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()) "
            "WHERE id = %s",
            (payload.entry_id,),
        )
        conn.commit()
        if os.getenv("DEVWORKSPACE_DEBUG") == "1":
            print(f"[timetracker] pause updated rows={cursor.rowcount}")

        cursor.execute(
            "SELECT id, task_id, started_at, paused_at, duration_seconds "
            "FROM time_entries WHERE id = %s",
            (payload.entry_id,),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to pause entry")
        return updated
    finally:
        cursor.close()
        conn.close()


@router.get("/active", response_model=list[TimeEntry])
def list_active_entries():
    return _fetch_all(
        "SELECT id, task_id, started_at, paused_at, duration_seconds "
        "FROM time_entries WHERE paused_at IS NULL ORDER BY started_at DESC"
    )


@router.get("/task/{task_id}/entries", response_model=list[TimeEntry])
def list_task_entries(task_id: int):
    return _fetch_all(
        "SELECT id, task_id, started_at, paused_at, duration_seconds "
        "FROM time_entries WHERE task_id = %s ORDER BY started_at DESC",
        (task_id,),
    )


@router.patch("/entry/{entry_id}", response_model=TimeEntry)
def update_entry(entry_id: int, payload: TimeEntryUpdateRequest):
    if payload.started_at is None and payload.paused_at is None:
        raise HTTPException(status_code=400, detail="At least one field must be provided")

    row = _fetch_one(
        "SELECT id, task_id, started_at, paused_at, duration_seconds FROM time_entries WHERE id = %s",
        (entry_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")

    started_at = payload.started_at if payload.started_at is not None else row["started_at"]
    paused_at = payload.paused_at if payload.paused_at is not None else row["paused_at"]

    if paused_at is not None and started_at is not None and paused_at < started_at:
        raise HTTPException(status_code=400, detail="paused_at must be >= started_at")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if paused_at is None:
            cursor.execute(
                "UPDATE time_entries SET started_at = %s, paused_at = NULL, duration_seconds = 0 WHERE id = %s",
                (started_at, entry_id),
            )
        else:
            cursor.execute(
                "UPDATE time_entries SET started_at = %s, paused_at = %s, "
                "duration_seconds = TIMESTAMPDIFF(SECOND, %s, %s) "
                "WHERE id = %s",
                (started_at, paused_at, started_at, paused_at, entry_id),
            )
        conn.commit()
        cursor.execute(
            "SELECT id, task_id, started_at, paused_at, duration_seconds FROM time_entries WHERE id = %s",
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
            "SELECT id, task_id, started_at, paused_at, duration_seconds "
            "FROM time_entries WHERE id = %s",
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
            "SELECT id, task_id, started_at, paused_at, duration_seconds "
            "FROM time_entries WHERE id = %s",
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
        "SELECT COALESCE(SUM(duration_seconds), 0) AS worked_today_seconds "
        "FROM time_entries "
        "WHERE task_id = %s AND DATE(started_at) = CURDATE()",
        (task_id,),
    )
    current_seconds = int((current or {}).get("worked_today_seconds") or 0)
    delta = target - current_seconds
    if delta == 0:
        return {"task_id": task_id, "worked_today_seconds": target, "delta_seconds": 0}

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "INSERT INTO time_entries (task_id, started_at, paused_at, duration_seconds) "
            "VALUES (%s, NOW(), NOW(), %s)",
            (task_id, delta),
        )
        conn.commit()
        return {"task_id": task_id, "worked_today_seconds": target, "delta_seconds": delta}
    finally:
        cursor.close()
        conn.close()


@router.get("/sprint-summary")
def sprint_summary(sprint_id: int = Query(...)):
    total_estimated = _fetch_one(
        "SELECT COALESCE(SUM(total_hours), 0) AS total_estimated_hours "
        "FROM tasks WHERE sprint_id = %s",
        (sprint_id,),
    )
    total_worked = _fetch_one(
        "SELECT COALESCE(SUM(te.duration_seconds), 0) AS total_worked_seconds "
        "FROM time_entries te "
        "JOIN tasks t ON t.id = te.task_id "
        "WHERE t.sprint_id = %s",
        (sprint_id,),
    )

    per_task = _fetch_all(
        "SELECT "
        "t.id AS task_id, "
        "t.name AS task_name, "
        "t.total_hours AS estimated_hours, "
        "COALESCE(SUM(te.duration_seconds), 0) AS worked_seconds, "
        "COALESCE(SUM(CASE WHEN DATE(te.started_at) = CURDATE() THEN te.duration_seconds ELSE 0 END), 0) "
        "  AS worked_today_seconds "
        "FROM tasks t "
        "LEFT JOIN time_entries te ON te.task_id = t.id "
        "WHERE t.sprint_id = %s "
        "GROUP BY t.id, t.name, t.total_hours "
        "ORDER BY t.created_at DESC",
        (sprint_id,),
    )

    return {
        "total_estimated_hours": float(total_estimated["total_estimated_hours"] or 0),
        "total_worked_seconds": int(total_worked["total_worked_seconds"] or 0),
        "tasks": [
            {
                "task_id": int(r["task_id"]),
                "task_name": r["task_name"],
                "estimated_hours": float(r["estimated_hours"] or 0),
                "worked_seconds": int(r["worked_seconds"] or 0),
                "worked_today_seconds": int(r["worked_today_seconds"] or 0),
            }
            for r in per_task
        ],
    }


@router.get("/tag-summary")
def tag_summary(project_id: int = Query(...), tag: str | None = Query(default=None)):
    where = "t.project_id = %s"
    params: list[Any] = [project_id]
    if tag:
        where += " AND t.tag = %s"
        params.append(tag)

    total_estimated = _fetch_one(
        f"SELECT COALESCE(SUM(total_hours), 0) AS total_estimated_hours FROM tasks WHERE project_id = %s"
        + (" AND tag = %s" if tag else ""),
        tuple(params),
    )
    total_worked = _fetch_one(
        "SELECT COALESCE(SUM(te.duration_seconds), 0) AS total_worked_seconds "
        "FROM time_entries te "
        "JOIN tasks t ON t.id = te.task_id "
        f"WHERE {where}",
        tuple(params),
    )

    per_task = _fetch_all(
        "SELECT "
        "t.id AS task_id, "
        "t.name AS task_name, "
        "t.total_hours AS estimated_hours, "
        "COALESCE(SUM(te.duration_seconds), 0) AS worked_seconds, "
        "COALESCE(SUM(CASE WHEN DATE(te.started_at) = CURDATE() THEN te.duration_seconds ELSE 0 END), 0) "
        "  AS worked_today_seconds "
        "FROM tasks t "
        "LEFT JOIN time_entries te ON te.task_id = t.id "
        f"WHERE {where} "
        "GROUP BY t.id, t.name, t.total_hours "
        "ORDER BY t.created_at DESC",
        tuple(params),
    )

    return {
        "total_estimated_hours": float((total_estimated or {}).get("total_estimated_hours") or 0),
        "total_worked_seconds": int((total_worked or {}).get("total_worked_seconds") or 0),
        "tasks": [
            {
                "task_id": int(r["task_id"]),
                "task_name": r["task_name"],
                "estimated_hours": float(r["estimated_hours"] or 0),
                "worked_seconds": int(r["worked_seconds"] or 0),
                "worked_today_seconds": int(r["worked_today_seconds"] or 0),
            }
            for r in per_task
        ],
    }
