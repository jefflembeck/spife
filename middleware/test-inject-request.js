'use strict'

module.exports = createRequestInjector

const {inject} = require('shot')

function createRequestInjector () {
  return {
    async processSuite (suite, next) {
      suite.request = async _opts => {
        const opts = {..._opts}
        const {body, headers = {}} = opts

        if (body) {
          if (!('content-type' in headers)) {
            headers['content-type'] = 'application/json'
          }
          opts.payload = JSON.stringify(body)
          delete opts.body
        }

        const resp = await inject(suite.spife.onrequest, opts)

        if (/application\/json/.test(resp.headers['content-type'])) {
          resp.body = JSON.parse(resp.payload)
        }

        return resp
      }
      return next(suite)
    }
  }
}
