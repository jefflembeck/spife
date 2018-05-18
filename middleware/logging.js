'use strict'

module.exports = createLoggingMiddleware

const createPrinter = require('@npm/spife-dev-logger')
const logstring = require('common-log-string')

const bole = require('../logging')
const reply = require('../reply')

const logger = bole('request')

function createLoggingMiddleware (opts) {
  opts = Object.assign({
    level: 'info',
    stream: null
  }, opts || {})

  return {
    processServer (server, next) {
      if (opts.stream === null) {
        const pretty = createPrinter()
        opts.stream = (
          process.stdout.isTTY &&
          process.env.ENVIRONMENT !== 'production' &&
          process.env.ENVIRONMENT !== 'staging'
        ) ? (pretty.pipe(process.stdout), pretty) : process.stdout
      }
      bole.output(opts)
      return next(server).then(() => {
        bole.reset()
      })
    },

    processRequest (req, next) {
      const defaultToCommonLog = process.env.ENVIRONMENT === 'production' || process.env.ENVIRONMENT === 'staging'

      req._logRaw()
      return next(req).then(res => {
        const statusCode = reply.status(res) || 200
        const output = defaultToCommonLog
          ? logstring(req, Object.assign({}, res, { statusCode }))
          : {
            url: req.url,
            statusCode,
            headers: reply.headers(res),
            method: req.method,
            latency: req.latency,
            common: logstring(req, Object.assign({}, res, { statusCode }))
          }

        logger.info(output)

        return res
      }).catch(err => {
        const statusCode = reply.status(err) || 500
        const output = defaultToCommonLog
        ? logstring(req, Object.assign({}, err, { statusCode }))
        : {
          url: req.url,
          statusCode,
          error: err.message,
          headers: reply.headers(err),
          method: req.method,
          latency: req.latency,
          common: logstring(req, Object.assign({}, err, { statusCode }))
        }

        logger.info(output)

        if (statusCode >= 500) {
          defaultToCommonLog ? logger.error(output) : logger.error(err)
        }

        throw err
      })
    }
  }
}
