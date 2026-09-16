import type { Client, InValue } from '@libsql/client';
import type { Statement, Storage } from './storage';

// The existing prepared SQLite queries run unchanged on Turso/libSQL.
export function libsqlStorage(client: Client): Storage {
  function prepare(sql: string, args: InValue[] = []): Statement {
    return {
      bind: (...values) => prepare(sql, values),
      async first<T>() {
        const result = await client.execute({ sql, args });
        return result.rows.length ? (result.rows[0] as unknown as T) : null;
      },
      async all<T>() {
        const result = await client.execute({ sql, args });
        return { results: result.rows as unknown as T[] };
      },
      async run() {
        const result = await client.execute({ sql, args });
        return { meta: { changes: result.rowsAffected } };
      },
    };
  }
  return { prepare };
}
