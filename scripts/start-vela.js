const { spawn, spawnSync } = require("child_process")
const os = require("os")
const path = require("path")

const velaAdb = path.join(os.homedir(), ".vela", "sdk", "tools", "adb", "win")
const env = { ...process.env }

env.Path = `${velaAdb};${env.Path || ""}`
env.PATH = `${velaAdb};${env.PATH || ""}`
delete env.ANDROID_SDK_HOME

const command = process.execPath
const localAiot = path.join(process.cwd(), "node_modules", "aiot-toolkit", "lib", "bin.js")
const args = [localAiot, "start", "--watch"]

const adb = path.join(velaAdb, "adb.exe")

function runAdb(args, timeout = 8000) {
  return spawnSync(adb, args, {
    env,
    cwd: process.cwd(),
    encoding: "utf8",
    timeout,
    windowsHide: true
  })
}

function getFirstEmulator() {
  const result = runAdb(["devices"], 5000)
  if (result.error || !result.stdout) return ""
  const line = result.stdout
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(item => /^emulator-\d+\s+device$/.test(item))
  return line ? line.split(/\s+/)[0] : ""
}

function waitForReady(device) {
  if (!device) return
  console.log(`Waiting for ${device} display service...`)
  runAdb(["-s", device, "wait-for-device"], 12000)
  runAdb(["-s", device, "shell", "true"], 6000)
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 3500)"], {
    stdio: "ignore",
    timeout: 5000,
    windowsHide: true
  })
}

waitForReady(getFirstEmulator())

const child = spawn(command, args, {
  env,
  stdio: "inherit",
  shell: false,
  windowsHide: true
})

child.on("exit", code => {
  process.exit(code || 0)
})

child.on("error", error => {
  console.error(error.message)
  process.exit(1)
})
