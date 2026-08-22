// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: cloud-upload-alt;
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

async function collectScriptFiles(fileManager, root, directory = root) {
  const files = []
  for (const name of fileManager.listContents(directory)) {
    const path = fileManager.joinPath(directory, name)
    if (fileManager.isDirectory(path)) {
      files.push(...await collectScriptFiles(fileManager, root, path))
      continue
    }
    const relativePath = path.slice(root.length + 1)
    if (!name.endsWith(".js") && relativePath !== "Transfer.txt") continue
    await fileManager.downloadFileFromiCloud(path)
    files.push({ path: relativePath, content: fileManager.readString(path) })
  }
  return files
}

async function publish(api, files, branch) {
  if (files.length === 0) throw new Error("Aucun fichier Scriptable à publier")

  const reference = await api.request("GET", `git/ref/heads/${branch}`)
  const parentSha = reference.object.sha
  const parent = await api.request("GET", `git/commits/${parentSha}`)
  const remoteTree = await api.request("GET", `git/trees/${parent.tree.sha}?recursive=1`)
  if (remoteTree.truncated) throw new Error("Arborescence GitHub trop volumineuse")

  const localPaths = new Set(files.map(file => `scriptable/${file.path}`))
  const entries = files.map(file => ({
    path: `scriptable/${file.path}`,
    mode: "100644",
    type: "blob",
    content: file.content
  }))
  for (const file of remoteTree.tree) {
    if (file.type === "blob" && file.path.startsWith("scriptable/") && file.path.endsWith(".js") && !localPaths.has(file.path)) {
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: null })
    }
  }

  const tree = await api.request("POST", "git/trees", { base_tree: parent.tree.sha, tree: entries })
  const commit = await api.request("POST", "git/commits", {
    message: `Mettre à jour la bibliothèque Scriptable (${files.length} scripts)`,
    tree: tree.sha,
    parents: [parentSha]
  })
  await api.request("PATCH", `git/refs/heads/${branch}`, { sha: commit.sha, force: false })
  return { sha: commit.sha, count: files.length }
}

async function run() {
  try {
    const fileManager = FileManager.iCloud()
    const root = fileManager.documentsDirectory()
    const allFiles = await collectScriptFiles(fileManager, root)
    const files = allFiles.filter(file => file.path !== "UpdateLibrary.js")
    log(`${files.length} fichier(s) à publier`)
    const result = await publish(createApi(await getToken()), files, BRANCH)
    log(`Commit publié : ${result.sha}`)
    const alert = new Alert()
    alert.title = "GitHub mis à jour"
    alert.message = `${result.count} fichier(s) publiés dans le commit ${result.sha.slice(0, 7)}.`
    alert.addAction("OK")
    await alert.presentAlert()
    return { ok: true, ...result }
  } catch (error) {
    const message = String(error.message || error)
    console.error(`[PublishLibrary] ${message}`)
    const alert = new Alert()
    alert.title = "Publication GitHub échouée"
    alert.message = message
    alert.addAction("OK")
    await alert.presentAlert()
    return { ok: false, error: message }
  }
}

module.exports = { collectScriptFiles, publish, run }

if (typeof Script !== "undefined" && Script.name() === "PublishLibrary") {
  run().then(result => {
    Script.setShortcutOutput(result)
    Script.complete()
  }).catch(error => {
    console.error(`[PublishLibrary] Échec : ${String(error.message || error)}`)
    Script.setShortcutOutput({ ok: false, error: String(error.message || error) })
    Script.complete()
  })
}
