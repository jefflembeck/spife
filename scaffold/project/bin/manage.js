#!/usr/bin/env node
const path = require('path')
process.env.SPIFE_SETTINGS = path.join(__dirname, '..', 'lib', 'settings')
require('@npm/spife/bin/manage.js')
