'use strict'
/*
  Open Rowing Monitor, https://github.com/laberning/openrowingmonitor

  This start file is currently a mess, as this currently is the devlopment playground to plug
  everything together while figuring out the physics and model of the application.
  todo: refactor this as we progress
*/
import { fork } from 'child_process'
import log from 'loglevel'
// eslint-disable-next-line no-unused-vars
import fs from 'fs'
import config from './config.js'
import { createRowingEngine } from './engine/RowingEngine.js'
import { createRowingStatistics } from './engine/RowingStatistics.js'
import { createWebServer } from './WebServer.js'
import { createPeripheralManager } from './ble/PeripheralManager.js'
// eslint-disable-next-line no-unused-vars
import { replayRowingSession } from './tools/RowingRecorder.js'

// set the log levels
log.setLevel(config.loglevel.default)
for (const [loggerName, logLevel] of Object.entries(config.loglevel)) {
  if (loggerName !== 'default') {
    log.getLogger(loggerName).setLevel(logLevel)
  }
}

log.info(`==== Open Rowing Monitor ${process.env.npm_package_version} ====\n`)

const peripheralManager = createPeripheralManager()

peripheralManager.on('control', (event) => {
  if (event?.req?.name === 'requestControl') {
    event.res = true
  } else if (event?.req?.name === 'reset') {
    log.debug('reset requested')
    rowingStatistics.reset()
    peripheralManager.notifyStatus({ name: 'reset' })
    event.res = true
  // todo: we could use these controls once we implement a concept of a rowing session
  } else if (event?.req?.name === 'stop') {
    log.debug('stop requested')
    peripheralManager.notifyStatus({ name: 'stoppedOrPausedByUser' })
    event.res = true
  } else if (event?.req?.name === 'pause') {
    log.debug('pause requested')
    peripheralManager.notifyStatus({ name: 'stoppedOrPausedByUser' })
    event.res = true
  } else if (event?.req?.name === 'startOrResume') {
    log.debug('startOrResume requested')
    peripheralManager.notifyStatus({ name: 'startedOrResumedByUser' })
    event.res = true
  } else if (event?.req?.name === 'peripheralMode') {
    webServer.notifyClients({ peripheralMode: event.req.peripheralMode })
    event.res = true
  } else {
    log.info('unhandled Command', event.req)
  }
})

const gpioTimerService = fork('./app/gpio/GpioTimerService.js')
gpioTimerService.on('message', (dataPoint) => {
  rowingEngine.handleRotationImpulse(dataPoint)
  // fs.appendFile('recordings/wrx700_2magnets_long.csv', `${dataPoint}\n`, (err) => { if (err) log.error(err) })
})

const rowingEngine = createRowingEngine()
const rowingStatistics = createRowingStatistics()
rowingEngine.notify(rowingStatistics)

rowingStatistics.on('strokeFinished', (metrics) => {
  log.info(`stroke: ${metrics.strokesTotal}, dur: ${metrics.strokeTime}s, power: ${metrics.power}w` +
  `, split: ${metrics.splitFormatted}, ratio: ${metrics.powerRatio}, dist: ${metrics.distanceTotal}m` +
  `, cal: ${metrics.caloriesTotal}kcal, SPM: ${metrics.strokesPerMinute}, speed: ${metrics.speed}km/h` +
  `, cal/hour: ${metrics.caloriesPerHour}kcal, cal/minute: ${metrics.caloriesPerMinute}kcal`)
  webServer.notifyClients(metrics)
  peripheralManager.notifyMetrics('strokeFinished', metrics)
})

rowingStatistics.on('strokeStateChanged', (metrics) => {
  peripheralManager.notifyMetrics('strokeStateChanged', metrics)
})

rowingStatistics.on('metricsUpdate', (metrics) => {
  webServer.notifyClients(metrics)
  peripheralManager.notifyMetrics('metricsUpdate', metrics)
})

const bleCentralService = fork('./app/ble/CentralService.js')
bleCentralService.on('message', (heartrateMeasurement) => {
  rowingStatistics.handleHeartrateMeasurement(heartrateMeasurement)
})

const webServer = createWebServer()
webServer.on('messageReceived', (message) => {
  if (message.command === 'reset') {
    rowingStatistics.reset()
    peripheralManager.notifyStatus({ name: 'reset' })
  } else if (message.command === 'switchPeripheralMode') {
    peripheralManager.switchPeripheralMode()
  } else {
    log.warn('invalid command received:', message)
  }
})

webServer.on('clientConnected', () => {
  webServer.notifyClients({ peripheralMode: peripheralManager.getPeripheralMode() })
})

/*
replayRowingSession(rowingEngine.handleRotationImpulse, {
  filename: 'recordings/wrx700_2magnets.csv',
  realtime: true,
  loop: true
})
*/
