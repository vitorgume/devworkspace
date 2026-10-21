import os
import threading
from typing import Any

from dotenv import load_dotenv

load_dotenv()


DB_TIME_ZONE = os.getenv("DB_TIME_ZONE", "-03:00")

_schema_lock = threading.Lock()
_schema_ready = False


def _open_connection() -> Any:
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


def ensure_schema() -> None:
    """Apply pending migrations once per process, on first successful connection.

    `start.sh` launches the backend and MySQL is often still coming up (or not
    running at all), so migrating only at startup can silently skip and leave
    the API querying columns that do not exist. Retrying here until it succeeds
    once makes the boot order irrelevant.
    """
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        from backend.db.migrations import run_migrations

        conn = _open_connection()
        try:
            applied = run_migrations(conn)
        finally:
            conn.close()
        if applied:
            print(f"[db] migrations applied: {', '.join(applied)}")
        _schema_ready = True


def get_connection() -> Any:
    conn = _open_connection()
    try:
        ensure_schema()
    except Exception:
        conn.close()
        raise
    return conn
