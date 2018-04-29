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
    processSuite (suite, next) {
      pool = new pg.Pool(opts)
      return next(suite)
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
          let result = null

          db.transaction(async () => {
            session = db.session
            result = await testcase(...args)
            throw new Error('rollback')
          })().catch(() => {})

          return result
        }, args)
      })
    },

    processRequest (req, next) {
      session.assign(process.domain)
      return db.atomic(() => {
        return next(req)
      })
    }
  }
}
