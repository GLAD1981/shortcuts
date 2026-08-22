const assert = require("assert")
const test = require("node:test")
const inputs = require("../ShortcutInputs")

function callbackHarness(result) {
  const state = { url: "", parameters: [] }
  return {
    state,
    createCallbackURL(url) {
      state.url = url
      return {
        addParameter(name, value) { state.parameters.push([name, value]) },
        async open() { return { result } }
      }
    }
  }
}

test("text forwards its configuration to textInputbox and returns its answer", async () => {
  const harness = callbackHarness("Pain et lait")

  const answer = await inputs.text({ object: "Objet", default: "Pain", multiLine: false }, harness)

  assert.strictEqual(answer, "Pain et lait")
  assert.strictEqual(harness.state.url, "shortcuts://x-callback-url/run-shortcut")
  assert.deepStrictEqual(harness.state.parameters, [
    ["name", "textInputbox"],
    ["input", "text"],
    ["text", JSON.stringify({ object: "Objet", default: "Pain", multiLine: false })]
  ])
})

test("number forwards its configuration to numberInputBox and returns its answer", async () => {
  const harness = callbackHarness("12,50")

  const answer = await inputs.number({ object: "Montant", default: "12,50", negative: false, decimals: true }, harness)

  assert.strictEqual(answer, "12,50")
  assert.deepStrictEqual(harness.state.parameters, [
    ["name", "numberInputBox"],
    ["input", "text"],
    ["text", JSON.stringify({ object: "Montant", default: "12,50", negative: false, decimals: true })]
  ])
})
