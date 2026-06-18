def translate_prompt(text: str) -> str:
    if not text:
        return text

    try:
        from deep_translator import GoogleTranslator

        return GoogleTranslator(source="pt", target="en").translate(text) or text
    except Exception:
        return text
