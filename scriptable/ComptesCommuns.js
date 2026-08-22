// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: money-bill-alt;
const shortcutInputs = typeof importModule === "function" ? importModule("ShortcutInputs") : require("./ShortcutInputs")
const ENDPOINT = "https://script.google.com/macros/s/AKfycbyXqRY95_U1bTUxKXiOC0NicLGA3v5DU8xrRjYVRnGzb5UdMoJWuMdqFYDXkt6QokHu/exec"
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1FYMtigzGJMiEN2PoS3MttShdzJ75mY3lzaF5u_7PCeU/edit#gid=0"

function trimText(value) {
  return String(value == null ? "" : value).replace(/\u00A0|\u202F/g, " ").trim()
}

function toText(value) {
  if (typeof value === "string") return value
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

function runtime(overrides = {}) {
  return Object.assign({
    getClipboard: () => Pasteboard.pasteString(),
    createRequest: url => new Request(url),
    createNotification: () => new Notification(),
    inputs: shortcutInputs,
    today
  }, overrides)
}

function buildExpenseUrl(objet, montant, date) {
  return `${ENDPOINT}?object=${strictEncode(objet)}&amount=${strictEncode(montant)}&date=${strictEncode(date)}`
}

async function notifySuccess(expense, dependencies) {
  const notification = dependencies.createNotification()
  notification.title = "Dépense ajoutée"
  notification.body = `${expense.objet || "Dépense"} — ${expense.montant} €\nTouchez pour ouvrir les comptes.`
  notification.sound = "complete"
  notification.openURL = SHEET_URL
  notification.addAction("Ouvrir les comptes", SHEET_URL)
  await notification.schedule()
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
    await notifySuccess(expense, dependencies)
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

async function run(parameter, overrides) {
  if (isSubmissionPayload(parameter)) return submit(parameter, overrides)
  const dependencies = runtime(overrides)
  const prepared = prepare(parameter, dependencies.getClipboard())
  const objet = await dependencies.inputs.text({ object: "Objet", default: prepared.objet, multiLine: false })
  const montant = await dependencies.inputs.number({ object: "Montant", default: prepared.montant, negative: false, decimals: true })
  return submit({ objet, montant }, dependencies)
}

module.exports = { prepare, submit, run }

if (typeof Script !== "undefined" && Script.name() === "ComptesCommuns") {
  run(args.shortcutParameter).then(result => {
    Script.setShortcutOutput(result)
    Script.complete()
  }).catch(error => {
    console.error(`[ComptesCommuns] Échec : ${String(error.message || error)}`)
    Script.setShortcutOutput({ ok: false, erreur: String(error.message || error) })
    Script.complete()
  })
}
