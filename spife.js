'use strict'

module.exports = makeSpife

const Server = require('./lib/server')

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
