const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const clipboard = require("../UniversalClipboard")

function fixtureVectors() {
  const fixture = fs.readFileSync(
    path.join(__dirname, "fixtures", "universal-clipboard-v2-vectors.tsv"),
    "utf8"
  ).trimEnd().split(/\r?\n/)
  assert.equal(fixture.shift(), "name\thex\tbytes\tbase64\tsha256")
  return fixture.map(line => {
    const [name, hex, bytes, base64, sha256] = line.split("\t")
    return { name, hex, bytes: Number(bytes), base64, sha256 }
  })
}

function validIndex(overrides = {}) {
  return {
    version: 2,
    source: "iphone",
    destination: "pc",
    created: "20260903120000",
    expires: "20260910120000",
    state: "ready",
    kind: "files",
    fileCount: 1,
    totalBytes: 5,
    encodedBytes: 8,
    ...overrides
  }
}

function validFileMeta(overrides = {}) {
  return {
    filename: "photo.png",
    mime: "image/png",
    bytes: 5,
    sha256: "0150a92bb1212cd00516b65fde0704614760000963874fcbb11eaa734ee87809",
    chunkCount: 1,
    ...overrides
  }
}

const nodeAdapter = {
  toBase64: data => Buffer.from(data).toString("base64"),
  fromBase64: value => Buffer.from(value, "base64"),
  getBytes: data => Uint8Array.from(data),
  fromBytes: bytes => Buffer.from(bytes),
  utf8Data: text => Buffer.from(text, "utf8"),
  rawString: data => Buffer.from(data).toString("utf8")
}

test("protocol limits and deterministic identifiers reject out-of-range values", () => {
  assert.deepEqual(clipboard.limits(), {
    chunkBytes: 3145728,
    textBytes: 6291456,
    fileBytes: 26214400,
    fileCount: 10,
    transferBytes: 104857600,
    pendingTransfers: 5,
    retentionDays: 7
  })
  assert.equal(clipboard.isTransferId("00112233445566778899aabbccddeeff"), true)
  assert.equal(clipboard.isTransferId("00112233445566778899AABBCCDDEEFF"), false)
  assert.equal(clipboard.isTransferId("0011"), false)
  assert.equal(clipboard.fileId(1), "f0001")
  assert.equal(clipboard.fileId(10), "f0010")
  assert.equal(clipboard.fileId(11), null)
  assert.equal(clipboard.chunkId(1), "c0001")
  assert.equal(clipboard.chunkId(9999), "c9999")
  assert.equal(clipboard.chunkId(0), null)
  assert.equal(clipboard.expectedChunkCount(0), 0)
  assert.equal(clipboard.expectedChunkCount(3145728), 1)
  assert.equal(clipboard.expectedChunkCount(3145729), 2)
  assert.equal(clipboard.expectedChunkCount(-1), null)
})

test("flat index validation rejects malformed protocol fields", () => {
  assert.equal(clipboard.validateIndex(validIndex()), true)
  const invalid = [
    { version: 1 }, { source: "watch" }, { destination: "iphone", source: "iphone" },
    { created: "20260230120000" }, { expires: "20260911120000" },
    { state: "done" }, { kind: "folder" }, { fileCount: 11 },
    { totalBytes: 104857601 }, { encodedBytes: 4 },
    { kind: "text", fileCount: 1 },
    { kind: "text", fileCount: 0, totalBytes: 6291457, encodedBytes: 8388612 }
  ]
  for (const mutation of invalid) {
    assert.equal(clipboard.validateIndex(validIndex(mutation)), false, JSON.stringify(mutation))
  }
  assert.equal(clipboard.validateIndex(validIndex({ extra: { nested: true } })), false)
})

test("flat file metadata validation rejects paths, invalid hashes, and wrong chunk counts", () => {
  assert.equal(clipboard.validateFileMeta(validFileMeta()), true)
  const invalid = [
    { filename: "../photo.png" }, { filename: "folder/photo.png" },
    { mime: "png" }, { bytes: 26214401 }, { sha256: "A".repeat(64) },
    { chunkCount: 2 }
  ]
  for (const mutation of invalid) {
    assert.equal(clipboard.validateFileMeta(validFileMeta(mutation)), false, JSON.stringify(mutation))
  }
  assert.equal(clipboard.validateFileMeta(validFileMeta({ extra: ["nested"] })), false)
})

test("incremental SHA-256 matches the shared literal vectors", () => {
  const vectors = fixtureVectors()
  assert.deepEqual(vectors.map(vector => vector.name), ["empty", "hello", "binary-edge"])
  for (const vector of vectors) {
    const bytes = Buffer.from(vector.hex, "hex")
    assert.equal(bytes.length, vector.bytes)
    assert.equal(bytes.toString("base64"), vector.base64)
    assert.equal(clipboard.sha256Hex(bytes), vector.sha256)
    assert.equal(clipboard.sha256Hex(bytes), crypto.createHash("sha256").update(bytes).digest("hex"))
    const incremental = new clipboard.Sha256()
    incremental.update(bytes.subarray(0, 2))
    incremental.update(bytes.subarray(2))
    assert.equal(incremental.digestHex(), vector.sha256)
  }
})

test("découpe une frontière de 3 Mio en objets plats et la reconstruit", () => {
  const input = Buffer.alloc(3145729)
  for (let index = 0; index < input.length; index++) input[index] = index % 251
  const result = clipboard.splitData(input, nodeAdapter)

  assert.equal(result.bytes, 3145729)
  assert.equal(result.sha256, crypto.createHash("sha256").update(input).digest("hex"))
  assert.equal(result.chunks.length, 2)
  assert.deepEqual(
    result.chunks.map(chunk => ({ id: chunk.id, bytes: chunk.bytes })),
    [{ id: "c0001", bytes: 3145728 }, { id: "c0002", bytes: 1 }]
  )
  assert.equal(
    result.chunks[0].sha256,
    crypto.createHash("sha256").update(input.subarray(0, 3145728)).digest("hex")
  )
  assert.equal(
    result.chunks[1].sha256,
    crypto.createHash("sha256").update(input.subarray(3145728)).digest("hex")
  )

  const reconstructed = clipboard.assembleChunks(
    result.chunks,
    result.bytes,
    result.sha256,
    nodeAdapter
  )
  assert.deepEqual(Buffer.from(reconstructed), input)
})

test("reconstruit une donnée vide sans bloc", () => {
  const result = clipboard.splitData(Buffer.alloc(0), nodeAdapter)
  assert.deepEqual(result, {
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    chunks: []
  })
  assert.deepEqual(
    clipboard.assembleChunks([], 0, result.sha256, nodeAdapter),
    Buffer.alloc(0)
  )
})

test("refuse tout bloc altéré avant reconstruction", () => {
  const source = Buffer.from("hello")
  const result = clipboard.splitData(source, nodeAdapter)
  const original = result.chunks[0]
  const mutations = [
    [{ ...original, id: "c0002" }],
    [{ ...original, bytes: 4 }],
    [{ ...original, sha256: "0".repeat(64) }],
    [{ ...original, data: "aGVsbG9=" }],
    [original, original]
  ]
  for (const chunks of mutations) {
    assert.equal(clipboard.assembleChunks(chunks, result.bytes, result.sha256, nodeAdapter), null)
  }
  assert.equal(
    clipboard.assembleChunks(result.chunks, result.bytes, "0".repeat(64), nodeAdapter),
    null
  )
  assert.equal(
    clipboard.assembleChunks([], 104857601, result.sha256, nodeAdapter),
    null
  )
})

function preparedHelloTransfer(id = "00112233445566778899aabbccddeeff") {
  const data = Buffer.from("hello")
  const split = clipboard.splitData(data, nodeAdapter)
  return {
    id,
    index: validIndex({
      source: "iphone",
      destination: "pc",
      state: "uploading",
      kind: "text",
      fileCount: 0,
      totalBytes: 5,
      encodedBytes: 8
    }),
    manifest: {
      version: 2,
      source: "iphone",
      destination: "pc",
      kind: "text",
      fileCount: 0,
      totalBytes: 5
    },
    text: {
      meta: { bytes: 5, sha256: split.sha256, chunkCount: 1 },
      chunks: split.chunks
    }
  }
}

function memoryFirebaseRuntime(options = {}) {
  const calls = []
  const values = new Map()
  return {
    calls,
    binaryAdapter: nodeAdapter,
    nowTimestamp: () => options.nowTimestamp || "20260903120000",
    async firebaseRequest(method, logicalPath, body) {
      calls.push({ method, path: logicalPath, body })
      if (options.failAt === logicalPath) throw new Error("network-down")
      if (method === "GET" && logicalPath === "index") return options.indexes || null
      if (method === "PUT") values.set(logicalPath, JSON.parse(JSON.stringify(body)))
      if (method === "PATCH") values.set(logicalPath, { ...(values.get(logicalPath) || {}), ...body })
      if (method === "DELETE") values.delete(logicalPath)
      return method === "GET" ? values.get(logicalPath) ?? null : body ?? null
    }
  }
}

test("publication Firebase écrit les objets plats puis publie la file en dernier", async () => {
  const runtime = memoryFirebaseRuntime()
  const prepared = preparedHelloTransfer()
  const transferId = await clipboard.publishPreparedTransfer(prepared, runtime)
  assert.equal(transferId, prepared.id)
  assert.deepEqual(runtime.calls.map(call => `${call.method} ${call.path}`), [
    "GET index",
    `PUT index/${prepared.id}`,
    `PUT payloads/${prepared.id}/manifest`,
    `PUT payloads/${prepared.id}/text/meta`,
    `PUT payloads/${prepared.id}/text/chunks/c0001`,
    `GET index/${prepared.id}`,
    `GET payloads/${prepared.id}/manifest`,
    `GET payloads/${prepared.id}/text/meta`,
    `PATCH index/${prepared.id}`,
    `PUT queues/toPc/${prepared.id}`
  ])
  const queue = runtime.calls.at(-1).body
  assert.deepEqual(queue, { version: 2, created: "20260903120000", kind: "text" })
  for (const call of runtime.calls.filter(call => call.body != null)) {
    assert.equal(Array.isArray(call.body), false)
    assert.equal(Object.values(call.body).some(value => value && typeof value === "object"), false)
  }
})

test("publication Firebase interrompue ne rend jamais le transfert visible", async () => {
  const prepared = preparedHelloTransfer()
  const runtime = memoryFirebaseRuntime({
    failAt: `payloads/${prepared.id}/text/chunks/c0001`
  })
  await assert.rejects(
    clipboard.publishPreparedTransfer(prepared, runtime),
    /network-down/
  )
  assert.equal(
    runtime.calls.some(call => call.method === "PUT" && call.path.startsWith("queues/")),
    false
  )
  assert.deepEqual(runtime.calls.slice(-3).map(call => `${call.method} ${call.path}`), [
    `DELETE queues/toPc/${prepared.id}`,
    `DELETE payloads/${prepared.id}`,
    `DELETE index/${prepared.id}`
  ])
})

test("publication valide tout le transfert avant la première requête", async () => {
  const prepared = preparedHelloTransfer()
  prepared.text.chunks[0].sha256 = "0".repeat(64)
  const runtime = memoryFirebaseRuntime()
  await assert.rejects(
    clipboard.publishPreparedTransfer(prepared, runtime),
    /invalid-prepared-transfer/
  )
  assert.deepEqual(runtime.calls, [])
})

test("publication Firebase refuse les métadonnées texte imbriquées", async () => {
  const prepared = preparedHelloTransfer()
  prepared.text.meta.extra = { nested: true }
  const runtime = memoryFirebaseRuntime()
  await assert.rejects(
    clipboard.publishPreparedTransfer(prepared, runtime),
    /invalid-prepared-transfer/
  )
  assert.equal(
    runtime.calls.some(call => call.path === `payloads/${prepared.id}/text/meta`),
    false
  )
})

test("relecture Firebase accepte un ordre de propriétés JSON différent", async () => {
  const base = memoryFirebaseRuntime()
  const runtime = {
    calls: base.calls,
    binaryAdapter: base.binaryAdapter,
    nowTimestamp: base.nowTimestamp,
    async firebaseRequest(method, logicalPath, body) {
      const value = await base.firebaseRequest(method, logicalPath, body)
      if (method !== "GET" || !value || typeof value !== "object") return value
      return Object.fromEntries(Object.entries(value).reverse())
    }
  }
  await assert.doesNotReject(clipboard.publishPreparedTransfer(preparedHelloTransfer(), runtime))
})

test("suppression Firebase reçue retire file, payload puis index", async () => {
  const runtime = memoryFirebaseRuntime()
  const id = "00112233445566778899aabbccddeeff"
  await clipboard.deleteReceivedTransfer(id, "iphone", runtime)
  assert.deepEqual(runtime.calls.map(call => `${call.method} ${call.path}`), [
    `DELETE queues/toIphone/${id}`,
    `DELETE payloads/${id}`,
    `DELETE index/${id}`
  ])
})

test("client Firebase reprend deux pannes transitoires avec temporisation croissante", async () => {
  let attempts = 0
  const delays = []
  const client = clipboard.createFirebaseClient({
    async firebaseRequest(method, logicalPath) {
      attempts++
      assert.equal(method, "GET")
      assert.equal(logicalPath, "index")
      if (attempts < 3) throw new Error("temporary-network-error")
      return { ok: true }
    },
    async delay(milliseconds) { delays.push(milliseconds) }
  })
  assert.deepEqual(await client.get("index"), { ok: true })
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [1000, 5000])
})

test("client Firebase s'arrête après trois échecs identiques", async () => {
  let attempts = 0
  const client = clipboard.createFirebaseClient({
    async firebaseRequest() { attempts++; throw new Error("offline") },
    async delay() {}
  })
  await assert.rejects(client.get("index"), /offline/)
  assert.equal(attempts, 3)
})

test("publication Firebase refuse un sixième transfert complet en attente", async () => {
  const indexes = {}
  for (let index = 0; index < 5; index++) {
    indexes[String(index).padStart(32, "0")] = validIndex({
      source: "pc", destination: "iphone", state: "ready"
    })
  }
  const runtime = memoryFirebaseRuntime({ indexes })
  await assert.rejects(
    clipboard.publishPreparedTransfer(preparedHelloTransfer(), runtime),
    /pending-transfer-limit/
  )
  assert.equal(runtime.calls.some(call => call.method === "PUT"), false)
})

test("publication Firebase nettoie un transfert expiré avant le nouvel envoi", async () => {
  const expiredId = "ffffffffffffffffffffffffffffffff"
  const runtime = memoryFirebaseRuntime({
    indexes: {
      [expiredId]: validIndex({
        source: "pc",
        destination: "iphone",
        created: "20260820120000",
        expires: "20260827120000",
        state: "ready"
      })
    }
  })
  await clipboard.publishPreparedTransfer(preparedHelloTransfer(), runtime)
  assert.deepEqual(runtime.calls.slice(0, 4).map(call => `${call.method} ${call.path}`), [
    "GET index",
    `DELETE queues/toIphone/${expiredId}`,
    `DELETE payloads/${expiredId}`,
    `DELETE index/${expiredId}`
  ])
})

function sendingRuntime(files = {}) {
  const firebase = memoryFirebaseRuntime()
  return {
    ...firebase,
    binaryAdapter: nodeAdapter,
    generateTransferId: () => "00112233445566778899aabbccddeeff",
    nowTimestamp: () => "20260903120000",
    async readFile(filePath) {
      if (!Object.hasOwn(files, filePath)) throw new Error("file-unavailable")
      return files[filePath]
    }
  }
}

test("prépare et envoie un texte UTF-8 sans exposer son contenu dans la file", async () => {
  const runtime = sendingRuntime()
  const prepared = await clipboard.prepareTextTransfer("été 😀", "pc", runtime)
  assert.equal(prepared.index.kind, "text")
  assert.equal(prepared.index.totalBytes, Buffer.byteLength("été 😀", "utf8"))
  assert.equal(prepared.text.meta.chunkCount, 1)
  assert.equal(prepared.text.chunks[0].data, Buffer.from("été 😀", "utf8").toString("base64"))

  const result = await clipboard.send({ text: "été 😀", destination: "pc" }, runtime)
  assert.deepEqual(result, {
    ok: true,
    transferId: "00112233445566778899aabbccddeeff",
    kind: "text"
  })
  const queue = runtime.calls.find(call => call.path.startsWith("queues/"))
  assert.equal(JSON.stringify(queue).includes("été"), false)
})

test("prépare des fichiers originaux séquentiels avec métadonnées plates", async () => {
  const runtime = sendingRuntime({
    first: { filename: "photo.png", mime: "image/png", data: Buffer.from([0, 1, 2]), isDirectory: false },
    second: { filename: "notes.txt", mime: "text/plain", data: Buffer.from("hello"), isDirectory: false }
  })
  const prepared = await clipboard.prepareFileTransfer(["first", "second"], "pc", runtime)
  assert.equal(prepared.index.kind, "files")
  assert.equal(prepared.index.fileCount, 2)
  assert.equal(prepared.index.totalBytes, 8)
  assert.deepEqual(prepared.files.map(file => file.id), ["f0001", "f0002"])
  assert.deepEqual(prepared.files.map(file => file.meta.filename), ["photo.png", "notes.txt"])
  assert.equal(prepared.files.every(file => Object.values(file.meta).every(value => typeof value !== "object")), true)
})

test("envoi Scriptable publie un fichier avant de charger le suivant", async () => {
  const firebase = memoryFirebaseRuntime()
  const effects = []
  const files = {
    first: { filename: "first.bin", mime: "application/octet-stream", data: Buffer.from("first") },
    second: { filename: "second.bin", mime: "application/octet-stream", data: Buffer.from("second") }
  }
  const runtime = {
    ...firebase,
    generateTransferId: () => "00112233445566778899aabbccddeeff",
    nowTimestamp: () => "20260903120000",
    async firebaseRequest(method, logicalPath, body) {
      effects.push(`${method} ${logicalPath}`)
      return firebase.firebaseRequest(method, logicalPath, body)
    },
    async statFile(filePath) {
      effects.push(`STAT ${filePath}`)
      const file = files[filePath]
      return { filename: file.filename, mime: file.mime, bytes: file.data.length, isDirectory: false }
    },
    async readFile(filePath) {
      effects.push(`READ ${filePath}`)
      const file = files[filePath]
      return { ...file, bytes: file.data.length, isDirectory: false }
    }
  }
  const result = await clipboard.send({ files: ["first", "second"], destination: "pc" }, runtime)
  assert.equal(result.ok, true)
  assert.ok(effects.indexOf("STAT first") < effects.indexOf("GET index"))
  assert.ok(effects.indexOf("STAT second") < effects.indexOf("GET index"))
  assert.ok(effects.indexOf("READ first") > effects.indexOf("PUT payloads/00112233445566778899aabbccddeeff/manifest"))
  assert.ok(effects.indexOf("PUT payloads/00112233445566778899aabbccddeeff/files/f0001/chunks/c0001") < effects.indexOf("READ second"))
})

test("refuse les entrées d'envoi hors limites sans divulguer le fichier", async () => {
  const oversized = Buffer.alloc(26214401)
  const runtime = sendingRuntime({
    secretPath: { filename: "secret.bin", mime: "application/octet-stream", data: oversized, isDirectory: false },
    folder: { filename: "folder", mime: "application/octet-stream", data: Buffer.alloc(0), isDirectory: true }
  })
  const cases = [
    { input: { files: Array.from({ length: 11 }, () => "secretPath"), destination: "pc" }, error: "too-many-files" },
    { input: { files: ["secretPath"], destination: "pc" }, error: "file-too-large" },
    { input: { files: ["folder"], destination: "pc" }, error: "folder-not-supported" },
    { input: { images: [{}], destination: "pc" }, error: "image-original-required" },
    { input: { text: "x".repeat(6291457), destination: "pc" }, error: "text-too-large" }
  ]
  for (const entry of cases) {
    const result = await clipboard.send(entry.input, runtime)
    assert.equal(result.ok, false)
    assert.equal(result.error, entry.error)
    assert.equal(JSON.stringify(result).includes("secret"), false)
  }
})

test("runtime Scriptable refuse la taille iCloud avant de charger les octets", async () => {
  const effects = []
  const cloud = {
    isDirectory() { effects.push("directory"); return false },
    async downloadFileFromiCloud() { effects.push("download") },
    fileSize() { effects.push("size"); return 26214.401 }
  }
  await assert.rejects(
    clipboard.readScriptableFile("file:///Documents/large.bin", {
      cloud,
      dataFromFile() { effects.push("read"); throw new Error("must-not-read") }
    }),
    error => error && error.code === "file-too-large"
  )
  assert.deepEqual(effects, ["directory", "download", "size"])
})

test("runtime Scriptable calcule les octets exacts après le précontrôle en kilo-octets", async () => {
  const result = await clipboard.readScriptableFile("file:///Documents/five.bin", {
    cloud: {
      isDirectory: () => false,
      async downloadFileFromiCloud() {},
      fileSize: () => 0.005
    },
    dataFromFile: () => ({ toBase64String: () => "aGVsbG8=" })
  })
  assert.equal(result.bytes, 5)
})

function incomingRuntime({
  kind = "text",
  imageCopyFails = false,
  imageDecodeFails = false,
  deleteFailsOnce = false,
  cleanupStagedFails = false,
  nestedObject = null,
  advertisedTotalBytes = null,
  corruptChunkReads = 0
} = {}) {
  const id = "00112233445566778899aabbccddeeff"
  const data = kind === "text" ? Buffer.from("hello") : Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const split = clipboard.splitData(data, nodeAdapter)
  const index = validIndex({
    source: "pc",
    destination: "iphone",
    state: "ready",
    kind,
    fileCount: kind === "text" ? 0 : 1,
    totalBytes: advertisedTotalBytes == null ? data.length : advertisedTotalBytes,
    encodedBytes: data.toString("base64").length
  })
  const store = new Map([
    [`queues/toIphone/${id}`, { version: 2, created: index.created, kind }],
    [`index/${id}`, index],
    [`payloads/${id}/manifest`, {
      version: 2,
      source: "pc",
      destination: "iphone",
      kind,
      fileCount: index.fileCount,
      totalBytes: index.totalBytes
    }]
  ])
  if (kind === "text") {
    store.set(`payloads/${id}/text/meta`, {
      bytes: data.length,
      sha256: split.sha256,
      chunkCount: split.chunks.length
    })
    for (const chunk of split.chunks) {
      store.set(`payloads/${id}/text/chunks/${chunk.id}`, {
        bytes: chunk.bytes, sha256: chunk.sha256, data: chunk.data
      })
    }
  } else {
    store.set(`payloads/${id}/files/f0001/meta`, {
      filename: "CON?.png",
      mime: "image/png",
      bytes: data.length,
      sha256: split.sha256,
      chunkCount: split.chunks.length
    })
    for (const chunk of split.chunks) {
      store.set(`payloads/${id}/files/f0001/chunks/${chunk.id}`, {
        bytes: chunk.bytes, sha256: chunk.sha256, data: chunk.data
      })
    }
  }
  const nestedPaths = {
    queue: `queues/toIphone/${id}`,
    textMeta: `payloads/${id}/text/meta`,
    textChunk: `payloads/${id}/text/chunks/c0001`
  }
  if (nestedObject) {
    const logicalPath = nestedPaths[nestedObject]
    const value = store.get(logicalPath)
    store.set(logicalPath, { ...value, extra: { nested: true } })
  }
  const effects = []
  let applied = {}
  let remainingDeleteFailures = deleteFailsOnce ? 3 : 0
  let remainingCorruptChunkReads = corruptChunkReads
  return {
    id,
    effects,
    binaryAdapter: nodeAdapter,
    nowTimestamp: () => "20260903130000",
    async firebaseRequest(method, logicalPath) {
      effects.push(`${method} ${logicalPath}`)
      if (method === "GET") {
        const value = store.get(logicalPath) ?? null
        if (remainingCorruptChunkReads > 0 && logicalPath.includes("/chunks/")) {
          remainingCorruptChunkReads--
          return { ...value, data: "d29ybGQ=" }
        }
        return value
      }
      if (method === "DELETE") {
        if (remainingDeleteFailures > 0) {
          remainingDeleteFailures--
          throw new Error("delete-network-down")
        }
        store.delete(logicalPath)
        return null
      }
      throw new Error(`unexpected-${method}`)
    },
    async delay(milliseconds) { effects.push(`DELAY ${milliseconds}`) },
    loadApplied: () => ({ ...applied }),
    saveApplied(value) { applied = { ...value }; effects.push("SAVE applied") },
    copyString(value) { effects.push(`COPY text ${value}`) },
    async stageFile(transferId, id, filename, fileData, mime) {
      effects.push(`STAGE ${id} ${filename} ${mime} ${Buffer.from(fileData).length}`)
      return { transferId, id, filename, mime, data: Buffer.from(fileData) }
    },
    async commitFiles(staged) {
      effects.push("COMMIT files")
      return staged.map(file => ({ ...file, path: `/received/${file.filename}` }))
    },
    async cleanupStaged() {
      effects.push("CLEANUP staged")
      if (cleanupStagedFails) throw new Error("cleanup-staged-failed")
    },
    imageFromFile(path) {
      effects.push(`IMAGE ${path}`)
      if (imageDecodeFails) throw new Error("image-decode-failed")
      return { path }
    },
    copyImage() {
      effects.push("COPY image")
      if (imageCopyFails) throw new Error("pasteboard-image-failed")
    }
  }
}

test("réception relit uniquement un bloc corrompu avant de l'appliquer", async () => {
  const runtime = incomingRuntime({ corruptChunkReads: 2 })
  const result = await clipboard.receive(runtime.id, runtime)
  assert.equal(result.ok, true)
  assert.equal(
    runtime.effects.filter(effect => effect.endsWith("/chunks/c0001")).length,
    3
  )
  assert.deepEqual(
    runtime.effects.filter(effect => effect.startsWith("DELAY ")),
    ["DELAY 1000", "DELAY 5000"]
  )
  assert.equal(runtime.effects.filter(effect => effect === "COPY text hello").length, 1)
})

test("échec du nettoyage staging ne masque pas un refus de réception", async () => {
  const runtime = incomingRuntime({ corruptChunkReads: 3, cleanupStagedFails: true })
  const result = await clipboard.receive(runtime.id, runtime)
  assert.deepEqual(result, { ok: false, error: "receive-failed" })
})

test("réception recoupe les tailles agrégées avec l'index", async () => {
  for (const kind of ["text", "files"]) {
    const runtime = incomingRuntime({ kind, advertisedTotalBytes: 1 })
    const result = await clipboard.receive(runtime.id, runtime)
    assert.deepEqual(result, { ok: false, error: "receive-failed" }, kind)
    assert.equal(runtime.effects.some(effect => effect.startsWith("COPY ")), false, kind)
    assert.equal(runtime.effects.includes("COMMIT files"), false, kind)
  }
})

test("réception refuse chaque objet Firebase imbriqué", async () => {
  const cases = [
    ["queue", "invalid-queue"],
    ["textMeta", "receive-failed"],
    ["textChunk", "receive-failed"]
  ]
  for (const [nestedObject, expectedError] of cases) {
    const runtime = incomingRuntime({ nestedObject })
    const result = await clipboard.receive(runtime.id, runtime)
    assert.deepEqual(result, { ok: false, error: expectedError }, nestedObject)
    assert.equal(runtime.effects.some(effect => effect.startsWith("COPY ")), false, nestedObject)
  }
})

test("réception texte enregistre l'idempotence avant la suppression Firebase", async () => {
  const runtime = incomingRuntime({ deleteFailsOnce: true })
  const first = await clipboard.receive(runtime.id, runtime)
  assert.deepEqual(first, { ok: true, kind: "text", fileCount: 0, degraded: false, cleanupPending: true })
  const saveIndex = runtime.effects.indexOf("SAVE applied")
  const deleteIndex = runtime.effects.findIndex(event => event.startsWith("DELETE queues/"))
  assert.ok(saveIndex >= 0 && deleteIndex > saveIndex)
  assert.equal(runtime.effects.filter(event => event === "COPY text hello").length, 1)

  const second = await clipboard.receive(runtime.id, runtime)
  assert.equal(second.ok, true)
  assert.equal(second.duplicate, true)
  assert.equal(runtime.effects.filter(event => event === "COPY text hello").length, 1)
})

test("nom sûr neutralise les composants et résout les collisions", () => {
  const existing = new Set(["_CON_.png", "_CON_ (2).png"])
  assert.equal(clipboard.safeFilename("../CON?.png", name => existing.has(name)), "_CON_ (3).png")
  assert.equal(clipboard.safeFilename("...", () => false), "file")
})

test("commit iCloud restaure les fichiers déjà déplacés si le suivant échoue", async () => {
  const moves = []
  let forwardMoves = 0
  const staged = [
    { transferId: "00112233445566778899aabbccddeeff", filename: "a.txt", stagedPath: "/staging/a.txt" },
    { transferId: "00112233445566778899aabbccddeeff", filename: "b.txt", stagedPath: "/staging/b.txt" }
  ]
  const storage = {
    receivedRoot: "/received",
    joinPath: (root, name) => `${root}/${name}`,
    fileExists: () => false,
    createDirectory() {},
    move(from, to) {
      moves.push(`${from} -> ${to}`)
      if (from.startsWith("/staging/")) {
        forwardMoves++
        if (forwardMoves === 2) throw new Error("second-move-failed")
      }
    }
  }
  await assert.rejects(
    clipboard.commitStagedFiles(staged, storage),
    /second-move-failed/
  )
  assert.deepEqual(moves, [
    "/staging/a.txt -> /received/a.txt",
    "/staging/b.txt -> /received/b.txt",
    "/received/a.txt -> /staging/a.txt"
  ])
})

test("commit iCloud conserve le succès si le nettoyage du staging échoue", async () => {
  const staged = [
    { transferId: "00112233445566778899aabbccddeeff", filename: "a.txt", stagedPath: "/staging/a.txt" }
  ]
  const planned = await clipboard.commitStagedFiles(staged, {
    receivedRoot: "/received",
    joinPath: (root, name) => `${root}/${name}`,
    fileExists: () => false,
    createDirectory() {},
    move() {},
    cleanupTransfer() { throw new Error("cleanup-failed") }
  })
  assert.equal(planned.length, 1)
  assert.equal(planned[0].path, "/received/a.txt")
})

test("commit iCloud signale explicitement un rollback impossible", async () => {
  let forwardMoves = 0
  await assert.rejects(
    clipboard.commitStagedFiles([
      { transferId: "00112233445566778899aabbccddeeff", filename: "a.txt", stagedPath: "/staging/a.txt" },
      { transferId: "00112233445566778899aabbccddeeff", filename: "b.txt", stagedPath: "/staging/b.txt" }
    ], {
      receivedRoot: "/received",
      joinPath: (root, name) => `${root}/${name}`,
      fileExists: () => false,
      createDirectory() {},
      move(from) {
        if (from.startsWith("/staging/")) {
          forwardMoves++
          if (forwardMoves === 2) throw new Error("second-move-failed")
        } else {
          throw new Error("rollback-failed")
        }
      }
    }),
    error => error && error.code === "file-commit-rollback-failed"
  )
})

test("réception image conserve le fichier et tolère l'échec du presse-papiers", async () => {
  const runtime = incomingRuntime({ kind: "files", imageCopyFails: true })
  const result = await clipboard.receive(runtime.id, runtime)
  assert.deepEqual(result, {
    ok: true,
    kind: "files",
    fileCount: 1,
    degraded: true,
    cleanupPending: false
  })
  const stage = runtime.effects.findIndex(event => event.startsWith("STAGE f0001"))
  const commit = runtime.effects.indexOf("COMMIT files")
  const copy = runtime.effects.indexOf("COPY image")
  assert.ok(stage >= 0 && commit > stage && copy > commit)
})

test("réception image tolère aussi l'échec du décodage secondaire", async () => {
  const runtime = incomingRuntime({ kind: "files", imageDecodeFails: true })
  const result = await clipboard.receive(runtime.id, runtime)
  assert.deepEqual(result, {
    ok: true,
    kind: "files",
    fileCount: 1,
    degraded: true,
    cleanupPending: false
  })
  assert.equal(runtime.effects.includes("COMMIT files"), true)
  assert.equal(runtime.effects.includes("SAVE applied"), true)
})

test("normalise les arguments Scriptable avec priorité aux fichiers originaux", () => {
  assert.deepEqual(clipboard.normalizeInvocation({
    fileURLs: ["/tmp/photo.png"],
    plainTexts: ["ignored"],
    images: [{}],
    shortcutParameter: { action: "receive", transferId: "ignored" }
  }), { action: "send", files: ["/tmp/photo.png"], destination: "pc" })
  assert.deepEqual(clipboard.normalizeInvocation({
    fileURLs: [], plainTexts: ["hello", "world"], images: [], shortcutParameter: null
  }), { action: "send", text: "hello\nworld", destination: "pc" })
  assert.deepEqual(clipboard.normalizeInvocation({
    fileURLs: [], plainTexts: [], images: [{}], shortcutParameter: null
  }), { action: "send", images: [{}], destination: "pc" })
})

test("normalise Pushcut en réception et réserve la configuration au dialogue local", () => {
  const id = "00112233445566778899aabbccddeeff"
  assert.deepEqual(clipboard.normalizeInvocation({
    fileURLs: [], plainTexts: [], images: [], shortcutParameter: id
  }), { action: "receive", transferId: id })
  assert.deepEqual(clipboard.normalizeInvocation({
    fileURLs: [], plainTexts: [], images: [], shortcutParameter: { action: "configure" }
  }), { action: "configure" })
  assert.deepEqual(clipboard.normalizeInvocation({
    fileURLs: [], plainTexts: [], images: [], shortcutParameter: { action: "configure", secret: "forbidden" }
  }), { action: "configure" })
})

test("point d'entrée notifie une réception d'image dégradée sans contenu", async () => {
  const runtime = incomingRuntime({ kind: "files", imageCopyFails: true })
  runtime.notify = async message => { runtime.effects.push(`NOTIFY ${message}`) }
  const events = []
  const script = {
    setShortcutOutput(value) { events.push(["output", value]) },
    complete() { events.push(["complete"]) }
  }
  const result = await clipboard.runShortcut(script, {
    fileURLs: [], plainTexts: [], images: [], shortcutParameter: runtime.id
  }, runtime)
  assert.equal(result.degraded, true)
  assert.equal(runtime.effects.includes("NOTIFY image-copy-degraded"), true)
  assert.deepEqual(events.map(event => event[0]), ["output", "complete"])
})
