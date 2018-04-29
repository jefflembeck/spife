'use strict'

module.exports = createRequestInjector

const {inject} = require('shot')

function createRequestInjector () {
  return {
    async processSuite (suite, next) {
      suite.request = opts => {
        return inject(suite.spife.onrequest, opts)
      }
      return next(suite)
    }
  }
}
