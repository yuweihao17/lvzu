const { spawn, spawnSync } = require("child_process")
const fs = require("fs")
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

function ensureVelaImageAlias() {
  const vvdHome = path.join(os.homedir(), ".vela", "vvd")
  const entry = "xiaomi_band_10.ini"
  const indexPath = path.join(vvdHome, entry)
  if (!fs.existsSync(indexPath)) return
  const index = fs.readFileSync(indexPath, "utf8")
  const vvdPath = index.match(/^path=(.+)$/m)?.[1]?.trim()
  if (!vvdPath) return
  const configPath = path.join(vvdPath, "config.ini")
  if (!fs.existsSync(configPath)) return
  const config = fs.readFileSync(configPath, "utf8")
  const image1 = config.match(/^image\.sysdir\.1=(.+)$/m)?.[1]?.trim()
  const image2 = config.match(/^image\.sysdir\.2=(.*)$/m)?.[1]?.trim()
  if (!image1 || image2 || !fs.existsSync(path.join(image1, "nuttx"))) return
  const backupPath = `${configPath}.bak`
  if (!fs.existsSync(backupPath)) fs.copyFileSync(configPath, backupPath)
  const alias = `image.sysdir.2=${image1}`
  const updated = /^image\.sysdir\.2=.*$/m.test(config)
    ? config.replace(/^image\.sysdir\.2=.*$/m, alias)
    : `${config.trimEnd()}\r\n${alias}\r\n`
  fs.writeFileSync(configPath, updated)
  console.log(`Repaired Vela image alias: ${entry}`)
}

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

ensureVelaImageAlias()
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
