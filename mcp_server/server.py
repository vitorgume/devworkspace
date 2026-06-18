from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

latest_content: str = ""


class PushRequest(BaseModel):
    content: str


@app.post("/mcp/push")
def push(payload: PushRequest):
    global latest_content
    latest_content = payload.content
    return {"status": "ok"}


@app.get("/mcp/latest")
def latest():
    return {"content": latest_content}


@app.get("/health")
def health():
    return {"status": "ok"}
