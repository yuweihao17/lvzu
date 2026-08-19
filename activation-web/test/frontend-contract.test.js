const assert = require("assert")
const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const script = fs.readFileSync(path.join(root, "app.js"), "utf8")
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
const selectors = [...script.matchAll(/\$\("#([A-Za-z][\w-]*)"\)/g)].map(match => match[1])
const dynamicIds = new Set(["productForm", "planForm", "cardForm", "modalMessage"])
const missing = [...new Set(selectors.filter(id => !ids.has(id) && !dynamicIds.has(id)))]

assert.deepStrictEqual(missing, [], `app.js references missing HTML ids: ${missing.join(", ")}`)
assert.match(html, /<link rel="stylesheet" href="\/app\.css\?v=[^"]+">/)
assert.match(html, /<script src="\/app\.js\?v=[^"]+" defer><\/script>/)

console.log("frontend contract tests passed")
