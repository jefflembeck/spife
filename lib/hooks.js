'use strict'

const { executionAsyncId, triggerAsyncId, createHook } = require('async_hooks')

let sessions = null
const hooks = createHook({
  init (asyncId, type, triggerAsyncId, resource) {
    var session = sessions
    while (session) {
      if (session.has(triggerAsyncId)) {
        session.add(asyncId)
        return
      }
      session = session.next
    }
  },

  destroy (asyncId) {
    var session = sessions
    while (session) {
      if (session.has(asyncId)) {
        session.delete(asyncId)
        return
      }
      session = session.next
    }
  }
})

hooks.enable()

module.exports = {
  startSession,
  getSession
}

class Session {
  constructor () {
    this.prev = null
    this.next = sessions
    sessions = this
    this.storage = new Set()
    if (this.next) {
      this.next.prev = this
    }

    // specialized fields:
    this.request = null
  }

  claim () {
    this.add(executionAsyncId())
  }

  release () {
    this.storage.delete(executionAsyncId())
  }

  has (id) {
    return this.storage.has(id)
  }

  add (id) {
    return this.storage.add(id)
  }

  delete (id) {
    return this.storage.delete(id)
  }

  end () {
    if (this.prev) {
      this.prev.next = this.next
    }

    if (this.next) {
      this.next.prev = this.prev
    }

    if (sessions === this) {
      sessions = this.next
    }
  }
}

function startSession () {
  const session = new Session()
  session.claim()
  return session
}

function getSession () {
  const asyncId = executionAsyncId()
  var session = sessions

  while (session) {
    if (session.has(asyncId)) {
      return session
    }
    session = session.next
  }

  return null
}
