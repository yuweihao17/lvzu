const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const pageSource = fs.readFileSync(path.join(__dirname, "..", "the-wow.html"), "utf8")

test("the_wow admin page does not persist the administrator secret in browser storage", () => {
  assert.doesNotMatch(pageSource, /the_wow_admin_secret/)
  assert.doesNotMatch(pageSource, /localStorage\.setItem\([^)]*admin/i)
  assert.doesNotMatch(pageSource, /localStorage\.getItem\([^)]*admin/i)
  assert.match(pageSource, /autocomplete="current-password"/)
})
