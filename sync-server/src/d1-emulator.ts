import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement } from './app.js';

export class D1Emulator implements D1Database {
  private db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL');
  }

  prepare(query: string): D1PreparedStatement {
    const createBoundStatement = (boundValues: unknown[]): D1PreparedStatement => ({
      bind: (...values: unknown[]) => createBoundStatement(values),
      first: async <T = Record<string, unknown>>() => {
        const stmt = this.db.prepare(query);
        const result = stmt.get(...boundValues) as T | undefined;
        return result ?? null;
      },
      all: async <T = Record<string, unknown>>() => {
        const stmt = this.db.prepare(query);
        const results = stmt.all(...boundValues) as T[];
        return { results };
      },
      run: async () => {
        const stmt = this.db.prepare(query);
        stmt.run(...boundValues);
        return {};
      }
    });
    return createBoundStatement([]);
  }

  async batch(statements: D1PreparedStatement[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const stmt of statements) {
      await stmt.run();
      results.push({});
    }
    return results;
  }
}
