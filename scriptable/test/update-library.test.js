const assert = require("assert")
const fs = require("fs")
const path = require("path")
const test = require("node:test")

test("UpdateLibrary schedules notifications through an instance", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "UpdateLibrary.js"), "utf8")
  assert.doesNotMatch(source, /Notification\.schedule\(/)
  assert.match(source, /new Notification\(\)/)
  assert.match(source, /Début de mise à jour/)
  assert.match(source, /\[UpdateLibrary\] Échec de notification/)
  assert.match(source, /Aucun script \.js trouvé dans/)
})
