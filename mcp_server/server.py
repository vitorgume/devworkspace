from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("devworkspace")

LATEST_PROMPT_FILE = Path(__file__).resolve().parent / "latest_prompt.txt"


@mcp.tool(
    name="get_latest_prompt",
    description="Returns the latest prompt pushed from DevWorkspace's Prompt Workshop",
)
def get_latest_prompt() -> str:
    if not LATEST_PROMPT_FILE.exists():
        return "No prompt has been pushed yet."

    content = LATEST_PROMPT_FILE.read_text(encoding="utf-8").strip()
    return content or "No prompt has been pushed yet."


if __name__ == "__main__":
    mcp.run()
