import os
import json
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.connection import get_connection
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

repo_root = Path(__file__).resolve().parents[2]
latest_prompt_file = repo_root / "mcp_server" / "latest_prompt.txt"


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
        latest_prompt_file.write_text(compressed, encoding="utf-8")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write latest prompt: {e}") from e

    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO prompt_history (title, prompt_type, sections_json, translated, compressed, compression_ratio) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                payload.title,
                payload.prompt_type,
                json.dumps([s.model_dump() for s in payload.sections], ensure_ascii=False),
                translated,
                compressed,
                float(ratio),
            ),
        )
        conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to insert prompt history: {e}") from e
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    return {
        "translated": translated,
        "compressed": compressed,
        "compression_ratio": ratio,
        "mcp_status": {"status": "ok"},
    }


@router.get("/history")
def list_history():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, title, prompt_type, compression_ratio, created_at "
            "FROM prompt_history ORDER BY created_at DESC"
        )
        return list(cursor.fetchall())
    finally:
        cursor.close()
        conn.close()


@router.get("/history/{history_id}")
def get_history(history_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, title, prompt_type, sections_json, translated, compressed, compression_ratio, created_at "
            "FROM prompt_history WHERE id = %s",
            (history_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Prompt not found")
        return row
    finally:
        cursor.close()
        conn.close()


@router.post("/history/{history_id}/repush")
def repush_history(history_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT compressed FROM prompt_history WHERE id = %s", (history_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Prompt not found")
        try:
            latest_prompt_file.write_text(row["compressed"] or "", encoding="utf-8")
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Failed to write latest prompt: {e}") from e
        return {"status": "ok"}
    finally:
        cursor.close()
        conn.close()


@router.delete("/history/{history_id}", status_code=204)
def delete_history(history_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM prompt_history WHERE id = %s", (history_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Prompt not found")
    finally:
        cursor.close()
        conn.close()
