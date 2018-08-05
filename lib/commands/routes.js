'use strict'

const {register} = require('./index.js')

register({
  command: 'routes',
  describe: 'list available routes',
  handler
})

function handler (argv) {
  const routes = argv.settings.ROUTER
  const output = []
  const sizes = [-Infinity, -Infinity, -Infinity]
  for (var target of routes.all()) {
    sizes[0] = Math.max(target.method.length, sizes[0])
    sizes[1] = Math.max(target.route.length, sizes[1])
    sizes[2] = Math.max(target.name.length, sizes[2])
    output.push([target.method, target.route, target.name])
  }

  console.log(output.map(row => {
    return row.map((xs, idx) => {
      return xs + ' '.repeat(sizes[idx] + 1 - xs.length)
    }).join('')
  }).join('\n'))
}
