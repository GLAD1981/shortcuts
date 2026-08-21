const config = importModule("ExpenseConfig")
const input = importModule("ExpenseInput")

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

async function editExpense(seed) {
  const alert = new Alert()
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
    const error = new Alert()
    error.title = "Montant invalide"
    error.message = "Saisissez un montant, par exemple 12,50."
    error.addAction("OK")
    await error.presentAlert()
    return null
  }
  return { object: input.trimText(alert.textFieldValue(0)), amount: amount.value, date: today() }
}

async function submitExpense(expense) {
  const request = new Request(buildExpenseUrl(expense.object, expense.amount, expense.date))
  request.timeoutInterval = 20
  const response = (await request.loadString()).trim()
  const status = request.response.statusCode
  if (status !== 200) throw new Error(`HTTP ${status}`)
  if (!response) throw new Error("Réponse serveur vide")
  if (response !== "Dépense ajoutée.") throw new Error(response)
}

async function notifySuccess(expense) {
  const notification = new Notification()
  notification.title = "Dépense ajoutée"
  notification.body = `${expense.object || "Dépense"} — ${expense.amount} €\nTouchez pour ouvrir les comptes.`
  notification.sound = "complete"
  notification.openURL = config.sheetUrl
  notification.addAction("Ouvrir les comptes", config.sheetUrl)
  await notification.schedule()
}

async function run(shareSheetInput) {
  const source = input.selectSource(shareSheetInput, Pasteboard.pasteString())
  const expense = await editExpense(input.extractTextAndAmount(source))
  if (!expense) return { ok: false, cancelled: true }
  try {
    await submitExpense(expense)
    await notifySuccess(expense)
    return { ok: true, expense }
  } catch (error) {
    const alert = new Alert()
    alert.title = "Dépense non ajoutée"
    alert.message = String(error.message || error)
    alert.addAction("OK")
    await alert.presentAlert()
    return { ok: false, error: String(error.message || error) }
  }
}

module.exports = { buildExpenseUrl, run }
