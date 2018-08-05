'use strict'

const EE = require('events')
const tap = require('tap')

const createTestServer = require('../../utils/test/index')
const bodyRawMW = require('../../middleware/body-raw')
const routes = require('../../routing')

module.exports = Object.assign(routes`
  POST /raw-body  returnRawBody
  POST /body      returnBody
`({
  async returnRawBody (req) {
    return req.rawBody
  },
  async returnBody (req) {
    return req.body
  }
}), {ROUTER: __filename})

let jsonParsingEnabled = true
const testSuite = createTestServer(__filename, {
  middleware: [
    '../../middleware/test-inject-request',
    '../../middleware/body-raw',
    ['../../middleware/body-json', {
      accept () {
        return jsonParsingEnabled
      }
    }],
    ['../../middleware/body-raw', {final: true}]
  ]
})

tap.test('non-final raw body reflects exact json', testSuite.isolate(async assert => {
  const exactJSON = '{"hello":           "world"}'
  const {statusCode, payload} = await testSuite.request({
    url: '/raw-body',
    method: 'POST',
    payload: exactJSON
  })

  assert.equal(statusCode, 200)
  assert.equal(payload, exactJSON)
}))

tap.test('non-final raw body only throws stream errors', testSuite.isolate(async assert => {
  const exactJSON = '{"hello":           I cannot believe it is not json}'
  const {statusCode, payload} = await testSuite.request({
    url: '/raw-body',
    method: 'POST',
    payload: exactJSON
  })

  let unhrs = 0
  const unhr = () => unhrs++
  process.on('unhandledRejection', unhr)
  assert.equal(statusCode, 200)
  assert.equal(payload, exactJSON)
  process.removeListener('unhandledRejection', unhr)
  assert.equal(unhrs, 0)
}))

tap.test('error out the stream', async assert => {
  const req = {}
  const stream = new EE()

  const bodyMW = bodyRawMW()

  await bodyMW.processRequest(req, () => {})

  req.body = new Promise((resolve, reject) => {})
  const promise = req.rawBody.then(() => {
    assert.fail('expected an error here.')
  }, err => {
    assert.equal(err.message, 'wuh oh')
  })

  await bodyMW.processBody(req, stream, () => {})
  stream.emit('error', new Error('wuh oh'))
  return promise
})

tap.test('final raw body mw reflects input as req.body', testSuite.isolate(async assert => {
  jsonParsingEnabled = false
  const exactJSON = 'SOME-body once told me'
  const {statusCode, payload} = await testSuite.request({
    url: '/body',
    method: 'POST',
    payload: exactJSON
  })

  assert.equal(statusCode, 200)
  assert.equal(payload, exactJSON)
}))

tap.test('re-enable json parsing', async () => {
  jsonParsingEnabled = true
})
