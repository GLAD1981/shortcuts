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

test("sonde les deux stockages sans dépendre d'un import transférable", () => {
  const report = diagnostics.inspect("ComptesCommuns", {
    iCloud: storage(["/documents/ComptesCommuns.js", "/documents/ScriptableTests.js"]),
    local: storage(["/documents/ComptesCommuns.js"])
  })

  assert.deepEqual(report.locations, {
    iCloud: { comptes: true, tests: true },
    local: { comptes: true, tests: false }
  })
  assert.equal(Object.hasOwn(report, "import"), false)
})

test("décrit les exports issus d'un appel direct au chargeur", () => {
  assert.deepEqual(
    diagnostics.importReport(() => ({ prepare() {}, run() {} })),
    { status: "ok", exports: ["prepare", "run"] }
  )
})
