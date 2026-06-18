import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.compressor import compress_prompt
from backend.services.translator import translate_prompt

router = APIRouter()

load_dotenv()


class PromptSection(BaseModel):
    label: str
    content: str


class ApplyPromptRequest(BaseModel):
    title: str
    prompt_type: str
    sections: list[PromptSection]


@router.post("/apply")
def apply_prompt(payload: ApplyPromptRequest):
    blocks: list[str] = []
    for s in payload.sections:
        blocks.append(s.label)
        blocks.append(s.content)
        blocks.append("")
    full_text = "\n".join(blocks).strip()

    try:
        translated = translate_prompt(full_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Translation failed: {e}") from e

    compressed, ratio = compress_prompt(translated)

    try:
        mcp_resp = requests.post(
            "http://localhost:8001/mcp/push",
            json={"content": compressed},
            timeout=10,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"MCP push failed: {e}") from e

    if not mcp_resp.ok:
        raise HTTPException(
            status_code=502, detail=f"MCP push error: {mcp_resp.status_code} {mcp_resp.text}"
        )

    mcp_json = {}
    try:
        mcp_json = mcp_resp.json()
    except ValueError:
        mcp_json = {"raw": mcp_resp.text}

    return {
        "translated": translated,
        "compressed": compressed,
        "compression_ratio": ratio,
        "mcp_status": mcp_json,
    }
