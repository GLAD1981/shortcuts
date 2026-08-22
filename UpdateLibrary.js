// UpdateLibrary.js
// Télécharge tous les scripts JavaScript du dossier scriptable/
// depuis GitHub et les installe dans le dossier Scriptable.
//
// À conserver comme script local dans Scriptable.
// Il ne doit pas être téléchargé depuis scriptable/ pendant son exécution.

const OWNER = "GLAD1981"
const REPO = "shortcuts"
const BRANCH = "main"
const REMOTE_FOLDER = "scriptable"
const MANIFEST_NAME = "ShortcutsLibraryManifest.json"

const fm = FileManager.iCloud()
const destinationRoot = fm.documentsDirectory()
const manifestPath = fm.joinPath(destinationRoot, MANIFEST_NAME)

function log(message) {
  console.log(`[UpdateLibrary] ${message}`)
}

function destinationPath(relativePath) {
  return fm.joinPath(destinationRoot, relativePath)
}

function parentDirectory(path) {
  const index = path.lastIndexOf("/")
  return index === -1 ? destinationRoot : path.substring(0, index)
}

function readManifest() {
  if (!fm.fileExists(manifestPath)) return []
  try {
    const manifest = JSON.parse(fm.readString(manifestPath))
    return Array.isArray(manifest.files) ? manifest.files.filter(path => typeof path === "string") : []
  } catch (error) {
    log(`Manifeste ignoré : ${String(error.message || error)}`)
    return []
  }
}

async function fetchJSON(url) {
  const request = new Request(url)
  request.headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  }

  const response = await request.loadJSON()

  if (request.response && request.response.statusCode >= 400) {
    throw new Error(`GitHub HTTP ${request.response.statusCode}`)
  }

  return response
}

async function fetchText(url) {
  const request = new Request(url)
  const text = await request.loadString()

  if (request.response && request.response.statusCode >= 400) {
    throw new Error(`Téléchargement HTTP ${request.response.statusCode}`)
  }

  return text
}

async function scheduleNotification(title, body) {
  const notification = new Notification()
  notification.title = title
  notification.body = body
  await notification.schedule()
}

try {
  log(`Début de mise à jour depuis ${OWNER}/${REPO}@${BRANCH}`)
  const treeURL =
    `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`

  log("Lecture de l'arborescence GitHub")
  const tree = await fetchJSON(treeURL)

  if (!Array.isArray(tree.tree)) {
    throw new Error("Arborescence GitHub invalide")
  }

  const files = tree.tree
    .filter(item =>
      item.type === "blob" &&
      item.path.startsWith(`${REMOTE_FOLDER}/`) &&
      item.path.endsWith(".js")
    )
    .map(item => ({
      remotePath: item.path,
      localPath: item.path.substring(REMOTE_FOLDER.length + 1)
    }))

  log(`${files.length} script(s) détecté(s) dans ${REMOTE_FOLDER}/`)
  if (files.length === 0)
    throw new Error(`Aucun script .js trouvé dans ${REMOTE_FOLDER}/ sur ${BRANCH}`)

  const previousFiles = readManifest()
  const remotePaths = new Set(files.map(file => file.localPath))
  for (const file of files) {
    const rawURL =
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${file.remotePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`

    log(`Téléchargement : ${file.remotePath}`)
    const source = await fetchText(rawURL)
    const localPath = destinationPath(file.localPath)
    const directory = parentDirectory(localPath)

    if (!fm.fileExists(directory)) {
      fm.createDirectory(directory, true)
    }

    fm.writeString(localPath, source)
    log(`Écrit : ${file.localPath}`)
  }

  const obsoleteFiles = previousFiles.filter(path => !remotePaths.has(path))
  for (const relativePath of obsoleteFiles) {
    const localPath = destinationPath(relativePath)
    if (!fm.fileExists(localPath)) continue
    fm.remove(destinationPath(relativePath))
    log(`Supprimé : ${relativePath}`)
  }
  fm.writeString(manifestPath, JSON.stringify({ files: files.map(file => file.localPath) }))

  await scheduleNotification("Scriptable", `${files.length} script(s) mis à jour depuis GitHub`)
  log(`Terminé : ${files.length} fichier(s)`)
} catch (error) {
  const message = String(error.message || error)
  console.error(`[UpdateLibrary] Échec : ${message}`)
  try {
    await scheduleNotification("Échec de mise à jour Scriptable", message)
  } catch (notificationError) {
    console.error(`[UpdateLibrary] Échec de notification : ${String(notificationError.message || notificationError)}`)
  }

  throw error
} finally {
  Script.complete()
}
