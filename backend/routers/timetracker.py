import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.db.connection import get_connection
from backend.models.schemas import TimeEntry, TimeEntryPauseRequest, TimeEntryStartRequest

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
