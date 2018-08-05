'use strict'

const {start} = require('repl')
const http = require('http')

const txn = require('../../decorators/transaction')
const Server = require('../../lib/server')
const routes = require('../../routing')

const {register} = require('./index.js')

register({
  command: 'shell',
  alias: 'repl',
  describe: 'start an interactive repl (as if running inside a view.)',
  handler
})

async function handler (argv) {
  const {settings} = argv
  const router = routes`
    CONNECT / repl
  `({repl: txn.noTransaction(repl)}).concat(settings.ROUTER)
  const server = http.createServer()
  const spife = new Server(
    'test-' + settings.NAME,
    server,
    router,
    settings.MIDDLEWARE,
    {settings, isExternal: false, isTest: true, onclienterror () {}}
  )

  spife.processServerOnion(spife)
  await spife.onready

  spife.onrequest({
    url: '/',
    method: 'CONNECT',
    headers: {}
  }, {
    writeHead () {
    },
    on () {
    },
    once () {
    },
    end () {
    },
    write () {
    }
  })

  function repl (req) {
    const replServer = start()
    replServer.context.req = req

    return new Promise((resolve, reject) => {
      replServer
        .on('exit', resolve)
        .on('error', reject)
    })
  }
}
