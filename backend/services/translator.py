def translate_prompt(text: str) -> str:
    if not text:
        return text

    # Deixamos a exceção subir para que o prompts.py possa capturá-la e logar
    from deep_translator import GoogleTranslator
    return GoogleTranslator(source="pt", target="en").translate(text) or text