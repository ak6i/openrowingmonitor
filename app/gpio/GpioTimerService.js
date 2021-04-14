'use strict'
/*
  Open Rowing Monitor, https://github.com/laberning/openrowingmonitor

  Measures the time between impulses on the GPIO pin. Started in a
  separate thread, since we want the measured time to be as close as
  possible to real time.
*/
import process from 'process'
import { Gpio } from 'onoff'

export function createGpioTimerService () {
  // mode can be rising, falling, both
  const reedSensor = new Gpio(17, 'in', 'rising')
  // use hrtime for time measurement to get a higher time precision
  let hrStartTime = process.hrtime()

  // assumes that GPIO-Port 17 is set to pullup and reed is connected to GND
  // therefore the value is 1 if the reed sensor is open
  reedSensor.watch((err, value) => {
    if (err) {
      throw err
    }
    const hrDelta = process.hrtime(hrStartTime)
    hrStartTime = process.hrtime()
    const delta = hrDelta[0] + hrDelta[1] / 1e9
    process.send(delta)
  })
}

createGpioTimerService()
