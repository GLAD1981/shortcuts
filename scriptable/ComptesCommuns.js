// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: money-bill-alt;
const DEBUG_MODE = true
const ENDPOINT = "https://script.google.com/macros/s/AKfycbyXqRY95_U1bTUxKXiOC0NicLGA3v5DU8xrRjYVRnGzb5UdMoJWuMdqFYDXkt6QokHu/exec"
const TRANSFER_FILE = "Transfer.txt"

function trimText(value) {
  return String(value == null ? "" : value).replace(/\u00A0|\u202F/g, " ").trim()
}

function toText(value) {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("\n")
  return ""
}

function parseAmount(value) {
  const text = trimText(value).replace(/^€\s*|\s*€$/g, "")
  if (/^[+-]?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:,\d{1,2})?$/.test(text)) {
    return { found: true, value: text.replace(/[ .]/g, "") }
  }
  if (/^[+-]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text)) {
    return { found: true, value: text.replace(/[ ,]/g, "").replace(".", ",") }
  }
  return { found: false, value: "" }
}

function extractTextAndAmount(value) {
  const text = trimText(value)
  const wholeAmount = parseAmount(text)
  if (wholeAmount.found) return { text: "", amount: wholeAmount.value }

  const trailingPatterns = [
    /(?:^|\s)([+-]?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:,\d{1,2})?\s*€?)$/,
    /(?:^|\s)([+-]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{1,2})?\s*€?)$/
  ]
  for (const pattern of trailingPatterns) {
    const match = pattern.exec(text)
    if (!match) continue
    const trailingAmount = parseAmount(match[1])
    if (trailingAmount.found) return { text: trimText(text.slice(0, match.index)), amount: trailingAmount.value }
  }
  return { text, amount: "" }
}

function prepare(shareInput, clipboard) {
  const source = trimText(toText(shareInput)) || trimText(clipboard)
  const extracted = extractTextAndAmount(source)
  return { objet: extracted.text, montant: extracted.amount }
}

function strictEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function today() {
  const formatter = new DateFormatter()
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(new Date())
}

function appendTransfer(line) {
  const fileManager = FileManager.iCloud()
  const path = fileManager.joinPath(fileManager.documentsDirectory(), TRANSFER_FILE)
  const previous = fileManager.fileExists(path) ? fileManager.readString(path) : ""
  fileManager.writeString(path, `${previous}${line}\n`)
}

function runtime(overrides = {}) {
  return Object.assign({
    getClipboard: () => Pasteboard.pasteString(),
    createRequest: url => new Request(url),
    appendTransfer,
    today
  }, overrides)
}

function buildExpenseUrl(objet, montant, date) {
  return `${ENDPOINT}?object=${strictEncode(objet)}&amount=${strictEncode(montant)}&date=${strictEncode(date)}`
}

async function submit(payload, overrides) {
  const dependencies = runtime(overrides)
  const objet = trimText(payload.objet)
  const amount = parseAmount(payload.montant)
  if (!amount.found) return { ok: false, objet, montant: "", erreur: "Montant invalide" }

  try {
    const request = dependencies.createRequest(buildExpenseUrl(objet, amount.value, dependencies.today()))
    request.timeoutInterval = 20
    const response = (await request.loadString()).trim()
    const status = request.response && request.response.statusCode
    if (status !== 200) throw new Error(`HTTP ${status || "inconnu"}`)
    if (response !== "Dépense ajoutée.") throw new Error(response || "Réponse serveur vide")
    const expense = { objet, montant: amount.value }
    return { ok: true, ...expense }
  } catch (error) {
    return { ok: false, objet, montant: amount.value, erreur: String(error.message || error) }
  }
}

function isSubmissionPayload(parameter) {
  return parameter && typeof parameter === "object" &&
    Object.prototype.hasOwnProperty.call(parameter, "objet") &&
    Object.prototype.hasOwnProperty.call(parameter, "montant")
}

function isInputPayload(parameter) {
  return parameter && typeof parameter === "object" &&
    Object.prototype.hasOwnProperty.call(parameter, "shareInput") &&
    Object.prototype.hasOwnProperty.call(parameter, "clipboard")
}

async function recordDebug(dependencies, entry) {
  if (!DEBUG_MODE) return
  try {
    dependencies.appendTransfer(JSON.stringify({ date: new Date().toISOString(), ...entry }))
  } catch (error) {
    console.error(`[ComptesCommuns] Journal de transfert : ${String(error.message || error)}`)
  }
}

function recordLifecycle(dependencies, entry) {
  if (!DEBUG_MODE) return
  try {
    dependencies.appendTransfer(JSON.stringify({ date: new Date().toISOString(), ...entry }))
  } catch (error) {
    console.error(`[ComptesCommuns] Journal de cycle : ${String(error.message || error)}`)
  }
}

async function run(parameter, overrides) {
  const dependencies = runtime(overrides)
  if (isSubmissionPayload(parameter)) {
    const result = await submit(parameter, dependencies)
    await recordDebug(dependencies, { stage: "submit", payload: parameter, result })
    return result
  }
  const input = isInputPayload(parameter)
    ? { shareInput: parameter.shareInput, clipboard: parameter.clipboard }
    : { shareInput: parameter, clipboard: dependencies.getClipboard() }
  const sharedText = toText(input.shareInput)
  const prepared = prepare(input.shareInput, input.clipboard)
  await recordDebug(dependencies, {
    stage: "prepare",
    shareInputType: typeof input.shareInput,
    shareInput: sharedText,
    clipboard: trimText(input.clipboard),
    source: trimText(sharedText) ? "share" : "clipboard",
    prepared
  })
  return { ok: true, ...prepared }
}

async function runShortcut(script, parameter, overrides) {
  const dependencies = runtime(overrides)
  let result
  try {
    result = await run(parameter, dependencies)
  } catch (error) {
    console.error(`[ComptesCommuns] Échec : ${String(error.message || error)}`)
    result = { ok: false, erreur: String(error.message || error) }
  }
  recordLifecycle(dependencies, { stage: "shortcut-output", result })
  script.setShortcutOutput(result)
  recordLifecycle(dependencies, { stage: "shortcut-complete" })
  script.complete()
  return result
}

module.exports = { prepare, submit, run, runShortcut }

if (typeof Script !== "undefined" && Script.name() === "ComptesCommuns") {
  runShortcut(Script, args.shortcutParameter).catch(error => {
    console.error(`[ComptesCommuns] Échec sans contenu : ${String(error && error.message || error)}`)
  })
}
