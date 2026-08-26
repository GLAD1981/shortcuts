const assert = require("assert")
const fs = require("fs")
const path = require("path")
const test = require("node:test")
const vm = require("node:vm")

let comptes

test.before(async () => {
  const filename = path.join(__dirname, "..", "ComptesCommuns.js")
  const context = vm.createContext({
    module: { exports: {} },
    require: request => require(path.join(__dirname, "..", request)),
    console
  })
  const script = new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), { context, identifier: filename })
  await script.link(() => { throw new Error("Import inattendu") })
  await script.evaluate()
  comptes = context.module.exports
})

test("prepare prioritizes share input and extracts fields", () => {
  assert.deepEqual(
    comptes.prepare("Courses 1 234,50 €", "Ignoré 99"),
    { objet: "Courses", montant: "1234,50" }
  )
})

test("prepare uses the clipboard when share input is blank", () => {
  assert.deepEqual(
    comptes.prepare("  ", "Parking 12.50"),
    { objet: "Parking", montant: "12,50" }
  )
})

test("prepare extracts a number received from the share sheet", () => {
  assert.deepEqual(
    comptes.prepare(1, "Ignoré 99"),
    { objet: "", montant: "1" }
  )
})

test("run records the share input and clipboard in the transfer log", async () => {
  let transfer = ""
  const result = await comptes.run("", {
    getClipboard: () => "Parking 12,50",
    appendTransfer: line => { transfer = line },
    async syncTransfer() {}
  })

  assert.deepEqual(result, { ok: true, objet: "Parking", montant: "12,50" })
  assert.match(transfer, /"shareInput":""/)
  assert.match(transfer, /"clipboard":"Parking 12,50"/)
  assert.match(transfer, /"source":"clipboard"/)
})

test("run synchronizes the transfer log in debug mode", async () => {
  let synchronized = 0
  await comptes.run("", {
    getClipboard: () => "Parking 12,50",
    appendTransfer() {},
    async syncTransfer() { synchronized++ }
  })

  assert.strictEqual(synchronized, 1)
})

test("run prioritizes an explicit share input over an explicit clipboard", async () => {
  const result = await comptes.run({ shareInput: "Courses 12,50", clipboard: "Parking 9" }, {
    getClipboard: () => "Ignoré",
    appendTransfer() {},
    async syncTransfer() {}
  })

  assert.deepEqual(result, { ok: true, objet: "Courses", montant: "12,50" })
})

test("run uses an explicit clipboard when the share input is blank", async () => {
  const result = await comptes.run({ shareInput: "", clipboard: "Parking 9" }, {
    getClipboard: () => "Ignoré",
    appendTransfer() {},
    async syncTransfer() {}
  })

  assert.deepEqual(result, { ok: true, objet: "Parking", montant: "9" })
})

test("run returns prepared fields for the native Shortcut prompts", async () => {
  const result = await comptes.run("Courses 12,50", {
    getClipboard: () => "Ignoré 99",
    appendTransfer() {},
    async syncTransfer() {}
  })

  assert.deepEqual(result, { ok: true, objet: "Courses", montant: "12,50" })
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
    appendTransfer() {},
    async syncTransfer() {},
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
    appendTransfer() {},
    async syncTransfer() {},
    today: () => "2026-08-22"
  })

  assert.deepEqual(result, { ok: false, objet: "Courses", montant: "", erreur: "Montant invalide" })
  assert.strictEqual(requested, false)
})

test("runShortcut emits its output before completing Scriptable", async () => {
  const events = []
  const transfer = []
  const script = {
    setShortcutOutput(value) { events.push(["output", value]) },
    complete() { events.push(["complete"]) }
  }

  await comptes.runShortcut(script, { objet: "Courses", montant: "invalide" }, {
    appendTransfer(line) { transfer.push(JSON.parse(line)) },
    async syncTransfer() {}
  })

  assert.deepEqual(events, [
    ["output", { ok: false, objet: "Courses", montant: "", erreur: "Montant invalide" }],
    ["complete"]
  ])
  assert.deepEqual(transfer.map(entry => entry.stage), [
    "submit",
    "shortcut-output",
    "shortcut-complete"
  ])
})
