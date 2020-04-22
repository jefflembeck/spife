'use strict'

const chain = require('@iterables/chain')
const Emitter = require('numbat-emitter')
const Promise = require('bluebird')
const url = require('url')

/* eslint-disable node/no-deprecated-api */
const domain = require('domain')
/* eslint-enable node/no-deprecated-api */

const middlewareRunner = require('./middleware-runner')
const domainToRequest = require('./domain-to-request')
const SpifeRequest = require('./request')
const reply = require('../reply')

const isDev = /^dev/.test(process.env.NODE_ENV)

const UNINSTALL = Symbol('uninstall')

const STATUS_SYM = Symbol.for('spife-http-status')
const HEADER_SYM = Symbol.for('spife-http-header')

const READY_MAP = new WeakMap()

function _getonready (server) {
  return new Promise((resolve, reject) => {
    READY_MAP.set(server, {resolve, reject})
  })
}

module.exports = class Server {
  constructor (name, server, router, middleware, opts) {
    this.name = name
    this.router = router
    this.server = server
    this.emitStreamError = this.server.emit.bind(this.server, 'response-error')
    this._middleware = null
    this.processBodyMWStack = null
    this.processServerMWStack = null
    this.processRequestMWStack = null
    this.opts = opts
    this.closed = null
    this.onrequest = this.onrequest.bind(this)
    this.onready = _getonready(this)
    this.onclienterror = opts.onclienterror.bind(this)
    this.metrics = (
      opts.metrics && typeof opts.metrics === 'object'
      ? opts.metrics
      : (
        typeof opts.metrics === 'string'
        ? createMetrics(this.name, opts.metrics)
        : (
          process.env.METRICS
          ? createMetrics(this.name, process.env.METRICS)
          : createFakeMetrics()
        )
      )
    )
    this.isTest = opts.isTest
    this.middleware = middleware
  }

  get urls () {
    return this.router
  }

  set urls (v) {
    this.router = v
  }

  uninstall () {
    this.server.removeAllListeners('request')
    this.server.removeAllListeners('clientError')
    this.server.emit(UNINSTALL)
    return this.closed
  }

  get middleware () {
    return this._middleware
  }

  set middleware (mw) {
    this._middleware = [...mw]

    const processServerMW = []
    const processRequestMW = [middlewareMembrane1]
    const processViewMW = [middlewareMembrane3]
    const processBodyMW = []

    for (const mwObj of this._middleware) {
      if (typeof mwObj.processServer === 'function') {
        processServerMW.push(mwObj.processServer.bind(mwObj))
      }

      if (typeof mwObj.processRequest === 'function') {
        processRequestMW.push(mwObj.processRequest.bind(mwObj))
        if (isDev) processRequestMW.push(devMiddlewareMembrane1)
        processRequestMW.push(middlewareMembrane1)
      }

      if (typeof mwObj.processView === 'function') {
        processViewMW.push(mwObj.processView.bind(mwObj))
        if (isDev) processViewMW.push(devMiddlewareMembrane3)
        processViewMW.push(middlewareMembrane3)
      }

      if (typeof mwObj.processBody === 'function') {
        processBodyMW.push(mwObj.processBody.bind(mwObj))
      }
    }

    const prevClosed = this.uninstall() || Promise.resolve()
    const onclosed = new Promise((resolve, reject) => {
      this.server.once(UNINSTALL, () => {
        this.server.removeListener('close', resolve)
        this.server.removeListener('error', reject)
        resolve()
      })
      this.server.once('close', resolve)
      this.server.once('error', reject)
    })

    this.processServerMWStack = middlewareRunner(
      processServerMW,
      () => {
        const {resolve} = READY_MAP.get(this)
        this.onready = _getonready(this)
        resolve(this)
        return onclosed
      }
    )

    this.processBodyMWStack = middlewareRunner(
      processBodyMW,
      async (req, result) => {
        throw new reply.UnsupportedMediaTypeError()
      }
    )

    const processViewMWStack = middlewareRunner(
      processViewMW,
      async (req, match, context) => {
        const response = await match.controller[match.name](
          req,
          context
        )
        return response || reply.empty()
      }
    )

    this.processRequestMWStack = middlewareRunner(
      processRequestMW,
      async req => {
        var match
        try {
          match = req.router.match(req.method, req.urlObject.pathname)
        } catch (err) {
          throw new reply.NotImplementedError(
            `"${req.method} ${req.urlObject.pathname}" is not implemented.`
          )
        }

        if (!match) {
          throw new reply.NoMatchError()
        }

        const viewName = []
        let items = []
        for (const entry of match) {
          items = chain(entry.context, items)
          viewName.unshift(entry.name)
        }
        const context = new Map(items)
        req.viewName = viewName.join('.')

        return Promise.resolve(processViewMWStack(req, match, context))
      }
    )

    return prevClosed.then(() => {
      this.server
        .on('request', this.onrequest)
        .on('clientError', this.onclienterror)
      this.closed = Promise.resolve(this.processServerMWStack(this))
    })
  }

  onrequest (req, res) {
    const subdomain = domain.create()
    const parsed = url.parse(req.url, true)
    const kreq = new SpifeRequest(req, this, parsed)
    subdomain.add(req)
    subdomain.add(res)
    subdomain.enter()
    domainToRequest.request = kreq

    return Promise.resolve(this.processRequestMWStack(kreq)).then(kres => {
      return handleResponse(this, kreq, kres)
    }).catch(err => {
      return handleLifecycleError(this, kreq, err)
    }).then(response => {
      res.writeHead(response.status || 200, response.headers)
      res.on('unpipe', destroyStreamOnClose)
      res.on('error', this.emitStreamError)
      response.stream.pipe(res)
      return Promise.race([
        new Promise(resolve => res.once('finish', resolve)),
        new Promise(resolve => res.once('close', resolve))
      ])
    }).finally(() => {
      // this is in place to mitigate the domain leak that occurs when any middleware or view throws
      // it is an ugly hack, but it's ours, and we kinda need it.
      domain._stack.length = 0
      process.domain = domain.active = null
    })
  }
}

function destroyStreamOnClose (stream) {
  if (stream.destroy) stream.destroy()
  else if (stream.close) stream.close()
  else stream.resume()
}

async function middlewareMembrane1 (req, next) {
  try {
    var result = await next(req)
    return checkMiddlewareResult(result)
  } catch (err) {
    throw checkMiddlewareError(err)
  }
}

function devMiddlewareMembrane1 (req, next) {
  if (!req) {
    throw new TypeError('you must pass args to next()!')
  }
  return next(req)
}

async function middlewareMembrane3 (req, match, context, next) {
  try {
    var result = await next(req, match, context)
    return checkMiddlewareResult(result)
  } catch (err) {
    throw checkMiddlewareError(err)
  }
}

function devMiddlewareMembrane3 (req, match, context, next) {
  if (!req || !match || !context) {
    throw new TypeError('you must pass args to next()!')
  }
  return next(req, match, context)
}

function checkMiddlewareResult (response) {
  if (!response) {
    throw new TypeError(
      `Expected middleware to resolve to a truthy value, got "${response}" instead`
    )
  }

  // always cast into a response of some sort
  if (typeof response !== 'object') {
    return reply(response)
  }

  // it's already an object, let us use privileged APIs
  // to set the status/headers.
  if (!response[STATUS_SYM]) {
    response[STATUS_SYM] = 200
  }

  if (!response[HEADER_SYM]) {
    response[HEADER_SYM] = {}
  }

  return response
}

function checkMiddlewareError (err) {
  if (!err || !(err instanceof Error)) {
    throw new TypeError(
      `Expected error to be instanceof Error, got "${err}" instead`
    )
  }

  throw reply(
    err,
    err[STATUS_SYM] || 500,
    err[HEADER_SYM] || {}
  )
}

function handleLifecycleError (spife, req, err) {
  const out = reply(
    Object.assign(
      {message: err.message},
      spife.opts.isExternal ? {} : {stack: err.stack},
      err.context || {}
    ),
    err[STATUS_SYM] || 500,
    err[HEADER_SYM] || {}
  )
  return handleResponse(spife, req, out)
}

function handleResponse (spife, req, data) {
  try {
    const stream = reply.toStream(data)
    if (!spife.opts.isExternal) {
      reply.header(stream, 'request-id', req.id)
    }
    return {
      status: stream[STATUS_SYM],
      headers: stream[HEADER_SYM],
      stream
    }
  } catch (err) {
    return handleLifecycleError(spife, req, err)
  }
}

function createMetrics (name, str) {
  const emitter = new Emitter({
    app: name,
    uri: str
  })
  if (Emitter.setGlobalEmitter) {
    Emitter.setGlobalEmitter(emitter)
  }
  return emitter
}

function createFakeMetrics () {
  return {metric () { }}
}
