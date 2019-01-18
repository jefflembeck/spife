'use strict'

module.exports = createDatabaseMW

const concat = require('concat-stream')
const pg = require('../db/connection')
const hooks = require('../lib/hooks')
const db = require('../db/session')
const reply = require('../reply')
const orm = require('../db/orm')

function createDatabaseMW (opts) {
  let pool = null
  let session = null
  let dbsession = null

  return {
    async processSuite (suite, next) {
      pool = new pg.Pool(opts)
      db.setup(hooks.getSession)
      await next(suite)
      await pool.end()
    },

    processTestcase (suite, testcase, args, next) {
      session = hooks.startSession()
      db.install(async () => {
        const connection = await pool.connect()
        return {connection, release: connection.release}
      })
      orm.setConnection(db.getConnection)

      return next(suite, (...args) => {
        let deferred = null
        const onresult = new Promise((resolve, reject) => {
          deferred = {resolve, reject}
        })
        onresult.catch(() => null)

        const rollback = new Error()
        const txn = db.transaction(async () => {
          dbsession = db.session
          try {
            deferred.resolve(testcase(...args))
          } catch (err) {
            deferred.reject(err)
          }

          // wait for the test to finish...
          await onresult.catch(() => {})
          throw rollback
        })

        txn().catch(err => {
          // if we caught an error that wasn't "rollback", it's probably an
          // issue connecting to postgres that we should forward along.
          if (err !== rollback) {
            throw err
          }
        })

        session.end()
        return onresult
      }, args)
    },

    processRequest (req, next) {
      dbsession.assign(hooks.getSession())
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
