'use strict'

module.exports = {load}

const resolve = require('resolve')
const path = require('path')

const instantiate = require('./instantiate')
const hotRequire = require('./hot-require')

function load (filename, overrides = {}) {
  // take a path + object, turn it into real objects
  const dirname = path.dirname(filename)
  const settings = Object.assign({
    NAME: 'spife',
    IS_EXTERNAL: true,
    METRICS: null,
    REQUEST_ID_HEADERS: ['request-id'],
    ON_CLIENT_ERROR: () => {},
    MIDDLEWARE: [],
    ROUTER: null,
    PORT: null,
    HOST: null,
    NODE_ENV: process.env.NODE_ENV || 'development',
    DEBUG: false,
    HOT: false
  }, require(filename), overrides)

  if (!settings.ROUTER) {
    throw new Error('spife settings files should specify a ROUTER value')
  }

  if (settings.HOT) {
    hotRequire(filename, settings)
  }

  // Only apply the stall check if explicitly requested in test mode.
  // otherwise only apply when we are in dev mode and our output is a
  // terminal.
  const shouldApplyStallCheck = (
    (settings.TEST && Number(process.env.STALL_TIMEOUT_MS)) ||
    (/dev/.test(settings.NODE_ENV) && process.stdout.isTTY)
  )

  if (shouldApplyStallCheck) {
    const stallLatency = Number(process.env.STALL_TIMEOUT_MS) || 1000
    const serverStack = []
    const requestStack = []
    const viewStack = []
    const bodyStack = []

    const lifecycle = (stack, layer) => {
      return async (...args) => {
        stack.push(Array.isArray(layer) ? layer[0] : layer)
        try {
          return await args[args.length - 1](...args.slice(0, -1))
        } finally {
          stack.pop()
        }
      }
    }

    settings.MIDDLEWARE = settings.MIDDLEWARE.reduce((acc, xs) => {
      return [...acc, {
        processServer: lifecycle(serverStack, xs),
        processRequest: lifecycle(requestStack, xs),
        processView: lifecycle(viewStack, xs),
        processBody: lifecycle(bodyStack, xs)
      }, xs]
    }, [])

    settings.MIDDLEWARE.push({
      processServer: lifecycle(serverStack, '(waiting for server close)'),
      processRequest: lifecycle(requestStack, '(waiting on processView)'),
      processView: lifecycle(viewStack, '(waiting on view function)')
    })
    settings.MIDDLEWARE.unshift({
      async processRequest (req, next) {
        const timer = setTimeout(() => {
          console.error(`= = = = = = POSSIBLE STALL (STALL_TIMEOUT_MS=${stallLatency}) = = = = = =`)
          console.error(' - processServer: ' + serverStack[serverStack.length - 1])
          console.error(' - processRequest: ' + requestStack[requestStack.length - 1])
          if (viewStack.length) {
            console.error(' - processView: ' + viewStack[viewStack.length - 1])
          }

          if (bodyStack.length) {
            console.error(' - processBody: ' + bodyStack[bodyStack.length - 1])
          }
          console.error('- - - - - - - - - - - - - - - - - - -')
        }, stallLatency)

        try {
          return await next(req)
        } finally {
          clearTimeout(timer)
        }
      }
    })
  }

  settings.MIDDLEWARE = settings.MIDDLEWARE.map(
    xs => instantiate(dirname, xs)
  )

  const routerFile = resolve.sync(settings.ROUTER, {basedir: dirname})
  settings.ROUTER = require(routerFile)

  return settings
}
