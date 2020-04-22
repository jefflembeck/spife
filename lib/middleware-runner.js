'use strict'

module.exports = (mwList, inner) => async (...args) => {
  let idx = 0

  async function iter (...iterArgs) {
    const middlewareFn = mwList[idx]
    idx += 1

    if (!middlewareFn) {
      return inner(...iterArgs)
    }

    return middlewareFn(...iterArgs, once(iter))
  }

  return iter(...args, once(iter))
}

function once (fn) {
  return (...args) => {
    if (!fn) throw new Error('next() already called!')
    const callFn = fn
    fn = null
    return callFn(...args)
  }
}
