const assert = require("node:assert/strict")
const test = require("node:test")

const diagnostics = require("../ScriptableModuleDiagnostics")

function storage(files) {
  return {
    documentsDirectory: () => "/documents",
    joinPath: (...parts) => parts.join("/"),
    fileExists: path => files.includes(path)
  }
}

test("sonde les deux stockages et signale un import sans export", () => {
  const report = diagnostics.inspect("ComptesCommuns", {
    iCloud: storage(["/documents/ComptesCommuns.js", "/documents/ScriptableTests.js"]),
    local: storage(["/documents/ComptesCommuns.js"]),
    importModule: () => undefined
  })

  assert.deepEqual(report.locations, {
    iCloud: { comptes: true, tests: true },
    local: { comptes: true, tests: false }
  })
  assert.deepEqual(report.import, { status: "undefined", exports: [] })
})
