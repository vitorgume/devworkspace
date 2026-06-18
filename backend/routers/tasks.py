import math
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.db.connection import get_connection
from backend.models.schemas import (
    Complexity,
    Project,
    ProjectCreate,
    Sprint,
    SprintCreate,
    Task,
    TaskCreate,
)

router = APIRouter()

projects_router = APIRouter()
sprints_router = APIRouter()


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


@projects_router.get("", response_model=list[Project])
def list_projects():
    return _fetch_all("SELECT id, name, created_at FROM projects ORDER BY created_at DESC")


@projects_router.post("", response_model=Project, status_code=201)
def create_project(payload: ProjectCreate):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("INSERT INTO projects (name) VALUES (%s)", (payload.name,))
        conn.commit()
        project_id = cursor.lastrowid
        cursor.execute(
            "SELECT id, name, created_at FROM projects WHERE id = %s", (project_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return row
    finally:
        cursor.close()
        conn.close()


@sprints_router.get("", response_model=list[Sprint])
def list_sprints(project_id: int | None = Query(default=None)):
    if project_id is None:
        return _fetch_all(
            "SELECT id, project_id, name, start_date, end_date, created_at "
            "FROM sprints ORDER BY created_at DESC"
        )

    return _fetch_all(
        "SELECT id, project_id, name, start_date, end_date, created_at "
        "FROM sprints WHERE project_id = %s ORDER BY created_at DESC",
        (project_id,),
    )


@sprints_router.post("", response_model=Sprint, status_code=201)
def create_sprint(payload: SprintCreate):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "INSERT INTO sprints (project_id, name, start_date, end_date) "
            "VALUES (%s, %s, %s, %s)",
            (payload.project_id, payload.name, payload.start_date, payload.end_date),
        )
        conn.commit()
        sprint_id = cursor.lastrowid
        cursor.execute(
            "SELECT id, project_id, name, start_date, end_date, created_at "
            "FROM sprints WHERE id = %s",
            (sprint_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create sprint")
        return row
    finally:
        cursor.close()
        conn.close()


@router.get("", response_model=list[Task])
def list_tasks(sprint_id: int = Query(...)):
    return _fetch_all(
        "SELECT id, sprint_id, project_id, name, tag, complexity, "
        "optimistic, probable, pessimistic, "
        "pert_minutes, hours, margin, total_hours, created_at "
        "FROM tasks WHERE sprint_id = %s ORDER BY created_at DESC",
        (sprint_id,),
    )


@router.post("", response_model=Task, status_code=201)
def create_task(payload: TaskCreate):
    complexity_factor = {"Low": 1.0, "Medium": 0.8, "High": 0.5}
    margin_rate = {"Low": 0.10, "Medium": 0.20, "High": 0.30}

    complexity_key = payload.complexity.value if isinstance(payload.complexity, Complexity) else str(payload.complexity)

    pert_minutes = (
        (payload.optimistic + 4 * payload.probable + payload.pessimistic) / 6
    ) * complexity_factor[complexity_key]
    hours = math.ceil(pert_minutes / 60)
    margin = hours * margin_rate[complexity_key]
    total_hours = hours + margin

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "INSERT INTO tasks ("
            "sprint_id, project_id, name, tag, complexity, "
            "optimistic, probable, pessimistic, "
            "pert_minutes, hours, margin, total_hours"
            ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                payload.sprint_id,
                payload.project_id,
                payload.name,
                payload.tag,
                complexity_key,
                payload.optimistic,
                payload.probable,
                payload.pessimistic,
                float(pert_minutes),
                int(hours),
                float(margin),
                float(total_hours),
            ),
        )
        conn.commit()
        task_id = cursor.lastrowid
        cursor.execute(
            "SELECT id, sprint_id, project_id, name, tag, complexity, "
            "optimistic, probable, pessimistic, "
            "pert_minutes, hours, margin, total_hours, created_at "
            "FROM tasks WHERE id = %s",
            (task_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create task")
        return row
    finally:
        cursor.close()
        conn.close()


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
    finally:
        cursor.close()
        conn.close()
