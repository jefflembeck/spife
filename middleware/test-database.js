'use strict'

module.exports = createDatabaseMW

const pg = require('../db/connection')
const db = require('../db/session')
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

          txn().catch(err => {
            // if we caught an error that wasn't "rollback", it's probably an
            // issue connecting to postgres that we should forward along.
            if (err !== rollback) {
              throw err
            }
          })

          return onresult
        }, args)
      })
    },

    processRequest (req, next) {
      session.assign(process.domain)
      return db.atomic(() => {
        return next(req)
      })()
    }
  }
}
