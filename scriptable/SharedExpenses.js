// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: money-bill-alt;
function loadModule(name) {
  return typeof importModule === "function" ? importModule(name) : require(`./${name}`)
}

const config = loadModule("ExpenseConfig")
const input = loadModule("ExpenseInput")

function strictEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function today() {
  const formatter = new DateFormatter()
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(new Date())
}

function buildExpenseUrl(object, amount, date) {
  return `${config.endpoint}?object=${strictEncode(object)}&amount=${strictEncode(amount)}&date=${strictEncode(date)}`
}

function runtime(overrides = {}) {
  return Object.assign({
    getClipboard: () => Pasteboard.pasteString(),
    createAlert: () => new Alert(),
    createRequest: url => new Request(url),
    createNotification: () => new Notification(),
    today
  }, overrides)
}

async function editExpense(seed, dependencies) {
  const alert = dependencies.createAlert()
  alert.title = "Dépense commune"
  alert.message = "Vérifiez les champs avant l’enregistrement."
  alert.addTextField("Objet", seed.text)
  const amountField = alert.addTextField("Montant", seed.amount)
  amountField.setDecimalPadKeyboard()
  alert.addAction("Ajouter la dépense")
  alert.addCancelAction("Annuler")
  if (await alert.presentAlert() === -1) return null

  const amount = input.parseAmount(alert.textFieldValue(1))
  if (!amount.found) {
    const error = dependencies.createAlert()
    error.title = "Montant invalide"
    error.message = "Saisissez un montant, par exemple 12,50."
    error.addAction("OK")
    await error.presentAlert()
    return null
  }
  return { object: input.trimText(alert.textFieldValue(0)), amount: amount.value, date: dependencies.today() }
}

async function submitExpense(expense, dependencies) {
  const request = dependencies.createRequest(buildExpenseUrl(expense.object, expense.amount, expense.date))
  request.timeoutInterval = 20
  const response = (await request.loadString()).trim()
  const status = request.response.statusCode
  if (status !== 200) throw new Error(`HTTP ${status}`)
  if (!response) throw new Error("Réponse serveur vide")
  if (response !== "Dépense ajoutée.") throw new Error(response)
}

async function notifySuccess(expense, dependencies) {
  const notification = dependencies.createNotification()
  notification.title = "Dépense ajoutée"
  notification.body = `${expense.object || "Dépense"} — ${expense.amount} €\nTouchez pour ouvrir les comptes.`
  notification.sound = "complete"
  notification.openURL = config.sheetUrl
  notification.addAction("Ouvrir les comptes", config.sheetUrl)
  await notification.schedule()
}

async function run(shareSheetInput, overrides) {
  const dependencies = runtime(overrides)
  const source = input.selectSource(shareSheetInput, dependencies.getClipboard())
  const expense = await editExpense(input.extractTextAndAmount(source), dependencies)
  if (!expense) return { ok: false, cancelled: true }
  try {
    await submitExpense(expense, dependencies)
    await notifySuccess(expense, dependencies)
    return { ok: true, expense }
  } catch (error) {
    const alert = dependencies.createAlert()
    alert.title = "Dépense non ajoutée"
    alert.message = String(error.message || error)
    alert.addAction("OK")
    await alert.presentAlert()
    return { ok: false, error: String(error.message || error) }
  }
}

module.exports = { buildExpenseUrl, run }
