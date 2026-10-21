from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.connection import ensure_schema
from backend.routers import prompts, tasks, timetracker


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Best-effort: if MySQL is not up yet, the first request that reaches the
    # database migrates instead (see backend.db.connection.ensure_schema).
    try:
        ensure_schema()
    except Exception as e:
        print(f"[db] migrations deferred to first request: {e}")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(tasks.projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(tasks.sprints_router, prefix="/api/sprints", tags=["sprints"])
app.include_router(timetracker.router, prefix="/api/timetracker", tags=["timetracker"])
app.include_router(prompts.router, prefix="/api/prompts", tags=["prompts"])
