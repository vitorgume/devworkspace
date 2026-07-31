import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()


DB_TIME_ZONE = os.getenv("DB_TIME_ZONE", "-03:00")


def get_connection() -> Any:
    try:
        import mysql.connector
    except ModuleNotFoundError as e:
        raise ModuleNotFoundError(
            "mysql-connector-python is not installed. Install dependencies from backend/requirements.txt."
        ) from e

    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=os.getenv("DB_NAME", "devworkspace"),
    )
    # The MySQL server's SYSTEM time zone may not match the machine's local
    # time zone (e.g. it resolves to UTC), which makes NOW()/CURDATE() drift
    # from wall-clock time. Pin the session so all timestamps line up.
    cursor = conn.cursor()
    try:
        cursor.execute("SET time_zone = %s", (DB_TIME_ZONE,))
    finally:
        cursor.close()
    return conn
