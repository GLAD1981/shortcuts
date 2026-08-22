// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: vial;
const publisher = importModule("PublishLibrary")
const comptesCommuns = importModule("ComptesCommuns")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function run() {
  const results = []
  async function test(name, action) {
    try {
      await action()
      results.push({ name, ok: true })
    } catch (error) {
      results.push({ name, ok: false, message: String(error.message || error) })
    }
  }

  await test("Préparation des comptes communs", () => {
    const expense = comptesCommuns.prepare("Courses 1 234,50 €", "Ignoré 99")
    assert(expense.objet === "Courses", "Objet non extrait")
    assert(expense.montant === "1234,50", "Montant non normalisé")
  })
  await test("Saisie des comptes communs par les mini-raccourcis", async () => {
    const configurations = []
    const runtime = {
      getClipboard: () => "Ignoré 99",
      inputs: {
        async text(configuration) {
          configurations.push(configuration)
          return "Courses bio"
        },
        async number(configuration) {
          configurations.push(configuration)
          return "13,20"
        }
      },
      createRequest: () => ({ response: { statusCode: 200 }, async loadString() { return "Dépense ajoutée." } }),
      createNotification: () => ({ addAction() {}, async schedule() {} }),
      today: () => "2026-08-22"
    }
    const result = await comptesCommuns.run("Courses 12,50", runtime)
    assert(result.ok, "La saisie via les mini-raccourcis a échoué")
    assert(configurations[0].default === "Courses", "Objet non prérempli")
    assert(configurations[1].default === "12,50", "Montant non prérempli")
  })
  await test("Envoi des comptes communs sans effet réel", async () => {
    const state = { requestUrl: "", notifications: [] }
    const runtime = {
      createRequest: url => ({ response: { statusCode: 200 }, async loadString() { state.requestUrl = url; return "Dépense ajoutée." } }),
      createNotification: () => {
        const notification = { addAction() {}, async schedule() {} }
        state.notifications.push(notification)
        return notification
      },
      today: () => "2026-08-22"
    }
    const result = await comptesCommuns.run({ objet: "Courses", montant: "12,50" }, runtime)
    assert(result.ok, "Le flux a échoué")
    assert(/object=Courses&amount=12%2C50/.test(state.requestUrl), "Requête incorrecte")
    assert(state.notifications.length === 1, "Notification absente")
  })
  await test("Publication GitHub atomique", async () => {
    const paths = []
    const api = {
      async request(method, path, body) {
        paths.push({ method, path, body })
        if (path === "git/ref/heads/main") return { object: { sha: "parent" } }
        if (path === "git/commits/parent") return { tree: { sha: "base" } }
        if (path === "git/trees/base?recursive=1") return { tree: [] }
        if (path === "git/trees") return { sha: "tree" }
        if (path === "git/commits") return { sha: "commit" }
        if (path === "git/refs/heads/main") return {}
        throw new Error(`Appel inattendu : ${method} ${path}`)
      }
    }
    const result = await publisher.publish(api, [{ path: "Test.js", content: "" }], "main")
    assert(result.sha === "commit", "Commit absent")
    assert(paths.filter(call => call.path === "git/commits").length === 1, "Plusieurs commits créés")
  })
  await test("Parcours des scripts Scriptable", async () => {
    const contents = { root: ["One.js", "nested"], "root/nested": ["Two.js"] }
    const fileManager = {
      listContents: path => contents[path],
      joinPath: (left, right) => `${left}/${right}`,
      isDirectory: path => Object.hasOwn(contents, path),
      async downloadFileFromiCloud() {},
      readString: path => `// ${path}`
    }
    const files = await publisher.collectScriptFiles(fileManager, "root")
    assert(files.length === 2, "Les scripts n'ont pas été parcourus")
  })
  return { ok: results.every(result => result.ok), results }
}

async function present(result) {
  const failures = result.results.filter(test => !test.ok)
  const report = result.results.map(test => `${test.ok ? "PASS" : "FAIL"} — ${test.name}${test.message ? ` : ${test.message}` : ""}`).join("\n")
  const alert = new Alert()
  alert.title = failures.length ? "Tests Scriptable : échec" : "Tests Scriptable : succès"
  alert.message = report
  alert.addAction("OK")
  await alert.presentAlert()
}

module.exports = { run, present }

if (Script.name() === "ScriptableTests") {
  run().then(async result => {
    await present(result)
    Script.setShortcutOutput(result)
  }).catch(error => {
    console.error(`[ScriptableTests] Échec : ${String(error.message || error)}`)
  })
}
