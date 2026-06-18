import re


FILLER_PHRASES = [
    "please",
    "could you",
    "i would like you to",
    "make sure to",
    "as mentioned",
    "feel free to",
    "don't forget to",
    "you should",
    "it is important that",
]

ABBREVIATIONS = {
    "function": "fn",
    "variable": "var",
    "parameter": "param",
    "implement": "impl",
    "return": "ret",
    "database": "db",
    "frontend": "fe",
    "backend": "be",
    "component": "comp",
    "configuration": "config",
    "authentication": "auth",
    "repository": "repo",
    "environment": "env",
}


def compress_prompt(text: str) -> tuple[str, float]:
    original_chars = len(text)
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")

    lines = normalized.split("\n")
    cleaned_lines: list[str] = []
    for line in lines:
        line = re.sub(r"[ \t]+", " ", line)
        line = line.strip()
        if not line:
            continue
        cleaned_lines.append(line)

    compressed = "\n".join(cleaned_lines)

    for phrase in FILLER_PHRASES:
        compressed = re.sub(rf"\b{re.escape(phrase)}\b", "", compressed, flags=re.IGNORECASE)
        compressed = re.sub(r"[ \t]{2,}", " ", compressed)
        compressed = re.sub(r" +\n", "\n", compressed)
        compressed = re.sub(r"\n +", "\n", compressed)

    for src, dst in ABBREVIATIONS.items():
        compressed = re.sub(rf"\b{re.escape(src)}\b", dst, compressed, flags=re.IGNORECASE)

    seen: set[str] = set()
    deduped_lines: list[str] = []
    for line in compressed.split("\n"):
        key = line.strip()
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        deduped_lines.append(key)

    compressed = "\n".join(deduped_lines)
    compressed = "\n".join([ln.strip() for ln in compressed.split("\n") if ln.strip()])

    compressed_chars = len(compressed)
    ratio = (original_chars / compressed_chars) if compressed_chars > 0 else 0.0
    return compressed, ratio

