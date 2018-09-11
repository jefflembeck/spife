'use strict'
const dedent = require('dedent')

module.exports = {sprout}

function sprout (fns, inner, argc) {
  if (fns.length === 0) return (...args) => inner(...args)

  const args = Array(argc).fill(null).map((_, idx) => `arg${idx}`)
  const jargs = args.join(', ')

  const body = fns.map((_, idx, all) => {
    if (idx + 1 === all.length) {
      return dedent`
        const mw${idx}_next = (${jargs}) => inner(${jargs})
      `
    }
    return dedent`
      const mw${idx}_next = (${jargs}) => mw${idx + 1}(${jargs}, mw${idx + 1}_next)
    `
  })

  const fnargs = fns.map((_, idx) => `mw${idx}`)
  const sproutBody = dedent`
    'use strict'
    ${body.reverse().join('\n')}
    return (${jargs}) => mw0(${jargs}, mw0_next)
  `
  // eslint-disable-next-line no-new-func
  const onion = Function(...fnargs, 'inner', sproutBody)
  return onion(...fns, inner)
}
