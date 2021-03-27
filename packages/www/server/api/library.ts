import { sql } from '@databases/pg'
import { FastifyPluginAsync } from 'fastify'
import S from 'jsonschema-definer'
import shortUUID from 'short-uuid'

import { QSplit } from '../db/token'
import { db } from '../shared'

const libraryRouter: FastifyPluginAsync = async (f) => {
  {
    const sQuery = S.shape({
      id: S.string(),
    })

    const sResult = S.shape({
      entry: S.list(S.string()),
      title: S.string(),
      type: S.string(),
      description: S.string(),
      tag: S.list(S.string()),
    })

    f.get<{
      Querystring: typeof sQuery.type
    }>(
      '/',
      {
        schema: {
          operationId: 'libraryGetOne',
          querystring: sQuery.valueOf(),
          response: {
            200: sResult.valueOf(),
          },
        },
      },
      async (req): Promise<typeof sResult.type> => {
        const { id } = req.query

        const userId: string = req.session.get('userId')
        if (!userId) {
          throw { statusCode: 401 }
        }

        const [r] = await db
          .query(
            sql`
        SELECT
          "entry",
          "title",
          "type",
          "description",
          "tag"
        FROM "library"
        WHERE "userId" = ${userId} AND "id" = ${id}
        `
          )
          .then((rs) =>
            rs.map((r) => {
              return {
                entry: r.entry,
                title: r.title,
                type: r.type,
                description: r.description,
                tag: r.tag,
              }
            })
          )

        if (!r) {
          throw { statusCode: 404 }
        }

        return r
      }
    )
  }

  {
    const sQuery = S.shape({
      q: S.string(),
      page: S.integer().optional(),
      limit: S.integer().optional(),
    })

    const sResult = S.shape({
      result: S.list(
        S.shape({
          id: S.string().optional(),
          entry: S.list(S.string()),
          title: S.string(),
          type: S.string(),
          description: S.string(),
          tag: S.list(S.string()),
        })
      ),
    })

    const makeZh = new QSplit({
      default(v) {
        return sql`(${sql.join(
          [
            this.fields.entry[':'](v),
            this.fields.title[':'](v),
            this.fields.description[':'](v),
            this.fields.tag[':'](v),
          ],
          ' OR '
        )})`
      },
      fields: {
        entry: { ':': (v) => sql`"entry_zh" &@ ${v}` },
        title: { ':': (v) => sql`"title" &@ ${v}` },
        type: {
          ':': (v) => {
            if (v === 'hanzi' || v === 'kanji') v = 'character'
            return sql`"type" = ${v}`
          },
        },
        description: { ':': (v) => sql`"description" &@ ${v}` },
        tag: { ':': (v) => sql`"tag " &@ ${v}` },
      },
    })

    f.get<{
      Querystring: typeof sQuery.type
    }>(
      '/q',
      {
        schema: {
          operationId: 'libraryQuery',
          querystring: sQuery.valueOf(),
          response: {
            200: sResult.valueOf(),
          },
        },
      },
      async (req): Promise<typeof sResult.type> => {
        const { q, page = 1, limit = 10 } = req.query

        const userId: string = req.session.get('userId')
        if (!userId) {
          throw { statusCode: 401 }
        }

        const result = await db
          .query(
            sql`
          SELECT
            "entry",
            "title",
            "type",
            "description",
            "tag"
          FROM "library"
          WHERE "userId" = ${userId} AND "entry" IS NOT NULL AND ${
              makeZh.parse(q) || sql`TRUE`
            }
          ORDER BY "updatedAt" DESC
          OFFSET ${(page - 1) * limit}
          LIMIT ${limit}
          `
          )
          .then((rs) =>
            rs.map((r) => {
              return {
                id: r.id || undefined,
                entry: r.entry,
                title: r.title,
                type: r.type,
                description: r.description,
                tag: r.tag,
              }
            })
          )

        return { result }
      }
    )
  }

  {
    const sBody = S.shape({
      entry: S.list(S.string()),
      title: S.string(),
      type: S.string(),
      description: S.string(),
      tag: S.list(S.string()),
    })

    const sResult = S.shape({
      id: S.string(),
    })

    f.put<{
      Body: typeof sBody.type
    }>(
      '/',
      {
        schema: {
          operationId: 'libraryCreate',
          body: sBody.valueOf(),
          response: {
            201: sResult.valueOf(),
          },
        },
      },
      async (req, reply): Promise<typeof sResult.type> => {
        const { title, type, description, tag, entry } = req.body

        const userId: string = req.session.get('userId')
        if (!userId) {
          throw { statusCode: 401 }
        }

        const id = await db.tx(async (db) => {
          const id = shortUUID.uuid()

          await db.query(sql`
          INSERT INTO "library" ("id", "userId", "title", "type", "description", "tag", "entry")
          VALUES (${id}, ${userId} ${title}, ${type}, ${description}, ${tag}, ${entry})
          `)

          return id
        })

        reply.status(201)
        return { id }
      }
    )
  }

  {
    const sQuery = S.shape({
      id: S.string(),
    })

    const sBody = S.shape({
      entry: S.list(S.string()).optional(),
      title: S.string().optional(),
      type: S.string().optional(),
      description: S.string().optional(),
      tag: S.list(S.string()).optional(),
    })

    const sResult = S.shape({
      result: S.string(),
    })

    f.patch<{
      Querystring: typeof sQuery.type
      Body: typeof sBody.type
    }>(
      '/',
      {
        schema: {
          operationId: 'libraryUpdate',
          querystring: sQuery.valueOf(),
          body: sBody.valueOf(),
          response: {
            201: sResult.valueOf(),
          },
        },
      },
      async (req, reply): Promise<typeof sResult.type> => {
        const { id } = req.query
        const { title, type, description, tag, entry } = req.body

        const userId: string = req.session.get('userId')
        if (!userId) {
          throw { statusCode: 401 }
        }

        await db.tx(async (db) => {
          await db.query(sql`
          UPDATE "library"
          SET ${sql.join(
            [
              ...(typeof title !== 'undefined'
                ? [sql`"title" = ${title}`]
                : []),
              ...(typeof type !== 'undefined' ? [sql`"type" = ${type}`] : []),
              ...(typeof description !== 'undefined'
                ? [sql`"description" = ${description}`]
                : []),
              ...(typeof tag !== 'undefined' ? [sql`"tag" = ${tag}`] : []),
              ...(typeof entry !== 'undefined'
                ? [sql`"entry" = ${entry}`]
                : []),
            ],
            ','
          )}
          WHERE ${userId} = "userId" AND "id" = ${id}
          `)
        })

        reply.status(201)
        return {
          result: 'updated',
        }
      }
    )
  }

  {
    const sQuery = S.shape({
      id: S.string(),
    })

    const sResult = S.shape({
      result: S.string(),
    })

    f.delete<{
      Querystring: typeof sQuery.type
    }>(
      '/',
      {
        schema: {
          operationId: 'libraryDelete',
          querystring: sQuery.valueOf(),
          response: {
            201: sResult.valueOf(),
          },
        },
      },
      async (req, reply): Promise<typeof sResult.type> => {
        const { id } = req.query

        const userId: string = req.session.get('userId')
        if (!userId) {
          throw { statusCode: 401 }
        }

        await db.tx(async (db) => {
          await db.query(sql`
          DELETE FROM "library"
          WHERE ${userId} = "userId" AND "id" = ${id}
          `)
        })

        reply.status(201)
        return {
          result: 'deleted',
        }
      }
    )
  }
}

export default libraryRouter
