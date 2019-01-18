'use strict'

module.exports = createDatabaseMiddleware

const { getNamespace } = require('continuation-local-storage')
const Promise = require('bluebird')

const hooks = require('../lib/hooks')

const pg = require('../db/connection')
const db = require('../db/session')
const orm = require('../db/orm')

const logger = require('../logging')('database')

function createDatabaseMiddleware (opts) {
  opts = opts || {}
  opts.postgres = opts.postgres || {}
  var poolTimer = null
  var pool = null
  return {
    processServer (spife, next) {
      orm.setConnection(db.getConnection)

      /*
      orm.setConnection(async () => {
        const session = hooks.getSession()
        const connection = await pool.connect()
        // this connection might've been opened by a previous session.
        // we want to claim the connection as our own, now.
        const newSession = hooks.getSession()
        if (newSession !== session) {
          if (newSession) {
            newSession.release()
          }
          session.claim()
        }

        return {
          connection,
          release () {
            connection.release()
          }
        }
      })
      */

      pool = new pg.Pool(opts.postgres)
      pool.on('error', err => {
        logger.error('pool client received error:')
        logger.error(err)
      })

      const dbMetricsInterval = (
        Number(process.env.PROCESS_METRICS_INTERVAL) ||
        1000
      )

      poolTimer = setInterval(() => {
        process.emit('metric', {
          'name': `${spife.name}.pg-pool-available`,
          'value': pool.pool.availableObjectsCount()
        })
        process.emit('metric', {
          'name': `${spife.name}.pg-pool-waiting`,
          'value': pool.pool.waitingClientsCount()
        })
      }, dbMetricsInterval)

      return next(spife).then(() => {
        clearInterval(poolTimer)
        const closed = pool.end()
        pool = null
        return closed
      })
    },

    processRequest (request, next) {
      db.install(hooks.getSession(), () => {
        return new Promise((resolve, reject) => {
          pool.connect((err, connection, release) => {
            err ? reject(err) : resolve({connection, release})
          })
        })
      }, Object.assign(
        {getContext: hooks.getSession},
        {maxConcurrency: opts.maxConnectionsPerRequest}
      ))
      return next(request)
    },

    processView (req, match, context, next) {
      // db.session.viewName = req.viewName
      return next(req, match, context)
    }
  }
}
