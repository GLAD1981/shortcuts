// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: stethoscope;

function filePresent(storage, filename) {
  try {
    return storage.fileExists(storage.joinPath(storage.documentsDirectory(), filename))
  } catch (_) {
    return false
  }
}

function inspect(name, runtime) {
  const locations = {
    iCloud: {
      comptes: filePresent(runtime.iCloud, `${name}.js`),
      tests: filePresent(runtime.iCloud, "ScriptableTests.js")
    },
    local: {
      comptes: filePresent(runtime.local, `${name}.js`),
      tests: filePresent(runtime.local, "ScriptableTests.js")
    }
  }
  return { locations }
}

function importReport(load) {
  try {
    const imported = load()
    const exports = imported && typeof imported === "object" ? Object.keys(imported).sort() : []
    return { status: imported == null ? "undefined" : "ok", exports }
  } catch (error) {
    return { status: "error", exports: [], message: String(error.message || error) }
  }
}

function present(report) {
  const location = (label, value) => `${label} : ${value ? "présent" : "absent"}`
  const lines = [
    location("ComptesCommuns iCloud", report.locations.iCloud.comptes),
    location("ScriptableTests iCloud", report.locations.iCloud.tests),
    location("ComptesCommuns local", report.locations.local.comptes),
    location("ScriptableTests local", report.locations.local.tests),
    `Import : ${report.import.status}${report.import.exports.length ? ` — ${report.import.exports.join(", ")}` : ""}`
  ]
  if (report.import.message) lines.push(`Erreur : ${report.import.message}`)
  return lines.join("\n")
}

async function run() {
  const report = inspect("ComptesCommuns", {
    iCloud: FileManager.iCloud(),
    local: FileManager.local()
  })
  report.import = importReport(() => importModule("ComptesCommuns"))
  const alert = new Alert()
  alert.title = "Diagnostic Scriptable"
  alert.message = present(report)
  alert.addAction("OK")
  await alert.presentAlert()
  Script.setShortcutOutput(report)
  Script.complete()
  return report
}

module.exports = { importReport, inspect, present }

if (typeof Script !== "undefined" && Script.name() === "ScriptableModuleDiagnostics") {
  run().catch(error => console.error(`[ScriptableModuleDiagnostics] ${String(error.message || error)}`))
}
