"""Idempotent schema migrations.

The project has no migration tool: `backend/db/schema.sql` is run by hand on
setup. These statements bring an already-created database up to date without
asking the user to run SQL again.
"""

from typing import Any

# (table, column, DDL fragment) — applied only when the column is missing.
_ADD_COLUMNS: list[tuple[str, str, str]] = [
    ("time_entries", "share_count", "ADD COLUMN share_count INT NOT NULL DEFAULT 1"),
]


def _column_exists(cursor: Any, table: str, column: str) -> bool:
    cursor.execute(
        "SELECT 1 FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (table, column),
    )
    return cursor.fetchone() is not None


def _table_exists(cursor: Any, table: str) -> bool:
    cursor.execute(
        "SELECT 1 FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
        (table,),
    )
    return cursor.fetchone() is not None


def run_migrations(conn: Any) -> list[str]:
    """Apply pending migrations on `conn`. Returns the changes that were made.

    Takes an open connection instead of opening one so it can be called from
    inside the connection factory without recursing.
    """
    applied: list[str] = []
    cursor = conn.cursor()
    try:
        for table, column, ddl in _ADD_COLUMNS:
            # A database that has not run schema.sql yet is not our problem to
            # fix here; skip rather than fail the whole request.
            if not _table_exists(cursor, table):
                continue
            if _column_exists(cursor, table, column):
                continue
            cursor.execute(f"ALTER TABLE {table} {ddl}")
            applied.append(f"{table}.{column}")
        conn.commit()
    finally:
        cursor.close()
    return applied
