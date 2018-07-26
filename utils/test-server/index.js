'use strict'

module.exports = createTestServer

const {load} = require('../../lib/settings')
const Server = require('../../lib/server')
const onion = require('../../lib/onion')

const http = require('http')

const READY = Symbol('ready')
const START_SHUTDOWN = Symbol('start-shutdown')
const CANCEL_SHUTDOWN = Symbol('cancel-shutdown')
const READY_MAP = new WeakMap()

function _getonready (server) {
  return new Promise((resolve, reject) => {
    READY_MAP.set(server, {resolve, reject})
  })
}

class Suite {
  constructor (spife, processSuiteOnion, processTestcaseOnion) {
    this.onshutdown = new Promise((resolve, reject) => {
      this.shutdown = resolve
    })
    this.spife = spife
    this.spifeready = this.spife.onready
    this.onready = _getonready(this)
    this.onfinish = processSuiteOnion(this)
    this.processTestcase = processTestcaseOnion
    this.extant = 0
    this.timeout = null
  }

  isolate (fn) {
    ++this.extant
    this[CANCEL_SHUTDOWN]()
    return async (...args) => {
      await this.spifeready
      await this.onready

      try {
        return await this.processTestcase(this, fn, args)
      } finally {
        --this.extant
        if (this.extant === 0) {
          this[START_SHUTDOWN]()
        }
      }
    }
  }

  [START_SHUTDOWN] () {
    this.timeout = setTimeout(() => {
      this.shutdown()
    }, 5)
  }

  [CANCEL_SHUTDOWN] () {
    clearTimeout(this.timeout)
    this.timeout = null
  }

  [READY] () {
    const {resolve} = READY_MAP.get(this)
    resolve(this)
  }
}

function createTestServer (settingsPath, overrides) {
  const spife = _loadServer(settingsPath, overrides)

  const processSuite = []
  const processTestcase = [
    async function processTestcase (suite, fn, args, next) {
      const [err, result] = await next(suite, fn, args)
      if (err) {
        throw err
      }
      return result
    }
  ]

  for (const xs of spife._middleware) {
    if (typeof xs.processSuite === 'function') {
      processSuite.push(xs.processSuite.bind(xs))
    }

    if (typeof xs.processTestcase === 'function') {
      processTestcase.push(xs.processTestcase.bind(xs))
    }
  }

  const processSuiteOnion = onion.sprout(
    processSuite,
    async suite => {
      suite[READY]()
      await suite.onshutdown
    },
    1
  )

  const processTestcaseOnion = onion.sprout(
    processTestcase,
    async (suite, fn, args) => {
      try {
        return [null, await fn(...args)]
      } catch (err) {
        return [err, null]
      }
    },
    3
  )

  return new Suite(spife, processSuiteOnion, processTestcaseOnion)
}

function _loadServer (path, {
  middleware = [
    '@npm/spife/middleware/test-request-interceptor',
    '@npm/spife/middleware/test-inject-request',
    '@npm/spife/middleware/body-json'
  ],
  router = null
} = {}) {
  const settings = load(path, {
    HOT: false,
    MIDDLEWARE: middleware,
    ...(router ? {ROUTER: router} : {})
  })

  const server = http.createServer()
  const spife = new Server(
    'test-' + settings.NAME,
    server,
    router || settings.ROUTER,
    settings.MIDDLEWARE,
    {settings, isExternal: false, isTest: true, onclienterror: noop}
  )

  return spife
}

function noop () {
}
