'use strict'

const range = require('range-parser')
const MiniPass = require('minipass')
const Promise = require('bluebird')
const accepts = require('accepts')
const cookie = require('cookie')
const uuid = require('uuid')
const url = require('url')

const ResponseStandin = require('./response-standin')
const hooks = require('./hooks')

const SPIFE_TO_REQ_SYM = Symbol('req')
const SPIFE_TO_IMPL_SYM = Symbol('impl')

const logger = require('../logging')('request')

class SpifeRequest {
  constructor (req, server, parsed) {
    this[SPIFE_TO_REQ_SYM] = req
    this[SPIFE_TO_IMPL_SYM] = new Impl(this, server, parsed)
  }

  get router () {
    return this[SPIFE_TO_IMPL_SYM].router
  }

  set router (v) {
    const impl = this[SPIFE_TO_IMPL_SYM]
    impl.router = v
  }

  cookies () {
    return this[SPIFE_TO_IMPL_SYM].cookies()
  }

  cookie (name) {
    return this[SPIFE_TO_IMPL_SYM].cookie(name)
  }

  get remoteAddress () {
    return this[SPIFE_TO_REQ_SYM].connection.remoteAddress
  }

  get remoteFamily () {
    return this[SPIFE_TO_REQ_SYM].connection.remoteFamily
  }

  get remotePort () {
    return this[SPIFE_TO_REQ_SYM].connection.remotePort
  }

  get latency () {
    return Date.now() - this[SPIFE_TO_IMPL_SYM].start
  }

  get start () {
    return this[SPIFE_TO_IMPL_SYM].start
  }

  get viewName () {
    return this[SPIFE_TO_IMPL_SYM].viewName
  }

  set viewName (v) {
    this[SPIFE_TO_IMPL_SYM].viewName = v
  }

  createResponseStandin () {
    return new ResponseStandin()
  }

  _logRaw (data) {
    return logger.info(this[SPIFE_TO_REQ_SYM])
  }

  get raw () {
    this[SPIFE_TO_IMPL_SYM].disableBody(new Error(
      'Cannot read the body if "raw" has been accessed.'
    ))
    const req = this[SPIFE_TO_REQ_SYM]
    _claim(req)
    return req
  }
  get pipe () {
    return () => {
      return this.raw.pipe.apply(this.raw, arguments)
    }
  }
  get id () {
    return this[SPIFE_TO_IMPL_SYM].id
  }
  get body () {
    return this[SPIFE_TO_IMPL_SYM].getBody()
  }
  get headers () {
    return this[SPIFE_TO_REQ_SYM].headers
  }
  get rawHeaders () {
    return this[SPIFE_TO_REQ_SYM].rawHeaders
  }
  get urlObject () {
    return this[SPIFE_TO_IMPL_SYM].parsedURL
  }
  get url () {
    return this[SPIFE_TO_REQ_SYM].url
  }

  set url (u) {
    const req = this[SPIFE_TO_REQ_SYM]
    if (req.url === u) {
      return u
    }
    req.url = u
    const impl = this[SPIFE_TO_IMPL_SYM]
    impl.parsedURL = url.parse(u, true)
    return u
  }

  get query () {
    return this[SPIFE_TO_IMPL_SYM].parsedURL.query
  }

  get method () {
    return this[SPIFE_TO_REQ_SYM].method
  }
  set method (m) {
    const req = this[SPIFE_TO_REQ_SYM]
    req.method = m
    return m
  }

  get httpVersion () {
    return this[SPIFE_TO_REQ_SYM].httpVersion
  }
  getRanges (size, opts) {
    if (size) {
      return range(size, this.headers.ranges || '', opts)
    }
    return range(Infinity, this.headers.ranges || '', opts)
  }
  get accept () {
    return this[SPIFE_TO_IMPL_SYM].getAccepts()
  }
}

module.exports = SpifeRequest

class Impl {
  constructor (kreq, server, parsedURL) {
    this.kreq = kreq
    this.server = server
    this.parsedURL = parsedURL
    this._id = null
    this.body = null
    this.accept = null
    this.viewName = null
    this._cookies = undefined
    this.router = server.router
    this.start = Date.now()
  }

  get id () {
    if (this._id) {
      return this._id
    }
    this._id = (
      this.kreq[SPIFE_TO_REQ_SYM].headers['request-id'] || generateID()
    )
    return this._id
  }

  _getBody () {
    const req = this.kreq[SPIFE_TO_REQ_SYM]
    _claim(req)

    return this.server.processBodyOnion(
      this.kreq,
      req.pipe(new MiniPass())
    )
  }

  cookie (name) {
    if (this._cookies === undefined) {
      this._cookies = (
        this.kreq.headers.cookie
        ? _parseCookieHeader(this.kreq.headers.cookie)
        : null
      )
    }

    if (!this._cookies) {
      return null
    }
    if (name in this._cookies) {
      return this._cookies[name]
    }
    return null
  }

  cookies () {
    if (this._cookies === undefined) {
      this._cookies = (
        this.kreq.headers.cookie
        ? _parseCookieHeader(this.kreq.headers.cookie)
        : null
      )
    }

    if (!this._cookies) {
      return null
    }

    return Object.assign({}, this._cookies)
  }

  getAccepts () {
    if (this.accept) {
      return this.accept
    }
    this.accept = accepts(this.kreq[SPIFE_TO_REQ_SYM])
    return this.accept
  }
  getBody () {
    if (this.body) {
      return this.body
    }
    this.body = this._getBody()
    return this.body
  }
  disableBody (reason) {
    this._getBody = () => getDisabledBody(reason)
  }
}

function _claim (req) {
  const EE = require('events')
  const session = hooks.getSession()
  if (session) {
    EE.prototype.on.call(req, 'error', () => session.claim())
    EE.prototype.on.call(req, 'close', () => session.claim())
    EE.prototype.on.call(req, 'data', () => session.claim())
    EE.prototype.on.call(req, 'end', () => session.claim())
  }
}

const ID_SCRATCH_BUFFER = Buffer.alloc(16)
function generateID () {
  uuid.v4(null, ID_SCRATCH_BUFFER)
  return String(ID_SCRATCH_BUFFER.toString('base64'))
}

function getDisabledBody (reason) {
  /* eslint-disable promise/param-names */
  return new Promise((_, reject) => {
    setImmediate(() => reject(reason))
  })
  /* eslint-enable promise/param-names */
}

function _parseCookieHeader (header) {
  return (Array.isArray(header) ? header : header.split(',')).map(
    xs => cookie.parse(xs)
  ).reduce((lhs, rhs) => Object.assign(lhs, rhs), {})
}
