async function collectScriptFiles(fileManager, root, directory = root) {
  const files = []
  for (const name of fileManager.contentsOfDirectory(directory)) {
    const path = fileManager.joinPath(directory, name)
    if (fileManager.isDirectory(path)) {
      files.push(...await collectScriptFiles(fileManager, root, path))
      continue
    }
    if (!name.endsWith(".js")) continue
    await fileManager.downloadFileFromiCloud(path)
    files.push({ path: path.slice(root.length + 1), content: fileManager.readString(path) })
  }
  return files
}

async function publish(api, files, branch) {
  if (files.length === 0) throw new Error("Aucun script JavaScript à publier")

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

module.exports = { collectScriptFiles, publish }
