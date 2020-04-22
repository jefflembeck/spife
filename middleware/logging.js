'use strict'

module.exports = createLoggingMiddleware

const createPrinter = require('@npm/spife-dev-logger')

const bole = require('../logging')
const reply = require('../reply')

const logger = bole('request')

function createLoggingMiddleware (opts) {
  opts = Object.assign({
    level: 'info',
    stream: null
  }, opts || {})

  const isDev = (
    process.stdout.isTTY &&
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'staging'
  )

  return {
    processServer (server, next) {
      if (opts.stream === null) {
        const pretty = createPrinter()
        opts.stream = (
          isDev
          ? (pretty.pipe(process.stdout), pretty)
          : process.stdout
        )
      }
      bole.output(opts)
      return next(server).then(() => {
        bole.reset()
      })
    },

    processRequest (req, next) {
      if (isDev) {
        req._logRaw()
      }
      return next(req).then(res => {
        logger.info({
          ip: req.remoteAddress,
          url: req.url,
          statusCode: reply.status(res) || 200,
          headers: reply.headers(res),
          method: req.method,
          latency: req.latency
        })

        return res
      }).catch(err => {
        const status = reply.status(err) || 500
        logger.info({
          ip: req.remoteAddress,
          url: req.url,
          statusCode: status,
          error: err.message,
          headers: reply.headers(err),
          method: req.method,
          latency: req.latency
        })

        if (status >= 500) {
          logger.error(err)
        }

        throw err
      })
    }
  }
}
