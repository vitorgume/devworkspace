import sys
import io

# 1. FORÇA O BUFFER A CAIR ANTES DE QUALQUER IMPORTAÇÃO DA LIB MCP
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, write_through=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, write_through=True)

from pathlib import Path
from mcp.server.fastmcp import FastMCP

# 2. INICIALIZAÇÃO DO SERVIDOR
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