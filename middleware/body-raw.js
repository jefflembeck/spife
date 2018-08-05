'use strict'

module.exports = createRawBodyMW

const {prototype: {on}} = require('events')

function createRawBodyMW ({final = false} = {}) {
  const RAW_SYM = Symbol('raw-body')

  return {
    processRequest (req, next) {
      const rawBodyDeferred = {
        resolve: null,
        reject: null,
        promise: null
      }

      rawBodyDeferred.promise = new Promise((resolve, reject) => {
        rawBodyDeferred.resolve = resolve
        rawBodyDeferred.reject = reject
      })

      if (!req.hasOwnProperty('rawBody')) {
        Object.defineProperty(req, 'rawBody', {
          get () {
            // trigger the processBody lifecycle!
            req.body.catch(() => {})
            return rawBodyDeferred.promise
          }
        })
      }

      req[RAW_SYM] = rawBodyDeferred

      return next(req)
    },
    processBody (req, stream, next) {
      const rawBodyDeferred = req[RAW_SYM]

      // NB: there is practically zero chance of this being the case.
      // Having typed that, I have now willed this case into existence.
      if (!rawBodyDeferred) {
        return next(req, stream)
      }

      const body = []
      on.call(stream, 'data', xs => body.push(xs))
      on.call(stream, 'error', err => {
        rawBodyDeferred.reject(err)
        body.length = 0
      })
      on.call(stream, 'end', () => {
        rawBodyDeferred.resolve(Buffer.concat(body))
        body.length = 0
      })

      if (final) {
        stream.resume()
        return rawBodyDeferred.promise
      }

      return next(req, stream)
    }
  }
}
