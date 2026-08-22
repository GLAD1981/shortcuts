const assert = require("assert")
const test = require("node:test")
const comptes = require("../ComptesCommuns")

test("prepare prioritizes share input and extracts fields", () => {
  assert.deepStrictEqual(
    comptes.prepare("Courses 1 234,50 €", "Ignoré 99"),
    { objet: "Courses", montant: "1234,50" }
  )
})

test("prepare uses the clipboard when share input is blank", () => {
  assert.deepStrictEqual(
    comptes.prepare("  ", "Parking 12.50"),
    { objet: "Parking", montant: "12,50" }
  )
})

test("run returns prepared fields for the native Shortcut prompts", async () => {
  const result = await comptes.run("Courses 12,50", {
    getClipboard: () => "Ignoré 99"
  })

  assert.deepStrictEqual(result, { ok: true, objet: "Courses", montant: "12,50" })
})

test("run submits a confirmed shortcut dictionary without notification", async () => {
  const state = { requestUrl: "" }
  const result = await comptes.run({ objet: "Courses", montant: "12,50" }, {
    createRequest: url => ({
      response: { statusCode: 200 },
      async loadString() {
        state.requestUrl = url
        return "Dépense ajoutée."
      }
    }),
    createNotification() { throw new Error("notification inattendue") },
    today: () => "2026-08-22"
  })

  assert.strictEqual(result.ok, true)
  assert.match(state.requestUrl, /object=Courses&amount=12%2C50&date=2026-08-22/)
})

test("run rejects an invalid confirmed amount without sending a request", async () => {
  let requested = false
  const result = await comptes.run({ objet: "Courses", montant: "invalide" }, {
    createRequest() { requested = true },
    createNotification() { throw new Error("notification inattendue") },
    today: () => "2026-08-22"
  })

  assert.deepStrictEqual(result, { ok: false, objet: "Courses", montant: "", erreur: "Montant invalide" })
  assert.strictEqual(requested, false)
})
