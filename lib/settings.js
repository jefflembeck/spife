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

  settings.MIDDLEWARE = settings.MIDDLEWARE.map(
    xs => instantiate(dirname, xs)
  )

  // 
  if (settings.NODE_ENV === 'development') {
    const serverStack = []
    const requestStack = []
    const viewStack = []
    const bodyStack = []

    const lifecycle = (stack, layer) => {
      return async (...args) => {
        stack.push(layer)
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
      processView: lifecycle(viewStack, '(view)')
    })
    settings.MIDDLEWARE.unshift({
      processRequest (req, next) {
        const timer = setTimeout(() => {
          logger.error('detected possible stall (after 1 second):')
          logger.error(' - processServer: ' + serverStack[serverStack.length - 1])
          logger.error(' - processRequest: ' + requestStack[requestStack.length - 1])
          logger.error(' - processView: ' + viewStack[viewStack.length - 1])
          if (bodyStack.length) {
            logger.error(' - processBody: ' + bodyStack[bodyStack.length - 1])
          }
        }, 1000)
      }
    })
  }

  const routerFile = resolve.sync(settings.ROUTER, {basedir: dirname})
  settings.ROUTER = require(routerFile)

  return settings
}
