export const tstz = () =>
  process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';

export const inet = () =>
  process.env.NODE_ENV === 'test' ? 'varchar' : 'inet';

export const enumType = () =>
  process.env.NODE_ENV === 'test' ? 'varchar' : 'enum';

export const isSqlite = () => process.env.NODE_ENV === 'test';

/** Returns `datetime('now')` for SQLite or `now()` for Postgres */
export const nowFn = () => (isSqlite() ? "datetime('now')" : 'now()');

/**
 * Convert PostgreSQL positional params ($1, $2, ...) to SQLite (?, ?, ...)
 * Call with a raw SQL string; returns the adjusted string.
 */
export const sqlParams = (sql: string): string => {
  if (!isSqlite()) return sql;
  return sql.replace(/\$\d+/g, '?');
};
