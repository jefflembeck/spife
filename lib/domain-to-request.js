'use strict'

const hooks = require('./hooks')

module.exports = {
  get request () {
    const session = hooks.getSession()
    if (!session) {
      return null
    }

    const req = session.request
    if (!req) {
      return null
    }

    return req
  },
  set request (req) {
    const session = hooks.getSession()
    if (!session) {
      return null
    }

    session.request = req
  }
}
