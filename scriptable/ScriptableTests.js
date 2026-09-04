// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: vial;
const publisher = importModule("PublishLibrary")
const comptesCommuns = importModule("ComptesCommuns")
const universalClipboard = importModule("UniversalClipboard")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function run() {
  const results = []
  async function test(name, action) {
    try {
      await action()
      results.push({ name, ok: true })
    } catch (error) {
      results.push({ name, ok: false, message: String(error.message || error) })
    }
  }

  await test("Préparation des comptes communs", () => {
    const expense = comptesCommuns.prepare("Courses 1 234,50 €", "Ignoré 99")
    assert(expense.objet === "Courses", "Objet non extrait")
    assert(expense.montant === "1234,50", "Montant non normalisé")
  })
  await test("Montant numérique reçu par partage", () => {
    const expense = comptesCommuns.prepare(1, "Ignoré 99")
    assert(expense.objet === "", "Objet inattendu")
    assert(expense.montant === "1", "Montant numérique ignoré")
  })
  await test("Vecteurs Universal Clipboard v2", () => {
    const adapter = {
      toBase64: data => data.toBase64String(),
      fromBase64: value => Data.fromBase64String(value),
      getBytes: data => Uint8Array.from(data.getBytes()),
      fromBytes: bytes => Data.fromBytes(Array.from(bytes)),
      utf8Data: text => Data.fromString(text),
      rawString: data => data.toRawString()
    }
    const vectors = [
      { base64: "", sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      { base64: "aGVsbG8=", sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
      { base64: "AAF/gP8=", sha256: "0150a92bb1212cd00516b65fde0704614760000963874fcbb11eaa734ee87809" }
    ]
    for (const vector of vectors) {
      const data = vector.base64 === "" ? Data.fromBytes([]) : Data.fromBase64String(vector.base64)
      const split = universalClipboard.splitData(data, adapter)
      assert(split.sha256 === vector.sha256, "SHA-256 Universal Clipboard différent")
      const rebuilt = universalClipboard.assembleChunks(split.chunks, split.bytes, split.sha256, adapter)
      assert(rebuilt.toBase64String() === vector.base64, "Round-trip Universal Clipboard différent")
    }
  })
  await test("Limites et entrée Pushcut Universal Clipboard v2", () => {
    const limits = universalClipboard.limits()
    assert(limits.chunkBytes === 3145728, "Limite de bloc incorrecte")
    assert(limits.fileBytes === 26214400, "Limite de fichier incorrecte")
    const transferId = "00112233445566778899aabbccddeeff"
    const invocation = universalClipboard.normalizeInvocation({
      fileURLs: [], plainTexts: [], images: [], shortcutParameter: transferId
    })
    assert(invocation.action === "receive", "Action Pushcut incorrecte")
    assert(invocation.transferId === transferId, "Identifiant Pushcut incorrect")
  })
  await test("Aller-retour injecté Universal Clipboard v2", async () => {
    const adapter = {
      toBase64: data => data.toBase64String(),
      fromBase64: value => Data.fromBase64String(value),
      getBytes: data => Uint8Array.from(data.getBytes()),
      fromBytes: bytes => Data.fromBytes(Array.from(bytes)),
      utf8Data: text => Data.fromString(text),
      rawString: data => data.toRawString()
    }
    const transferId = "00112233445566778899aabbccddeeff"
    const calls = []
    const store = new Map()
    const firebaseRequest = async (method, path, body) => {
      calls.push(`${method} ${path}`)
      if (method === "GET") return store.get(path) || null
      if (method === "PUT") store.set(path, JSON.parse(JSON.stringify(body)))
      if (method === "PATCH") store.set(path, { ...(store.get(path) || {}), ...body })
      if (method === "DELETE") store.delete(path)
      return body == null ? null : body
    }
    const publishRuntime = {
      binaryAdapter: adapter,
      generateTransferId: () => transferId,
      nowTimestamp: () => "20260904120000",
      firebaseRequest,
      async delay() {}
    }
    const prepared = await universalClipboard.prepareTextTransfer("hello", "pc", publishRuntime)
    await universalClipboard.publishPreparedTransfer(prepared, publishRuntime)
    assert(calls[calls.length - 1] === `PUT queues/toPc/${transferId}`, "File publiée trop tôt")

    const incomingData = Data.fromString("hello")
    const incomingSplit = universalClipboard.splitData(incomingData, adapter)
    const incomingIndex = {
      version: 2, source: "pc", destination: "iphone",
      created: "20260904120000", expires: "20260911120000", state: "ready",
      kind: "text", fileCount: 0, totalBytes: 5, encodedBytes: 8
    }
    store.set(`queues/toIphone/${transferId}`, {
      version: 2, created: incomingIndex.created, kind: "text"
    })
    store.set(`index/${transferId}`, incomingIndex)
    store.set(`payloads/${transferId}/manifest`, {
      version: 2, source: "pc", destination: "iphone", kind: "text",
      fileCount: 0, totalBytes: 5
    })
    store.set(`payloads/${transferId}/text/meta`, {
      bytes: 5, sha256: incomingSplit.sha256, chunkCount: 1
    })
    store.set(`payloads/${transferId}/text/chunks/c0001`, {
      bytes: 5, sha256: incomingSplit.chunks[0].sha256, data: incomingSplit.chunks[0].data
    })
    let applied = {}
    let deleteFailures = 3
    let copies = 0
    const receiveRuntime = {
      binaryAdapter: adapter,
      nowTimestamp: () => "20260904120100",
      async firebaseRequest(method, path, body) {
        if (method === "DELETE" && deleteFailures > 0) {
          deleteFailures--
          throw new Error("injected-delete-failure")
        }
        return firebaseRequest(method, path, body)
      },
      async delay() {},
      loadApplied: () => ({ ...applied }),
      saveApplied: value => { applied = { ...value } },
      copyString: value => { assert(value === "hello", "Texte reçu incorrect"); copies++ }
    }
    const first = await universalClipboard.receive(transferId, receiveRuntime)
    const second = await universalClipboard.receive(transferId, receiveRuntime)
    assert(first.ok && first.cleanupPending, "Première réception injectée incorrecte")
    assert(second.ok && second.duplicate, "Idempotence injectée incorrecte")
    assert(copies === 1, "Effet local Universal Clipboard répété")
  })
  await test("Journal de transfert des comptes communs", async () => {
    let transfer = ""
    await comptesCommuns.run("", {
      getClipboard: () => "Parking 12,50",
      appendTransfer: line => { transfer = line },
      async syncTransfer() {}
    })
    assert(transfer.includes('"source":"clipboard"'), "Source presse-papiers absente")
  })
  await test("Presse-papiers transmis par Raccourcis", async () => {
    const expense = await comptesCommuns.run({ shareInput: "", clipboard: "Parking 9" }, {
      appendTransfer() {},
      async syncTransfer() {}
    })
    assert(expense.objet === "Parking", "Objet du presse-papiers absent")
    assert(expense.montant === "9", "Montant du presse-papiers absent")
  })
  await test("Envoi des comptes communs sans effet réel", async () => {
    const state = { requestUrl: "" }
    const runtime = {
      createRequest: url => ({ response: { statusCode: 200 }, async loadString() { state.requestUrl = url; return "Dépense ajoutée." } }),
      createNotification: () => { throw new Error("Notification inattendue") },
      appendTransfer() {},
      async syncTransfer() {},
      today: () => "2026-08-22"
    }
    const result = await comptesCommuns.run({ objet: "Courses", montant: "12,50" }, runtime)
    assert(result.ok, "Le flux a échoué")
    assert(/object=Courses&amount=12%2C50/.test(state.requestUrl), "Requête incorrecte")
  })
  await test("Publication GitHub atomique", async () => {
    const paths = []
    const api = {
      async request(method, path, body) {
        paths.push({ method, path, body })
        if (path === "git/ref/heads/main") return { object: { sha: "parent" } }
        if (path === "git/commits/parent") return { tree: { sha: "base" } }
        if (path === "git/trees/base?recursive=1") return { tree: [] }
        if (path === "git/trees") return { sha: "tree" }
        if (path === "git/commits") return { sha: "commit" }
        if (path === "git/refs/heads/main") return {}
        throw new Error(`Appel inattendu : ${method} ${path}`)
      }
    }
    const result = await publisher.publish(api, [{ path: "Test.js", content: "" }], "main")
    assert(result.sha === "commit", "Commit absent")
    assert(paths.filter(call => call.path === "git/commits").length === 1, "Plusieurs commits créés")
  })
  await test("Parcours des scripts Scriptable", async () => {
    const contents = { root: ["One.js", "nested"], "root/nested": ["Two.js"] }
    const fileManager = {
      listContents: path => contents[path],
      joinPath: (left, right) => `${left}/${right}`,
      isDirectory: path => Object.hasOwn(contents, path),
      async downloadFileFromiCloud() {},
      readString: path => `// ${path}`
    }
    const files = await publisher.collectScriptFiles(fileManager, "root")
    assert(files.length === 2, "Les scripts n'ont pas été parcourus")
  })
  return { ok: results.every(result => result.ok), results }
}

async function present(result) {
  const failures = result.results.filter(test => !test.ok)
  const report = result.results.map(test => `${test.ok ? "PASS" : "FAIL"} — ${test.name}${test.message ? ` : ${test.message}` : ""}`).join("\n")
  const alert = new Alert()
  alert.title = failures.length ? "Tests Scriptable : échec" : "Tests Scriptable : succès"
  alert.message = report
  alert.addAction("OK")
  await alert.presentAlert()
}

module.exports = { run, present }

if (Script.name() === "ScriptableTests") {
  run().then(async result => {
    await present(result)
    Script.setShortcutOutput(result)
  }).catch(error => {
    console.error(`[ScriptableTests] Échec : ${String(error.message || error)}`)
  })
}
