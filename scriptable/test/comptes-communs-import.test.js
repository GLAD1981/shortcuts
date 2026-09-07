const assert = require("node:assert/strict")
const test = require("node:test")

test("ComptesCommuns reste importable par un chargeur synchrone", () => {
  assert.doesNotThrow(() => require("../ComptesCommuns"))
})
