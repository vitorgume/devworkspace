"""Tradução PT -> EN dos prompts.

O `deep_translator.GoogleTranslator` faz scraping de `translate.google.com/m`
e o Google passou a devolver a página vazia do formulário quando o
User-Agent não é de navegador, o que quebrava tudo com `TranslationNotFound`.
Aqui usamos o endpoint JSON do Google (que preserva quebras de linha) e
mantemos o MyMemory como plano B.
"""

import json
from typing import Callable, List

import requests

GOOGLE_ENDPOINT = "https://clients5.google.com/translate_a/t"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# O endpoint aguenta bem mais que isso, mas fatiar reduz timeout e rate limit.
GOOGLE_CHUNK_CHARS = 4000
# Limite duro da API gratuita do MyMemory.
MYMEMORY_CHUNK_CHARS = 480

REQUEST_TIMEOUT = 20


def _split_chunks(text: str, limit: int) -> List[str]:
    """Fatia o texto em blocos <= limit, cortando em quebras de linha."""
    if len(text) <= limit:
        return [text]

    chunks: List[str] = []
    current = ""
    for line in text.split("\n"):
        candidate = line if not current else current + "\n" + line
        if len(candidate) <= limit:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        # Linha isolada maior que o limite: quebra por sentença e, no pior
        # caso, no meio da própria linha.
        while len(line) > limit:
            cut = line.rfind(". ", 0, limit)
            cut = cut + 1 if cut > limit // 2 else limit
            chunks.append(line[:cut])
            line = line[cut:].lstrip()
        current = line

    if current:
        chunks.append(current)
    return chunks


def _google_translate(chunk: str) -> str:
    response = requests.post(
        GOOGLE_ENDPOINT,
        params={"client": "dict-chrome-ex", "sl": "pt", "tl": "en"},
        data={"q": chunk},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    try:
        payload = response.json()
    except json.JSONDecodeError as e:
        raise RuntimeError(f"resposta nao-JSON do Google Translate: {response.text[:120]!r}") from e

    translated = _flatten(payload)
    if not translated.strip():
        raise RuntimeError("Google Translate devolveu resposta vazia")
    return translated


def _flatten(payload) -> str:
    """O endpoint devolve `["texto"]` ou listas aninhadas de segmentos."""
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list):
        return "".join(_flatten(item) for item in payload)
    return ""


def _mymemory_translate(chunk: str) -> str:
    from deep_translator import MyMemoryTranslator

    return MyMemoryTranslator(source="pt-BR", target="en-US").translate(chunk) or chunk


def _translate_with(provider: Callable[[str], str], text: str, limit: int) -> str:
    return "\n".join(provider(chunk) for chunk in _split_chunks(text, limit))


def translate_prompt(text: str) -> str:
    if not text or not text.strip():
        return text

    errors = []
    for name, provider, limit in (
        ("google", _google_translate, GOOGLE_CHUNK_CHARS),
        ("mymemory", _mymemory_translate, MYMEMORY_CHUNK_CHARS),
    ):
        try:
            return _translate_with(provider, text, limit)
        except Exception as e:  # noqa: BLE001 - tentamos o próximo provedor
            errors.append(f"{name}: {type(e).__name__}: {e}")

    raise RuntimeError("nenhum tradutor respondeu (" + " | ".join(errors) + ")")
