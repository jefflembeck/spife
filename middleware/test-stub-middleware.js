'use strict'

module.exports = createStubMiddleware

function createStubMiddleware (name, withObject, {cleanup = () => {}} = {}) {
  let object = withObject
  return {
    processRequest (req, next) {
      req[name] = object
      return next(req)
    },
    async processTestcase (suite, testcase, args, next) {
      const [assert] = args
      assert[`set${name[0].toUpperCase()}${name.slice(1)}`] = xs => {
        object = xs
      }

      const [err, result] = await doNext(next, suite, testcase, args)
        .then(xs => [null, xs])
        .catch(xs => [xs, null])

      object = withObject
      await cleanup()

      if (err) {
        throw err
      }
      return result
    }
  }
}

async function doNext (next, ...args) {
  return next(...args)
}
