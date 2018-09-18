'use strict'

module.exports = makeMonitorMiddleware

const logger = require('../logging')('monitor')
const exec = require('child_process').exec
const Promise = require('bluebird')

const reply = require('../reply')

function makeMonitorMiddleware () {
  return {
    processServer (spife, next) {
      this.name = spife.name
      return next(spife)
    },
    processRequest (req, next) {
      if (req.urlObject.pathname === '/_monitor/ping') {
        return pingResponse()
      }
      if (req.urlObject.pathname === '/_monitor/status') {
        return statusResponse(this.name)
      }
      return next(req)
    }
  }
}

function pingResponse () {
  return reply.raw(process.env.PING_RESPONSE || 'pong')
}

function statusResponse (name) {
  return Promise.props({
    name: name,
    pid: process.pid,
    uptime: process.uptime(),
    rss: process.memoryUsage(),
    git: buildHash(),
    message: buildMessage()
  })
}

async function buildHash () {
  return process.env.BUILD_HASH || gitHead()
}

async function buildMessage () {
  return process.env.BUILD_MESSAGE || (process.env.BUILD_HASH ? '' : gitMessage())
}

function gitHead () {
  return new Promise((resolve, reject) => {
    exec('git rev-parse HEAD', (err, stdout) => {
      if (err) {
        logger.error('could not exec "git rev-parse HEAD":')
        logger.error(err)
        return resolve('')
      } else {
        return resolve(stdout.trim())
      }
    })
  })
}

function gitMessage () {
  return new Promise((resolve, reject) => {
    exec('git log --oneline --abbrev-commit  -n 1', (err, stdout) => {
      if (err) {
        logger.error('could not exec "git log --oneline --abbrev-commit  -n 1":')
        logger.error(err)
        return resolve('')
      } else {
        return resolve(stdout.trim())
      }
    })
  })
}
