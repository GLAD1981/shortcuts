const assert = require("assert")
const test = require("node:test")
const input = require("../ExpenseInput")
const sharedExpenses = require("../SharedExpenses")

test("ExpenseInput", async (suite) => {
  await suite.test("uses share-sheet text before the clipboard", () => {
    assert.strictEqual(input.selectSource("Courses 12,50", "Ignored 99"), "Courses 12,50")
  })
  await suite.test("uses the clipboard when the share-sheet text is blank", () => {
    assert.strictEqual(input.selectSource("  \n", "Courses 12,50"), "Courses 12,50")
  })
  await suite.test("normalizes a French amount", () => {
    assert.deepStrictEqual(input.extractTextAndAmount("1 234,56 €"), { text: "", amount: "1234,56" })
  })
  await suite.test("normalizes an international amount", () => {
    assert.deepStrictEqual(input.extractTextAndAmount("12.50"), { text: "", amount: "12,50" })
  })
  await suite.test("extracts a trailing amount only", () => {
    assert.deepStrictEqual(input.extractTextAndAmount("Courses 12,50"), { text: "Courses", amount: "12,50" })
  })
  await suite.test("keeps thousands separators with the trailing amount", () => {
    assert.deepStrictEqual(input.extractTextAndAmount("Courses 1 234,50 €"), { text: "Courses", amount: "1234,50" })
  })
  await suite.test("keeps free text unchanged", () => {
    assert.deepStrictEqual(input.extractTextAndAmount("Abonnement mensuel"), { text: "Abonnement mensuel", amount: "" })
  })
})

test("SharedExpenses runs against injected Scriptable APIs", async () => {
  let requestUrl = ""
  const notification = {
    addAction() {},
    async schedule() {}
  }
  const runtime = {
    getClipboard: () => "Ignored 99",
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
        requestUrl = url
        return "Dépense ajoutée."
      }
    }),
    createNotification: () => notification,
    today: () => "2026-08-21"
  }

  const result = await sharedExpenses.run("Courses 12,50", runtime)

  assert.strictEqual(result.ok, true)
  assert.match(requestUrl, /object=Courses&amount=12%2C50&date=2026-08-21/)
  assert.strictEqual(notification.title, "Dépense ajoutée")
})
