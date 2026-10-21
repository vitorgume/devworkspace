from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class Complexity(str, Enum):
    Low = "Low"
    Medium = "Medium"
    High = "High"


class ProjectCreate(BaseModel):
    name: str


class Project(ProjectCreate):
    id: int
    created_at: datetime


class SprintCreate(BaseModel):
    project_id: int
    name: str
    start_date: date | None = None
    end_date: date | None = None


class Sprint(SprintCreate):
    id: int
    created_at: datetime


class TaskCreate(BaseModel):
    sprint_id: int | None = None
    project_id: int
    name: str
    tag: str | None = None
    complexity: Complexity
    optimistic: int
    probable: int
    pessimistic: int


class Task(TaskCreate):
    id: int
    pert_minutes: float
    hours: int
    margin: float
    total_hours: float
    created_at: datetime


class TaskUpdate(BaseModel):
    name: str | None = None
    tag: str | None = None
    complexity: Complexity | None = None
    optimistic: int | None = None
    probable: int | None = None
    pessimistic: int | None = None


class TimeEntryStartRequest(BaseModel):
    task_id: int


class TimeEntryStartBatchRequest(BaseModel):
    task_ids: list[int]


class TimeEntryPauseRequest(BaseModel):
    entry_id: int


class TimeEntry(BaseModel):
    id: int
    task_id: int
    started_at: datetime
    paused_at: datetime | None = None
    duration_seconds: int
    # How many tasks shared this stretch of wall clock. The task's effective
    # time is duration_seconds / share_count.
    share_count: int = 1


class TrackingState(BaseModel):
    """Result of any operation that changes the set of running timers."""

    active: list[TimeEntry]
    share_count: int


class TimeEntrySetElapsedRequest(BaseModel):
    elapsed_seconds: int


class TimeEntrySetWorkedTodayRequest(BaseModel):
    worked_today_seconds: int


class TimeEntryUpdateRequest(BaseModel):
    started_at: datetime | None = None
    paused_at: datetime | None = None
    share_count: int | None = None
