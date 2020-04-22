'use strict'

module.exports = createDatabaseMW

const concat = require('concat-stream')
const pg = require('../db/connection')
const db = require('../db/session')
const reply = require('../reply')
const orm = require('../db/orm')

/* eslint-disable node/no-deprecated-api */
const domain = require('domain')
/* eslint-enable node/no-deprecated-api */

function createDatabaseMW (opts) {
  let pool = null
  let session = null

  return {
    async processSuite (suite, next) {
      pool = new pg.Pool(opts)
      await next(suite)
      await pool.end()
    },

    processTestcase (suite, testcase, args, next) {
      const d = domain.create()
      db.install(d, async () => {
        const connection = await pool.connect()
        return {connection, release: connection.release}
      })
      orm.setConnection(db.getConnection)

      return d.run(() => {
        return next(suite, (...args) => {
          let deferred = null
          const onresult = new Promise((resolve, reject) => {
            deferred = {resolve, reject}
          })
          onresult.catch(() => null)

          const rollback = new Error()
          const txn = db.transaction(async () => {
            session = db.session
            try {
              deferred.resolve(testcase(...args))
            } catch (err) {
              deferred.reject(err)
            }

            // wait for the test to finish...
            await onresult.catch(() => {})
            throw rollback
          })

          return Promise.all([
            onresult,
            txn().catch(err => {
              // if we caught an error that wasn't "rollback", it's probably an
              // issue connecting to postgres that we should forward along.
              if (err !== rollback) {
                throw err
              }
            })
          ])
        }, args)
      })
    },

    processRequest (req, next) {
      session.assign(process.domain)
      return db.atomic(async () => {
        const resp = await next(req)
        if (!resp || !resp.pipe) {
          return resp
        }

        const stream = reply.toStream(resp)
        const result = await {
          then (ondata, onerror) {
            stream
              .on('error', onerror)
              .pipe(concat(ondata))
              .on('error', onerror)
          }
        }

        return reply(result, reply.status(stream), reply.headers(stream))
      })()
    }
  }
}
