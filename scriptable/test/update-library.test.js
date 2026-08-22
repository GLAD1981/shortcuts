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
  assert.doesNotMatch(source, /ScriptableTestSuite/)
  assert.match(source, /const tests = importModule\("ScriptableTests"\)/)
  assert.match(source, /Chargement de ScriptableTests/)
  assert.match(source, /Module ScriptableTests invalide/)
  assert.match(source, /await tests\.present\(testResult\)/)
})

test("UpdateLibrary removes only files recorded in its previous manifest", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "UpdateLibrary.js"), "utf8")
  assert.match(source, /const MANIFEST_NAME = "ShortcutsLibraryManifest\.json"/)
  assert.match(source, /JSON\.parse\(fm\.readString\(manifestPath\)\)/)
  assert.match(source, /previousFiles\.filter\(path => !remotePaths\.has\(path\)\)/)
  assert.match(source, /fm\.remove\(destinationPath\(relativePath\)\)/)
  assert.match(source, /fm\.writeString\(manifestPath, JSON\.stringify\(\{ files: files\.map\(file => file\.localPath\) \}\)\)/)
})

test("ScriptableTests remains importable by UpdateLibrary", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "ScriptableTests.js"), "utf8")
  assert.doesNotMatch(source, /if \(Script\.name\(\) === "ScriptableTests"\) \{\s*const result = await run\(\)/)
  assert.match(source, /run\(\)\.then\(/)
})
