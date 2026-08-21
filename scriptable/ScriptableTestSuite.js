const input = importModule("ExpenseInput")
const sharedExpenses = importModule("SharedExpenses")
const publisher = importModule("PublishLibraryCore")

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

  await test("Analyse des montants AHK", () => {
    const expense = input.extractTextAndAmount("Courses 1 234,50 €")
    assert(expense.text === "Courses", "Objet non extrait")
    assert(expense.amount === "1234,50", "Montant français non normalisé")
  })

  await test("Entrée de partage prioritaire", () => {
    assert(input.selectSource("Courses 12,50", "Ignoré 99") === "Courses 12,50", "Priorité incorrecte")
  })

  await test("Flux de dépense sans effet réel", async () => {
    const state = { requestUrl: "", notifications: [] }
    const runtime = {
      getClipboard: () => "Presse-papiers 99",
      createAlert: () => {
        const fields = []
        return {
          addTextField(_, value) { fields.push(value); return { setDecimalPadKeyboard() {} } },
          addAction() {}, addCancelAction() {}, async presentAlert() { return 0 },
          textFieldValue(index) { return fields[index] }
        }
      },
      createRequest: url => ({ response: { statusCode: 200 }, async loadString() { state.requestUrl = url; return "Dépense ajoutée." } }),
      createNotification: () => {
        const notification = { addAction() {}, async schedule() {} }
        state.notifications.push(notification)
        return notification
      },
      today: () => "2026-08-22"
    }
    const result = await sharedExpenses.run("Courses 12,50", runtime)
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

  return { ok: results.every(result => result.ok), results }
}

module.exports = { run }
