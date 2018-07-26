'use strict'

module.exports = createRequestInjector

const {inject} = require('shot')

function createRequestInjector () {
  return {
    async processSuite (suite, next) {
      suite.request = async opts => {
        const resp = await inject(suite.spife.onrequest, opts)

        if (resp.headers['content-type'].match(/application\/json/)) {
          resp.body = JSON.parse(resp.payload)
        }

        return resp
      }
      return next(suite)
    }
  }
}
