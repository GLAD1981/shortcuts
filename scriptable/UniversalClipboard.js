// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: copy;

const LIMITS = Object.freeze({
  chunkBytes: 3145728,
  textBytes: 6291456,
  fileBytes: 26214400,
  fileCount: 10,
  transferBytes: 104857600,
  pendingTransfers: 5,
  retentionDays: 7
})

const FIREBASE_BASE_URL = "https://personal-tools-41536-default-rtdb.europe-west1.firebasedatabase.app"
const FIREBASE_ROOT = "apps/universalClipboard/v2"
const FIREBASE_KEYCHAIN_KEY = "UniversalClipboard.Firebase.PersonalTools.RealtimeDatabase"

function limits() {
  return { ...LIMITS }
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

function isTransferId(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value)
}

function fileId(index) {
  return isIntegerInRange(index, 1, LIMITS.fileCount)
    ? `f${String(index).padStart(4, "0")}`
    : null
}

function chunkId(index) {
  return isIntegerInRange(index, 1, 9999)
    ? `c${String(index).padStart(4, "0")}`
    : null
}

function expectedChunkCount(bytes) {
  if (!Number.isInteger(bytes) || bytes < 0) return null
  return bytes === 0 ? 0 : Math.ceil(bytes / LIMITS.chunkBytes)
}

function timestampDate(value) {
  if (typeof value !== "string" || !/^\d{14}$/.test(value)) return null
  const parts = [
    Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6, 8)),
    Number(value.slice(8, 10)), Number(value.slice(10, 12)), Number(value.slice(12, 14))
  ]
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]))
  const observed = [
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()
  ]
  return observed.every((part, index) => part === parts[index]) ? date : null
}

function validateIndex(index) {
  if (!index || typeof index !== "object" || Array.isArray(index)) return false
  const created = timestampDate(index.created)
  const expires = timestampDate(index.expires)
  if (!created || !expires) return false
  if (expires.getTime() - created.getTime() !== LIMITS.retentionDays * 86400000) return false
  const valid = index.version === 2 &&
    ["pc", "iphone"].includes(index.source) &&
    ["pc", "iphone"].includes(index.destination) &&
    index.source !== index.destination &&
    ["uploading", "ready"].includes(index.state) &&
    ["text", "files"].includes(index.kind) &&
    isIntegerInRange(index.fileCount, 0, LIMITS.fileCount) &&
    isIntegerInRange(index.totalBytes, 0, LIMITS.transferBytes) &&
    Number.isInteger(index.encodedBytes) && index.encodedBytes >= index.totalBytes
  if (!valid) return false
  return index.kind !== "text" ||
    (index.fileCount === 0 && index.totalBytes <= LIMITS.textBytes)
}

function validateFileMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false
  return typeof meta.filename === "string" && meta.filename.length > 0 &&
    meta.filename !== "." && meta.filename !== ".." &&
    !/[\\/]/.test(meta.filename) &&
    typeof meta.mime === "string" && /^[^\s/]+\/[^\s/]+$/.test(meta.mime) &&
    isIntegerInRange(meta.bytes, 0, LIMITS.fileBytes) &&
    typeof meta.sha256 === "string" && /^[0-9a-f]{64}$/.test(meta.sha256) &&
    meta.chunkCount === expectedChunkCount(meta.bytes)
}

const SHA256_K = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount))
}

class Sha256 {
  constructor() {
    this.state = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ])
    this.buffer = new Uint8Array(64)
    this.bufferLength = 0
    this.bytesHashed = 0
    this.finished = false
  }

  update(input) {
    if (this.finished) throw new Error("sha256-finalized")
    const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input || [])
    this.bytesHashed += bytes.length
    let offset = 0
    while (offset < bytes.length) {
      const take = Math.min(bytes.length - offset, 64 - this.bufferLength)
      this.buffer.set(bytes.subarray(offset, offset + take), this.bufferLength)
      this.bufferLength += take
      offset += take
      if (this.bufferLength === 64) {
        this.processBlock(this.buffer)
        this.bufferLength = 0
      }
    }
    return this
  }

  processBlock(block) {
    const words = new Uint32Array(64)
    for (let index = 0; index < 16; index++) {
      const offset = index * 4
      words[index] = ((block[offset] << 24) | (block[offset + 1] << 16) |
        (block[offset + 2] << 8) | block[offset + 3]) >>> 0
    }
    for (let index = 16; index < 64; index++) {
      const first = words[index - 15]
      const second = words[index - 2]
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3)
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = this.state
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + SHA256_K[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    const values = [a, b, c, d, e, f, g, h]
    for (let index = 0; index < 8; index++) {
      this.state[index] = (this.state[index] + values[index]) >>> 0
    }
  }

  digestHex() {
    if (!this.finished) {
      const highBits = Math.floor(this.bytesHashed / 0x20000000)
      const lowBits = (this.bytesHashed << 3) >>> 0
      this.buffer[this.bufferLength++] = 0x80
      if (this.bufferLength > 56) {
        this.buffer.fill(0, this.bufferLength)
        this.processBlock(this.buffer)
        this.bufferLength = 0
      }
      this.buffer.fill(0, this.bufferLength, 56)
      this.buffer[56] = (highBits >>> 24) & 0xff
      this.buffer[57] = (highBits >>> 16) & 0xff
      this.buffer[58] = (highBits >>> 8) & 0xff
      this.buffer[59] = highBits & 0xff
      this.buffer[60] = (lowBits >>> 24) & 0xff
      this.buffer[61] = (lowBits >>> 16) & 0xff
      this.buffer[62] = (lowBits >>> 8) & 0xff
      this.buffer[63] = lowBits & 0xff
      this.processBlock(this.buffer)
      this.finished = true
    }
    return Array.from(this.state, value => value.toString(16).padStart(8, "0")).join("")
  }
}

function sha256Hex(bytes) {
  return new Sha256().update(bytes).digestHex()
}

function base64ByteLength(value) {
  if (value === "") return 0
  if (typeof value !== "string" || value.length % 4 !== 0) return null
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0
  const contentLength = value.length - padding
  if ((padding === 1 && contentLength % 4 !== 3) ||
    (padding === 2 && contentLength % 4 !== 2)) return null
  for (let index = 0; index < contentLength; index++) {
    const code = value.charCodeAt(index)
    const valid = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) || code === 0x2b || code === 0x2f
    if (!valid) return null
  }
  for (let index = contentLength; index < value.length; index++) {
    if (value.charCodeAt(index) !== 0x3d) return null
  }
  return (value.length / 4) * 3 - padding
}

function decodeCanonical(value, adapter) {
  const bytes = base64ByteLength(value)
  if (bytes === null) return null
  if (value === "") return { data: adapter.fromBytes([]), bytes: new Uint8Array(0) }
  let data
  try {
    data = adapter.fromBase64(value)
    if (data == null || adapter.toBase64(data) !== value) return null
    const raw = adapter.getBytes(data)
    if (raw.length !== bytes) return null
    return { data, bytes: raw instanceof Uint8Array ? raw : Uint8Array.from(raw) }
  } catch (_) {
    return null
  }
}

function splitData(data, adapter) {
  if (!adapter || typeof adapter.toBase64 !== "function") return null
  let encoded
  try {
    encoded = adapter.toBase64(data)
  } catch (_) {
    return null
  }
  const totalBytes = base64ByteLength(encoded)
  if (totalBytes === null) return null
  const chunks = []
  const wholeHash = new Sha256()
  const fullChunkCharacters = (LIMITS.chunkBytes / 3) * 4
  for (let offset = 0, index = 1; offset < encoded.length; offset += fullChunkCharacters, index++) {
    const value = encoded.slice(offset, offset + fullChunkCharacters)
    const decoded = decodeCanonical(value, adapter)
    if (!decoded || decoded.bytes.length < 1 || decoded.bytes.length > LIMITS.chunkBytes) return null
    wholeHash.update(decoded.bytes)
    chunks.push({
      id: chunkId(index),
      bytes: decoded.bytes.length,
      sha256: sha256Hex(decoded.bytes),
      data: value
    })
  }
  if (chunks.length !== expectedChunkCount(totalBytes)) return null
  return { bytes: totalBytes, sha256: wholeHash.digestHex(), chunks }
}

function assembleChunks(chunks, expectedBytes, expectedSha256, adapter) {
  if (!Array.isArray(chunks) || !Number.isInteger(expectedBytes) || expectedBytes < 0 ||
    typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256) ||
    chunks.length !== expectedChunkCount(expectedBytes)) return null
  if (expectedBytes === 0) {
    return expectedSha256 === sha256Hex([]) ? adapter.fromBytes([]) : null
  }
  const wholeHash = new Sha256()
  let observedBytes = 0
  let encoded = ""
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    if (!chunk || typeof chunk !== "object" || chunk.id !== chunkId(index + 1) ||
      !isIntegerInRange(chunk.bytes, 1, LIMITS.chunkBytes) ||
      typeof chunk.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(chunk.sha256) ||
      typeof chunk.data !== "string") return null
    const decoded = decodeCanonical(chunk.data, adapter)
    if (!decoded || decoded.bytes.length !== chunk.bytes || sha256Hex(decoded.bytes) !== chunk.sha256) return null
    if (index < chunks.length - 1 && chunk.bytes !== LIMITS.chunkBytes) return null
    observedBytes += chunk.bytes
    if (observedBytes > expectedBytes) return null
    wholeHash.update(decoded.bytes)
    encoded += chunk.data
  }
  if (observedBytes !== expectedBytes || wholeHash.digestHex() !== expectedSha256) return null
  const decoded = decodeCanonical(encoded, adapter)
  return decoded && decoded.bytes.length === expectedBytes ? decoded.data : null
}

function firebasePath(...segments) {
  if (segments.length === 0 || segments.some(segment =>
    typeof segment !== "string" || segment.length === 0 || /[/.#$\[\]]/.test(segment))) return null
  return segments.join("/")
}

function createFirebaseClient(runtime) {
  if (!runtime || typeof runtime.firebaseRequest !== "function") {
    throw new Error("firebase-runtime-missing")
  }
  async function invoke(method, path, body) {
    const delays = [1000, 5000]
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await runtime.firebaseRequest(method, path, body)
      } catch (error) {
        if (attempt === 2) throw error
        if (typeof runtime.delay === "function") await runtime.delay(delays[attempt])
      }
    }
    throw new Error("firebase-request-failed")
  }
  return {
    get: path => invoke("GET", path),
    put: (path, body) => invoke("PUT", path, body),
    patch: (path, body) => invoke("PATCH", path, body),
    delete: path => invoke("DELETE", path)
  }
}

function sameObject(first, second) {
  if (first === second) return true
  if (!first || !second || typeof first !== "object" || typeof second !== "object" ||
    Array.isArray(first) !== Array.isArray(second)) return false
  const firstKeys = Object.keys(first).sort()
  const secondKeys = Object.keys(second).sort()
  if (firstKeys.length !== secondKeys.length ||
    firstKeys.some((key, index) => key !== secondKeys[index])) return false
  return firstKeys.every(key => sameObject(first[key], second[key]))
}

function validateTextMeta(meta) {
  return meta && typeof meta === "object" && !Array.isArray(meta) &&
    isIntegerInRange(meta.bytes, 0, LIMITS.textBytes) &&
    typeof meta.sha256 === "string" && /^[0-9a-f]{64}$/.test(meta.sha256) &&
    meta.chunkCount === expectedChunkCount(meta.bytes)
}

function validateManifest(manifest, index) {
  return manifest && typeof manifest === "object" && !Array.isArray(manifest) &&
    manifest.version === 2 && manifest.source === index.source &&
    manifest.destination === index.destination && manifest.kind === index.kind &&
    manifest.fileCount === index.fileCount && manifest.totalBytes === index.totalBytes &&
    Object.values(manifest).every(value => value == null || typeof value !== "object")
}

function validatePreparedChunk(chunk, expectedId) {
  return chunk && typeof chunk === "object" && !Array.isArray(chunk) &&
    chunk.id === expectedId && isIntegerInRange(chunk.bytes, 1, LIMITS.chunkBytes) &&
    typeof chunk.sha256 === "string" && /^[0-9a-f]{64}$/.test(chunk.sha256) &&
    typeof chunk.data === "string" && base64ByteLength(chunk.data) === chunk.bytes
}

async function cleanupExpiredAndCount(runtime) {
  const client = createFirebaseClient(runtime)
  const now = runtime.nowTimestamp()
  if (!timestampDate(now)) throw new Error("invalid-runtime-time")
  const indexes = await client.get("index")
  if (indexes == null) return 0
  if (typeof indexes !== "object" || Array.isArray(indexes)) throw new Error("invalid-index-root")
  let pending = 0
  for (const [transferId, index] of Object.entries(indexes)) {
    if (!isTransferId(transferId) || !validateIndex(index)) continue
    if (index.expires <= now) {
      await deleteReceivedTransfer(transferId, index.destination, runtime)
    } else if (index.state === "ready") {
      pending++
    }
  }
  return pending
}

async function publishPreparedTransfer(prepared, runtime) {
  if (!prepared || !isTransferId(prepared.id) || !validateIndex(prepared.index) ||
    prepared.index.state !== "uploading" || !validateManifest(prepared.manifest, prepared.index)) {
    throw new Error("invalid-prepared-transfer")
  }
  const client = createFirebaseClient(runtime)
  if (await cleanupExpiredAndCount(runtime) >= LIMITS.pendingTransfers) {
    throw new Error("pending-transfer-limit")
  }
  const indexPath = firebasePath("index", prepared.id)
  const manifestPath = firebasePath("payloads", prepared.id, "manifest")
  await client.put(indexPath, prepared.index)
  await client.put(manifestPath, prepared.manifest)

  const critical = [[indexPath, prepared.index], [manifestPath, prepared.manifest]]
  if (prepared.index.kind === "text") {
    if (!prepared.text || !validateTextMeta(prepared.text.meta) ||
      !Array.isArray(prepared.text.chunks) || prepared.text.chunks.length !== prepared.text.meta.chunkCount) {
      throw new Error("invalid-text-payload")
    }
    const metaPath = firebasePath("payloads", prepared.id, "text", "meta")
    await client.put(metaPath, prepared.text.meta)
    critical.push([metaPath, prepared.text.meta])
    for (let index = 0; index < prepared.text.chunks.length; index++) {
      const chunk = prepared.text.chunks[index]
      if (!validatePreparedChunk(chunk, chunkId(index + 1))) throw new Error("invalid-text-chunk")
      await client.put(firebasePath("payloads", prepared.id, "text", "chunks", chunk.id), {
        bytes: chunk.bytes,
        sha256: chunk.sha256,
        data: chunk.data
      })
    }
  } else {
    if (!Array.isArray(prepared.files) || prepared.files.length !== prepared.index.fileCount) {
      throw new Error("invalid-files-payload")
    }
    for (let fileIndex = 0; fileIndex < prepared.files.length; fileIndex++) {
      const file = prepared.files[fileIndex]
      const expectedFileId = fileId(fileIndex + 1)
      if (!file || file.id !== expectedFileId || !validateFileMeta(file.meta) ||
        !Array.isArray(file.chunks) || file.chunks.length !== file.meta.chunkCount) {
        throw new Error("invalid-file-payload")
      }
      const metaPath = firebasePath("payloads", prepared.id, "files", file.id, "meta")
      await client.put(metaPath, file.meta)
      critical.push([metaPath, file.meta])
      for (let index = 0; index < file.chunks.length; index++) {
        const chunk = file.chunks[index]
        if (!validatePreparedChunk(chunk, chunkId(index + 1))) throw new Error("invalid-file-chunk")
        await client.put(firebasePath("payloads", prepared.id, "files", file.id, "chunks", chunk.id), {
          bytes: chunk.bytes,
          sha256: chunk.sha256,
          data: chunk.data
        })
      }
    }
  }

  for (const [path, expected] of critical) {
    if (!sameObject(await client.get(path), expected)) throw new Error("firebase-readback-mismatch")
  }
  await client.patch(indexPath, { state: "ready" })
  const queue = prepared.index.destination === "pc" ? "toPc" : "toIphone"
  await client.put(firebasePath("queues", queue, prepared.id), {
    version: 2,
    created: prepared.index.created,
    kind: prepared.index.kind
  })
  return prepared.id
}

async function deleteReceivedTransfer(transferId, destination, runtime) {
  if (!isTransferId(transferId) || !["pc", "iphone"].includes(destination)) {
    throw new Error("invalid-delete-target")
  }
  const client = createFirebaseClient(runtime)
  const queue = destination === "pc" ? "toPc" : "toIphone"
  await client.delete(firebasePath("queues", queue, transferId))
  await client.delete(firebasePath("payloads", transferId))
  await client.delete(firebasePath("index", transferId))
}

function formatTimestamp(date) {
  const parts = [
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()
  ]
  return parts.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("")
}

function expiresTimestamp(created) {
  const date = timestampDate(created)
  if (!date) return null
  return formatTimestamp(new Date(date.getTime() + LIMITS.retentionDays * 86400000))
}

function transferScaffold(kind, destination, totalBytes, encodedBytes, fileCount, runtime) {
  const id = runtime.generateTransferId()
  const created = runtime.nowTimestamp()
  const expires = expiresTimestamp(created)
  if (!isTransferId(id) || !expires || destination !== "pc") throw new Error("invalid-transfer-runtime")
  const index = {
    version: 2,
    source: "iphone",
    destination,
    created,
    expires,
    state: "uploading",
    kind,
    fileCount,
    totalBytes,
    encodedBytes
  }
  return {
    id,
    index,
    manifest: { version: 2, source: "iphone", destination, kind, fileCount, totalBytes }
  }
}

function codedError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

async function prepareTextTransfer(text, destination = "pc", runtime) {
  if (typeof text !== "string") throw codedError("text-required")
  if (!runtime || !runtime.binaryAdapter) throw codedError("binary-runtime-missing")
  const data = runtime.binaryAdapter.utf8Data(text)
  const split = splitData(data, runtime.binaryAdapter)
  if (!split) throw codedError("text-invalid")
  if (split.bytes > LIMITS.textBytes) throw codedError("text-too-large")
  const prepared = transferScaffold(
    "text", destination, split.bytes,
    split.chunks.reduce((total, chunk) => total + chunk.data.length, 0),
    0, runtime
  )
  prepared.text = {
    meta: { bytes: split.bytes, sha256: split.sha256, chunkCount: split.chunks.length },
    chunks: split.chunks
  }
  return prepared
}

async function prepareFileTransfer(paths, destination = "pc", runtime) {
  if (!Array.isArray(paths) || paths.length === 0) throw codedError("files-required")
  if (paths.length > LIMITS.fileCount) throw codedError("too-many-files")
  if (!runtime || !runtime.binaryAdapter || typeof runtime.readFile !== "function") {
    throw codedError("file-runtime-missing")
  }
  const files = []
  let totalBytes = 0
  let encodedBytes = 0
  for (let index = 0; index < paths.length; index++) {
    if (typeof paths[index] !== "string" || paths[index].length === 0) throw codedError("file-unavailable")
    const source = await runtime.readFile(paths[index])
    if (!source || source.isDirectory) throw codedError(source && source.isDirectory ? "folder-not-supported" : "file-unavailable")
    if (typeof source.filename !== "string" || source.filename.length === 0 || /[\\/]/.test(source.filename)) {
      throw codedError("invalid-filename")
    }
    const observedBytes = Number.isInteger(source.bytes)
      ? source.bytes
      : base64ByteLength(runtime.binaryAdapter.toBase64(source.data))
    if (!Number.isInteger(observedBytes) || observedBytes < 0) throw codedError("file-unavailable")
    if (observedBytes > LIMITS.fileBytes) throw codedError("file-too-large")
    totalBytes += observedBytes
    if (totalBytes > LIMITS.transferBytes) throw codedError("transfer-too-large")
    const split = splitData(source.data, runtime.binaryAdapter)
    if (!split || split.bytes !== observedBytes) throw codedError("file-read-mismatch")
    encodedBytes += split.chunks.reduce((total, chunk) => total + chunk.data.length, 0)
    files.push({
      id: fileId(index + 1),
      meta: {
        filename: source.filename,
        mime: typeof source.mime === "string" && /^[^\s/]+\/[^\s/]+$/.test(source.mime)
          ? source.mime : "application/octet-stream",
        bytes: split.bytes,
        sha256: split.sha256,
        chunkCount: split.chunks.length
      },
      chunks: split.chunks
    })
  }
  const prepared = transferScaffold("files", destination, totalBytes, encodedBytes, files.length, runtime)
  prepared.files = files
  return prepared
}

async function send(input, runtime) {
  try {
    if (!input || typeof input !== "object") throw codedError("input-required")
    const destination = input.destination || "pc"
    let prepared
    if (Array.isArray(input.files) && input.files.length > 0) {
      prepared = await prepareFileTransfer(input.files, destination, runtime)
    } else if (Array.isArray(input.images) && input.images.length > 0) {
      throw codedError("image-original-required")
    } else if (typeof input.text === "string") {
      prepared = await prepareTextTransfer(input.text, destination, runtime)
    } else {
      throw codedError("input-required")
    }
    const transferId = await publishPreparedTransfer(prepared, runtime)
    return { ok: true, transferId, kind: prepared.index.kind }
  } catch (error) {
    return { ok: false, error: error && error.code ? error.code : "send-failed" }
  }
}

function safeFilename(name, exists = () => false) {
  const component = String(name == null ? "" : name).split(/[\\/]/).filter(Boolean).pop() || ""
  let safe = component.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
  if (!safe) safe = "file"
  const extensionIndex = safe.lastIndexOf(".")
  let stem = extensionIndex > 0 ? safe.slice(0, extensionIndex) : safe
  const extension = extensionIndex > 0 ? safe.slice(extensionIndex) : ""
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:[ ._-]|$)/i.test(stem)) stem = `_${stem}`
  safe = `${stem}${extension}`
  if (!exists(safe)) return safe
  for (let index = 2; index < 10000; index++) {
    const candidate = `${stem} (${index})${extension}`
    if (!exists(candidate)) return candidate
  }
  return null
}

function activeAppliedEntries(entries, nowTimestamp) {
  const now = timestampDate(nowTimestamp)
  if (!now || !entries || typeof entries !== "object" || Array.isArray(entries)) return {}
  const active = {}
  for (const [id, timestamp] of Object.entries(entries)) {
    const date = timestampDate(timestamp)
    if (isTransferId(id) && date && now.getTime() - date.getTime() <= LIMITS.retentionDays * 86400000) {
      active[id] = timestamp
    }
  }
  return active
}

async function readChunks(client, transferId, prefix, count) {
  const chunks = []
  for (let index = 1; index <= count; index++) {
    const id = chunkId(index)
    const chunk = await client.get(firebasePath("payloads", transferId, ...prefix, "chunks", id))
    if (!validatePreparedChunk({ id, ...chunk }, id)) throw codedError("invalid-chunk")
    chunks.push({ id, bytes: chunk.bytes, sha256: chunk.sha256, data: chunk.data })
  }
  return chunks
}

async function receive(transferId, runtime) {
  if (!isTransferId(transferId) || !runtime || !runtime.binaryAdapter) {
    return { ok: false, error: "invalid-transfer-id" }
  }
  const client = createFirebaseClient(runtime)
  const queuePath = firebasePath("queues", "toIphone", transferId)
  const queue = await client.get(queuePath)
  if (!queue) return { ok: false, error: "not-found" }
  if (queue.version !== 2 || !["text", "files"].includes(queue.kind) || !timestampDate(queue.created)) {
    return { ok: false, error: "invalid-queue" }
  }

  const now = runtime.nowTimestamp()
  const applied = activeAppliedEntries(runtime.loadApplied(), now)
  if (Object.hasOwn(applied, transferId)) {
    let cleanupPending = false
    try {
      await deleteReceivedTransfer(transferId, "iphone", runtime)
    } catch (_) {
      cleanupPending = true
    }
    return { ok: true, duplicate: true, cleanupPending }
  }

  const index = await client.get(firebasePath("index", transferId))
  if (!validateIndex(index) || index.state !== "ready" || index.destination !== "iphone" ||
    index.kind !== queue.kind || index.created !== queue.created) {
    return { ok: false, error: "invalid-index" }
  }
  const manifest = await client.get(firebasePath("payloads", transferId, "manifest"))
  if (!validateManifest(manifest, index)) return { ok: false, error: "invalid-manifest" }

  let degraded = false
  let fileCount = 0
  try {
    if (index.kind === "text") {
      const meta = await client.get(firebasePath("payloads", transferId, "text", "meta"))
      if (!validateTextMeta(meta)) throw codedError("invalid-text-meta")
      const chunks = await readChunks(client, transferId, ["text"], meta.chunkCount)
      const data = assembleChunks(chunks, meta.bytes, meta.sha256, runtime.binaryAdapter)
      if (data == null) throw codedError("invalid-text-data")
      const text = runtime.binaryAdapter.rawString(data)
      if (typeof text !== "string" ||
        runtime.binaryAdapter.toBase64(runtime.binaryAdapter.utf8Data(text)) !== runtime.binaryAdapter.toBase64(data)) {
        throw codedError("invalid-utf8")
      }
      runtime.copyString(text)
    } else {
      const staged = []
      for (let index = 1; index <= manifest.fileCount; index++) {
        const id = fileId(index)
        const meta = await client.get(firebasePath("payloads", transferId, "files", id, "meta"))
        if (!validateFileMeta(meta)) throw codedError("invalid-file-meta")
        const chunks = await readChunks(client, transferId, ["files", id], meta.chunkCount)
        const data = assembleChunks(chunks, meta.bytes, meta.sha256, runtime.binaryAdapter)
        if (data == null) throw codedError("invalid-file-data")
        const filename = safeFilename(meta.filename, runtime.receivedFileExists || (() => false))
        if (!filename) throw codedError("filename-collision")
        staged.push(await runtime.stageFile(transferId, id, filename, data, meta.mime))
      }
      const committed = await runtime.commitFiles(staged)
      fileCount = committed.length
      for (const file of committed) {
        if (!file.mime.startsWith("image/")) continue
        const image = runtime.imageFromFile(file.path)
        if (!image) continue
        try {
          runtime.copyImage(image)
        } catch (_) {
          degraded = true
        }
      }
    }
  } catch (_) {
    if (typeof runtime.cleanupStaged === "function") await runtime.cleanupStaged(transferId)
    return { ok: false, error: "receive-failed" }
  }

  applied[transferId] = now
  runtime.saveApplied(applied)
  let cleanupPending = false
  try {
    await deleteReceivedTransfer(transferId, "iphone", runtime)
  } catch (_) {
    cleanupPending = true
  }
  return { ok: true, kind: index.kind, fileCount, degraded, cleanupPending }
}

function normalizeInvocation(scriptArgs) {
  const values = scriptArgs || {}
  if (Array.isArray(values.fileURLs) && values.fileURLs.length > 0) {
    return { action: "send", files: values.fileURLs.slice(), destination: "pc" }
  }
  if (Array.isArray(values.plainTexts) && values.plainTexts.length > 0) {
    return { action: "send", text: values.plainTexts.map(String).join("\n"), destination: "pc" }
  }
  if (Array.isArray(values.images) && values.images.length > 0) {
    return { action: "send", images: values.images.slice(), destination: "pc" }
  }
  const parameter = values.shortcutParameter
  if (typeof parameter === "string" && isTransferId(parameter)) {
    return { action: "receive", transferId: parameter }
  }
  if (parameter && typeof parameter === "object") {
    if (parameter.action === "configure") return { action: "configure" }
    if (parameter.action === "receive") {
      return { action: "receive", transferId: String(parameter.transferId || "") }
    }
    if (parameter.action === "send") {
      if (Array.isArray(parameter.files)) return { action: "send", files: parameter.files.slice(), destination: "pc" }
      if (typeof parameter.text === "string") return { action: "send", text: parameter.text, destination: "pc" }
    }
  }
  return { action: "invalid" }
}

function mimeForFilename(filename) {
  const extension = String(filename).split(".").pop().toLowerCase()
  const known = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    heic: "image/heic", webp: "image/webp", pdf: "application/pdf", txt: "text/plain",
    json: "application/json", csv: "text/csv", zip: "application/zip"
  }
  return known[extension] || "application/octet-stream"
}

function scriptableFilePath(value) {
  const text = String(value)
  if (!text.startsWith("file://")) return text
  try {
    return decodeURIComponent(text.slice(7))
  } catch (_) {
    return text.slice(7)
  }
}

function createScriptableRuntime() {
  const binaryAdapter = {
    toBase64: data => data.toBase64String(),
    fromBase64: value => Data.fromBase64String(value),
    getBytes: data => Uint8Array.from(data.getBytes()),
    fromBytes: bytes => Data.fromBytes(Array.from(bytes)),
    utf8Data: text => Data.fromString(text),
    rawString: data => data.toRawString()
  }
  const local = FileManager.local()
  const cloud = FileManager.iCloud()
  const appliedPath = local.joinPath(local.libraryDirectory(), "UniversalClipboardApplied.json")
  const receivedRoot = cloud.joinPath(cloud.documentsDirectory(), "Universal Clipboard/Received")
  const stagingRoot = cloud.joinPath(cloud.documentsDirectory(), "Universal Clipboard/.staging")

  function readSecret() {
    if (!Keychain.contains(FIREBASE_KEYCHAIN_KEY)) throw codedError("firebase-secret-missing")
    const secret = String(Keychain.get(FIREBASE_KEYCHAIN_KEY)).trim()
    if (!secret) throw codedError("firebase-secret-missing")
    return secret
  }

  return {
    binaryAdapter,
    nowTimestamp: () => formatTimestamp(new Date()),
    delay: milliseconds => new Promise(resolve => Timer.schedule(milliseconds / 1000, false, resolve)),
    generateTransferId() {
      const seed = Data.fromString(`${UUID.string()}|${UUID.string()}|${Date.now()}`)
      return sha256Hex(seed.getBytes()).slice(0, 32)
    },
    async firebaseRequest(method, logicalPath, body) {
      const secret = readSecret()
      const request = new Request(`${FIREBASE_BASE_URL}/${FIREBASE_ROOT}/${logicalPath}.json?auth=${encodeURIComponent(secret)}`)
      request.method = method
      request.timeoutInterval = 30
      request.headers = { "Accept": "application/json", "Content-Type": "application/json" }
      if (body !== undefined) request.body = JSON.stringify(body)
      const response = await request.loadString()
      const status = request.response && request.response.statusCode
      if (!status || status < 200 || status >= 300) throw codedError("firebase-request-failed")
      return response.trim() === "" ? null : JSON.parse(response)
    },
    async readFile(value) {
      const filePath = scriptableFilePath(value)
      let isDirectory = false
      try { isDirectory = cloud.isDirectory(filePath) } catch (_) {}
      if (isDirectory) return { isDirectory: true }
      try { await cloud.downloadFileFromiCloud(filePath) } catch (_) {}
      const data = Data.fromFile(filePath)
      if (!data) throw codedError("file-unavailable")
      const filename = filePath.split(/[\\/]/).pop() || "file"
      return { filename, mime: mimeForFilename(filename), data, isDirectory: false }
    },
    loadApplied() {
      if (!local.fileExists(appliedPath)) return {}
      try {
        const value = JSON.parse(local.readString(appliedPath))
        return value && typeof value === "object" && !Array.isArray(value) ? value : {}
      } catch (_) {
        return {}
      }
    },
    saveApplied(value) {
      local.writeString(appliedPath, JSON.stringify(value))
    },
    copyString: value => Pasteboard.copyString(value),
    copyImage: image => Pasteboard.copyImage(image),
    imageFromFile: filePath => Image.fromFile(filePath),
    async notify(code) {
      const notification = new Notification()
      notification.title = "Universal Clipboard"
      notification.body = code === "image-copy-degraded"
        ? "Fichier image reçu ; copie dans le presse-papiers impossible."
        : "État du transfert mis à jour."
      await notification.schedule()
    },
    receivedFileExists: filename => cloud.fileExists(cloud.joinPath(receivedRoot, filename)),
    async stageFile(transferId, id, filename, data, mime) {
      const transferRoot = cloud.joinPath(stagingRoot, transferId)
      if (!cloud.fileExists(transferRoot)) cloud.createDirectory(transferRoot, true)
      const stagedPath = cloud.joinPath(transferRoot, `${id}-${filename}`)
      cloud.write(stagedPath, data)
      return { transferId, id, filename, mime, stagedPath }
    },
    async commitFiles(staged) {
      if (!cloud.fileExists(receivedRoot)) cloud.createDirectory(receivedRoot, true)
      const reserved = new Set()
      const planned = staged.map(file => {
        const filename = safeFilename(file.filename, candidate =>
          reserved.has(candidate) || cloud.fileExists(cloud.joinPath(receivedRoot, candidate)))
        if (!filename) throw codedError("filename-collision")
        reserved.add(filename)
        return { ...file, filename, path: cloud.joinPath(receivedRoot, filename) }
      })
      for (const file of planned) cloud.move(file.stagedPath, file.path)
      if (planned.length > 0) {
        const transferRoot = cloud.joinPath(stagingRoot, planned[0].transferId)
        if (cloud.fileExists(transferRoot)) cloud.remove(transferRoot)
      }
      return planned
    },
    async cleanupStaged(transferId) {
      const transferRoot = cloud.joinPath(stagingRoot, transferId)
      if (cloud.fileExists(transferRoot)) cloud.remove(transferRoot)
    },
    async configureSecret() {
      const alert = new Alert()
      alert.title = "Configurer Universal Clipboard"
      alert.message = "Secret Realtime Database du projet Personal Tools"
      alert.addSecureTextField("Secret Firebase", "")
      alert.addAction("Enregistrer")
      alert.addCancelAction("Annuler")
      const action = await alert.presentAlert()
      if (action < 0) return { ok: false, error: "configuration-cancelled" }
      const secret = String(alert.textFieldValue(0) || "").trim()
      if (!secret) return { ok: false, error: "configuration-empty" }
      Keychain.set(FIREBASE_KEYCHAIN_KEY, secret)
      return { ok: true, configured: true }
    }
  }
}

async function runInvocation(invocation, runtime) {
  if (invocation.action === "configure") return runtime.configureSecret()
  if (invocation.action === "receive") return receive(invocation.transferId, runtime)
  if (invocation.action === "send") return send(invocation, runtime)
  return { ok: false, error: "invalid-input" }
}

async function runShortcut(script, scriptArgs, runtime = createScriptableRuntime()) {
  let result
  try {
    result = await runInvocation(normalizeInvocation(scriptArgs), runtime)
  } catch (_) {
    result = { ok: false, error: "universal-clipboard-failed" }
  }
  if (result.degraded && typeof runtime.notify === "function") {
    await runtime.notify("image-copy-degraded")
  }
  script.setShortcutOutput(result)
  script.complete()
  return result
}

module.exports = {
  Sha256,
  assembleChunks,
  chunkId,
  createFirebaseClient,
  deleteReceivedTransfer,
  expectedChunkCount,
  fileId,
  firebasePath,
  isTransferId,
  limits,
  normalizeInvocation,
  prepareFileTransfer,
  prepareTextTransfer,
  publishPreparedTransfer,
  receive,
  runInvocation,
  runShortcut,
  safeFilename,
  send,
  sha256Hex,
  splitData,
  validateFileMeta,
  validateIndex
}

if (typeof Script !== "undefined" && Script.name() === "UniversalClipboard") {
  runShortcut(Script, args).catch(error => {
    console.error(`[UniversalClipboard] Échec sans contenu : ${String(error && error.message || error)}`)
  })
}
