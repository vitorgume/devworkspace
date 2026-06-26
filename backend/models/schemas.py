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
    sprint_id: int
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


class TimeEntryStartRequest(BaseModel):
    task_id: int


class TimeEntryPauseRequest(BaseModel):
    entry_id: int


class TimeEntry(BaseModel):
    id: int
    task_id: int
    started_at: datetime
    paused_at: datetime | None = None
    duration_seconds: int


class TimeEntrySetElapsedRequest(BaseModel):
    elapsed_seconds: int


class TimeEntrySetWorkedTodayRequest(BaseModel):
    worked_today_seconds: int
