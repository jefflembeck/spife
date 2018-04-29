'use strict'

module.exports = createRequestInterceptor

function createRequestInterceptor () {
  let defaultInterceptor = async (req) => {}
  let interceptor = defaultInterceptor

  return {
    async processRequest (req, next) {
      await interceptor(req)
      return await next(req)
    },

    async processSuite (suite, next) {
      suite.setRequestInterceptor = v => {
        interceptor = v
      }
      return await next(suite)
    },

    async processTestcase (suite, testcase, args, next) {
      interceptor = defaultInterceptor
      return next(suite, testcase, args) 
    }
  }
}
