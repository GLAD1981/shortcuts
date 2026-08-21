const assert = require("assert")
const test = require("node:test")
const publisher = require("../PublishLibraryCore")

test("collectScriptFiles recursively keeps JavaScript files", async () => {
  const contents = {
    root: ["One.js", "nested", "README.md"],
    "root/nested": ["Two.js"]
  }
  const fm = {
    contentsOfDirectory: path => contents[path],
    joinPath: (left, right) => `${left}/${right}`,
    isDirectory: path => Object.hasOwn(contents, path),
    async downloadFileFromiCloud() {},
    readString: path => `// ${path}`
  }

  const files = await publisher.collectScriptFiles(fm, "root")

  assert.deepStrictEqual(files, [
    { path: "One.js", content: "// root/One.js" },
    { path: "nested/Two.js", content: "// root/nested/Two.js" }
  ])
})

test("publish creates one commit and mirrors remote scripts", async () => {
  const calls = []
  const api = {
    async request(method, path, body) {
      calls.push({ method, path, body })
      if (path === "git/ref/heads/main") return { object: { sha: "parent" } }
      if (path === "git/commits/parent") return { tree: { sha: "base-tree" } }
      if (path === "git/trees/base-tree?recursive=1") {
        return { tree: [{ path: "scriptable/Old.js", type: "blob" }, { path: "README.md", type: "blob" }] }
      }
      if (path === "git/trees") return { sha: "new-tree" }
      if (path === "git/commits") return { sha: "new-commit" }
      if (path === "git/refs/heads/main") return {}
      throw new Error(`Unexpected request: ${method} ${path}`)
    }
  }

  const result = await publisher.publish(api, [{ path: "New.js", content: "module.exports = {}" }], "main")
  const tree = calls.find(call => call.path === "git/trees").body

  assert.strictEqual(result.sha, "new-commit")
  assert.deepStrictEqual(tree.tree, [
    { path: "scriptable/New.js", mode: "100644", type: "blob", content: "module.exports = {}" },
    { path: "scriptable/Old.js", mode: "100644", type: "blob", sha: null }
  ])
  assert.strictEqual(calls.filter(call => call.path === "git/commits").length, 1)
})
