const assert = require("assert")
const test = require("node:test")
const input = require("../ExpenseInput")

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
  await suite.test("keeps free text unchanged", () => {
    assert.deepStrictEqual(input.extractTextAndAmount("Abonnement mensuel"), { text: "Abonnement mensuel", amount: "" })
  })
})
