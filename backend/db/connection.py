import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()


def get_connection() -> Any:
    try:
        import mysql.connector
    except ModuleNotFoundError as e:
        raise ModuleNotFoundError(
            "mysql-connector-python is not installed. Install dependencies from backend/requirements.txt."
        ) from e

    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=os.getenv("DB_NAME", "devworkspace"),
    )
