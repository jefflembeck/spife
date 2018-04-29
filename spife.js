'use strict'

module.exports = makeSpife

const Promise = require('bluebird')

const STATUS_SYM = Symbol.for('spife-http-status')
const HEADER_SYM = Symbol.for('spife-http-header')

function makeSpife (name, server, urls, middleware, opts) {
  opts = Object.assign({
    metrics: null,
    isExternal: true,
    requestIDHeaders: ['request-id'],
    onclienterror: () => {},
    settings: {}
  }, opts || {})

  middleware = middleware || []

  // side-effects! (setting middleware starts the server.)
  const spife = new Server(
    name,
    server,
    urls,
    middleware || [],
    opts
  )

  return spife.onready
}

