const assert = require("assert")
const fs = require("fs")
const path = require("path")
const test = require("node:test")

async function runUpdateLibraryWithToken(token) {
  const vm = require("node:vm")
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "UpdateLibrary.js"), "utf8")
  const requests = []
  const writes = []
  const fileManager = {
    documentsDirectory: () => "/documents",
    joinPath: (...parts) => parts.join("/"),
    fileExists: () => false,
    createDirectory: () => {},
    writeString: (target, value) => writes.push({ target, value }),
    readString: () => ""
  }
  class Request {
    constructor(url) {
      this.url = url
      this.headers = {}
      requests.push(this)
    }

    async loadJSON() {
      this.response = { statusCode: 200 }
      return { tree: [{ type: "blob", path: "scriptable/Example.js" }] }
    }

    async loadString() {
      this.response = { statusCode: 200 }
      return "module.exports = {}"
    }
  }
  class Notification {
    async schedule() {}
  }
  const context = vm.createContext({
    FileManager: { iCloud: () => fileManager },
    Keychain: { contains: () => true, get: () => token },
    Request,
    Notification,
    Script: { complete: () => {} },
    console
  })
  await vm.runInContext(`(async () => {\n${source}\n})()`, context)
  return { requests, writes }
}

test("UpdateLibrary schedules notifications through an instance", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "UpdateLibrary.js"), "utf8")
  assert.doesNotMatch(source, /Notification\.schedule\(/)
  assert.match(source, /new Notification\(\)/)
  assert.match(source, /Début de mise à jour/)
  assert.match(source, /\[UpdateLibrary\] Échec de notification/)
  assert.match(source, /Aucun script \.js trouvé dans/)
  assert.doesNotMatch(source, /ScriptableTestSuite/)
  assert.doesNotMatch(source, /importModule\("ScriptableTests"\)/)
  assert.doesNotMatch(source, /Exécution des tests Scriptable/)
})

test("UpdateLibrary removes only files recorded in its previous manifest", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "UpdateLibrary.js"), "utf8")
  assert.match(source, /const MANIFEST_NAME = "ShortcutsLibraryManifest\.json"/)
  assert.match(source, /JSON\.parse\(fm\.readString\(manifestPath\)\)/)
  assert.match(source, /previousFiles\.filter\(path => !remotePaths\.has\(path\)\)/)
  assert.match(source, /fm\.remove\(destinationPath\(relativePath\)\)/)
  assert.match(source, /fm\.writeString\(manifestPath, JSON\.stringify\(\{ files: files\.map\(file => file\.localPath\) \}\)\)/)
})

test("UpdateLibrary authenticates tree and raw GitHub downloads with its stored token", async () => {
  const result = await runUpdateLibraryWithToken("test-github-token")
  assert.equal(result.requests.length, 2)
  assert.deepEqual(result.requests.map(request => request.headers.Authorization), [
    "Bearer test-github-token",
    "Bearer test-github-token"
  ])
  assert.equal(result.writes.length, 2)
})

test("ScriptableTests remains importable by UpdateLibrary", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "ScriptableTests.js"), "utf8")
  assert.doesNotMatch(source, /if \(Script\.name\(\) === "ScriptableTests"\) \{\s*const result = await run\(\)/)
  assert.match(source, /run\(\)\.then\(/)
})
