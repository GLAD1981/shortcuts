const input = importModule("ExpenseInput")
const sharedExpenses = importModule("SharedExpenses")
const results = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function test(name, action) {
  try {
    await action()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: String(error.message || error) })
  }
}

function createRuntime() {
  const state = { requestUrl: "", notifications: [] }
  return {
    state,
    runtime: {
      getClipboard: () => "Presse-papiers 99",
      createAlert: () => {
        const fields = []
        return {
          addTextField(_, value) {
            fields.push(value)
            return { setDecimalPadKeyboard() {} }
          },
          addAction() {},
          addCancelAction() {},
          async presentAlert() { return 0 },
          textFieldValue(index) { return fields[index] }
        }
      },
      createRequest: url => ({
        response: { statusCode: 200 },
        async loadString() {
          state.requestUrl = url
          return "Dépense ajoutée."
        }
      }),
      createNotification: () => {
        const notification = { addAction() {}, async schedule() {} }
        state.notifications.push(notification)
        return notification
      },
      today: () => "2026-08-21"
    }
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

await test("Flux complet sans effet réel", async () => {
  const sandbox = createRuntime()
  const result = await sharedExpenses.run("Courses 12,50", sandbox.runtime)
  assert(result.ok, "Le flux a échoué")
  assert(/object=Courses&amount=12%2C50&date=2026-08-21/.test(sandbox.state.requestUrl), "Requête incorrecte")
  assert(sandbox.state.notifications.length === 1, "Notification absente")
  assert(sandbox.state.notifications[0].openURL, "Lien de la notification absent")
})

const failures = results.filter(result => !result.ok)
const report = results.map(result => `${result.ok ? "PASS" : "FAIL"} — ${result.name}${result.message ? ` : ${result.message}` : ""}`).join("\n")
const alert = new Alert()
alert.title = failures.length ? "Tests Scriptable : échec" : "Tests Scriptable : succès"
alert.message = report
alert.addAction("OK")
await alert.presentAlert()
Script.setShortcutOutput({ ok: failures.length === 0, results })
Script.complete()
