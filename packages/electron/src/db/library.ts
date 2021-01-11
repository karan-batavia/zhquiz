import { Ulid } from 'id128'

import { g } from '../shared'

export interface IDbLibrary {
  title: string
  entries: string[]
  description?: string
  tag?: string
}

export class DbLibrary {
  static tableName = 'library'

  static init() {
    g.server.db.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS [${this.tableName}] (
        id          TEXT PRIMARY KEY,
        createdAt   INT strftime('%s','now'),
        updatedAt   INT strftime('%s','now'),
        title       TEXT,
        entries     JSON
      );

      CREATE TRIGGER IF NOT EXISTS t_${this.tableName}_updatedAt
        AFTER UPDATE ON [${this.tableName}]
        WHEN NEW.updatedAt IS NULL
        FOR EACH ROW BEGIN
          UPDATE [${this.tableName}] SET updatedAt = strftime('%s','now') WHERE id = NEW.id
        END;

      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}_q USING fts5(
        id,
        title,
        [entry],
        [description],
        tag
      );
    `)
  }

  static create(...items: IDbLibrary[]) {
    const out: DbLibrary[] = []

    g.server.db.transaction(() => {
      const stmt = g.server.db.prepare<{
        id: string
        title: string
        entries: string
      }>(/* sql */ `
        INSERT INTO [${this.tableName}] (id, title, entries)
        VALUES (@id, @title, @entries)
      `)

      const stmtQ = g.server.db.prepare<{
        id: string
        title: string
        entry: string
        description: string
        tag: string
      }>(/* sql */ `
        INSERT INTO ${this.tableName}_q (id, title, [entry], [description], tag)
        VALUES (
          @id,
          jieba(@title),
          @entry,
          @description,
          @tag
        )
      `)

      items.map((it) => {
        const id = Ulid.generate().toCanonical()

        stmt.run({
          id,
          title: it.title,
          entries: JSON.stringify(it.entries)
        })

        stmtQ.run({
          id,
          title: it.title,
          entry: it.entries.join(' '),
          description: it.description || '',
          tag: it.tag || ''
        })

        out.push(
          new DbLibrary({
            ...it,
            id
          })
        )
      })
    })()

    return out
  }

  private constructor(public entry: Partial<IDbLibrary> & { id: string }) {
    if (!entry.id) {
      throw new Error('no entry id')
    }
  }
}
