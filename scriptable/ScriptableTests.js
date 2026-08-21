const result = await importModule("ScriptableTestSuite").run()
const failures = result.results.filter(test => !test.ok)
const report = result.results.map(test => `${test.ok ? "PASS" : "FAIL"} — ${test.name}${test.message ? ` : ${test.message}` : ""}`).join("\n")
const alert = new Alert()
alert.title = failures.length ? "Tests Scriptable : échec" : "Tests Scriptable : succès"
alert.message = report
alert.addAction("OK")
await alert.presentAlert()
Script.setShortcutOutput({ ok: failures.length === 0, results: result.results })
Script.complete()
