// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: magic;
const publisher = importModule("PublishLibraryCore")

const OWNER = "GLAD1981"
const REPO = "shortcuts"
const BRANCH = "main"
const TOKEN_KEY = "GLAD1981.shortcuts.github-token"

function log(message) {
  console.log(`[PublishLibrary] ${message}`)
}

async function getToken() {
  if (Keychain.contains(TOKEN_KEY)) return Keychain.get(TOKEN_KEY)

  const alert = new Alert()
  alert.title = "Jeton GitHub"
  alert.message = "Créez un jeton à accès lecture/écriture Contents pour GLAD1981/shortcuts."
  alert.addSecureTextField("Jeton GitHub")
  alert.addAction("Enregistrer")
  alert.addCancelAction("Annuler")
  if (await alert.presentAlert() === -1) throw new Error("Publication annulée")
  const token = alert.textFieldValue(0).trim()
  if (!token) throw new Error("Jeton GitHub vide")
  Keychain.set(TOKEN_KEY, token)
  return token
}

function createApi(token) {
  return {
    async request(method, path, body) {
      const request = new Request(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`)
      request.method = method
      request.headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
      if (body) request.body = JSON.stringify(body)
      const response = await request.loadJSON()
      if (!request.response || request.response.statusCode < 200 || request.response.statusCode >= 300) {
        throw new Error(`GitHub HTTP ${request.response ? request.response.statusCode : "inconnu"}`)
      }
      return response
    }
  }
}

try {
  const fileManager = FileManager.iCloud()
  const root = fileManager.documentsDirectory()
  const allFiles = await publisher.collectScriptFiles(fileManager, root)
  const files = allFiles.filter(file => file.path !== "UpdateLibrary.js")
  log(`${files.length} script(s) à publier`)
  const result = await publisher.publish(createApi(await getToken()), files, BRANCH)
  log(`Commit publié : ${result.sha}`)
  const alert = new Alert()
  alert.title = "GitHub mis à jour"
  alert.message = `${result.count} script(s) publiés dans le commit ${result.sha.slice(0, 7)}.`
  alert.addAction("OK")
  await alert.presentAlert()
  Script.setShortcutOutput({ ok: true, ...result })
} catch (error) {
  console.error(`[PublishLibrary] ${String(error.message || error)}`)
  const alert = new Alert()
  alert.title = "Publication GitHub échouée"
  alert.message = String(error.message || error)
  alert.addAction("OK")
  await alert.presentAlert()
  Script.setShortcutOutput({ ok: false, error: String(error.message || error) })
} finally {
  Script.complete()
}
