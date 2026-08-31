// A minimal ZIP reader and writer.
//
// Written by hand rather than pulled from a package because the whole of what
// is needed here is one archive shape: a flat list of paths, each holding a
// small JSON document. That is a few hundred lines of well-documented format,
// against a dependency in a project that otherwise has none for this.
//
// Compression is the browser's. `CompressionStream('deflate-raw')` and its
// decompressing twin are built in, which leaves this module responsible only
// for the container — headers, the central directory, and the CRC. Where the
// streams are unavailable, entries are stored uncompressed; a ZIP with stored
// entries is still a perfectly ordinary ZIP.
//
// Deliberately not supported: encryption, ZIP64, multi-disk archives, and the
// compression methods older than deflate. An archive using any of them is
// rejected by name rather than half-read. Workspaces are tens of kilobytes of
// JSON, so the 4 GB and 65,535-entry ceilings that ZIP64 exists to lift are
// not ceilings this will meet.

/** Local file header signature, `PK\x03\x04`. */
const SIG_LOCAL = 0x04034b50
/** Central directory file header signature, `PK\x01\x02`. */
const SIG_CENTRAL = 0x02014b50
/** End-of-central-directory signature, `PK\x05\x06`. */
const SIG_END = 0x06054b50

/** Stored — the entry's bytes are the file's bytes. */
const STORED = 0
/** Deflate, the only compression method this reads or writes. */
const DEFLATE = 8

/**
 * General-purpose flag bit 11: filenames and comments are UTF-8.
 *
 * Set on every entry written. Without it a reader is entitled to decode names
 * as IBM Code Page 437, which turns any non-ASCII project name into mojibake.
 */
const FLAG_UTF8 = 0x800

/**
 * The CRC-32 lookup table, built once on first use.
 *
 * @returns {Uint32Array} 256 precomputed remainders.
 * @pure
 */
const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

/**
 * The CRC-32 checksum ZIP stores for each entry.
 *
 * @param {Uint8Array} bytes - The uncompressed data.
 * @returns {number} The checksum, as an unsigned 32-bit integer.
 * @pure
 */
export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * A 16-bit little-endian value, as bytes.
 *
 * @param {number} n - The value.
 * @returns {number[]} Two bytes, least significant first.
 * @pure
 */
const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff]

/**
 * A 32-bit little-endian value, as bytes.
 *
 * @param {number} n - The value.
 * @returns {number[]} Four bytes, least significant first.
 * @pure
 */
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

/**
 * A timestamp in the two 16-bit fields MS-DOS used.
 *
 * Seconds are stored in units of two, and years count from 1980, both being
 * what the format has recorded since it was designed for floppies. Dates
 * outside its range are clamped rather than allowed to wrap into a
 * nonsensical year.
 *
 * @param {Date} date - The time to encode.
 * @returns {{time: number, date: number}} The two packed fields.
 * @pure
 */
export function dosStamp(date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()))
  return {
    time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff,
    date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
  }
}

/**
 * Compress bytes with raw deflate, if the browser can.
 *
 * Returns the input unchanged when compression is unavailable or fails to pay
 * for itself — a JSON document that deflates larger than it started, which
 * happens for very short files, is better stored.
 *
 * @param {Uint8Array} bytes - The data to compress.
 * @returns {Promise<{method: number, data: Uint8Array}>} The chosen method and the bytes to write.
 * @sideEffect Uses the platform's compression streams when present.
 */
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined' || !bytes.length) {
    return { method: STORED, data: bytes }
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const out = new Uint8Array(await new Response(stream).arrayBuffer())
    return out.length < bytes.length ? { method: DEFLATE, data: out } : { method: STORED, data: bytes }
  } catch {
    return { method: STORED, data: bytes }
  }
}

/**
 * Decompress raw deflate bytes.
 *
 * @param {Uint8Array} bytes - The compressed data.
 * @returns {Promise<Uint8Array>} The original bytes.
 * @throws {Error} When the platform cannot decompress, or the data is corrupt.
 * @sideEffect Uses the platform's decompression streams.
 */
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read compressed archives.')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Build a ZIP archive.
 *
 * Folders are written as their own zero-length entries with a trailing
 * separator, which is how a ZIP records a folder that holds nothing. Without
 * them an empty folder would simply not survive the round trip.
 *
 * @param {Array<{path: string, data?: Uint8Array|string, folder?: boolean}>} entries - What to archive. A `folder` entry needs no data.
 * @param {Date} [stamp] - Modification time recorded for every entry; defaults to now.
 * @returns {Promise<Blob>} The archive.
 * @sideEffect Compresses through the platform's streams; reads the clock when no stamp is given.
 */
export async function createZip(entries, stamp = new Date()) {
  const encoder = new TextEncoder()
  const { time, date } = dosStamp(stamp)
  const chunks = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const isFolder = !!entry.folder
    const path = isFolder && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path
    const name = encoder.encode(path)
    const raw = isFolder
      ? new Uint8Array(0)
      : (typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data)
    const { method, data } = isFolder ? { method: STORED, data: raw } : await deflate(raw)
    const sum = crc32(raw)

    const local = Uint8Array.from([
      ...u32(SIG_LOCAL), ...u16(20), ...u16(FLAG_UTF8), ...u16(method),
      ...u16(time), ...u16(date), ...u32(sum), ...u32(data.length), ...u32(raw.length),
      ...u16(name.length), ...u16(0),
    ])
    chunks.push(local, name, data)

    central.push(Uint8Array.from([
      ...u32(SIG_CENTRAL), ...u16(20), ...u16(20), ...u16(FLAG_UTF8), ...u16(method),
      ...u16(time), ...u16(date), ...u32(sum), ...u32(data.length), ...u32(raw.length),
      ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      // External attributes: the MS-DOS directory bit, so an unpacker that
      // reads attributes rather than the trailing slash still sees a folder.
      ...u32(isFolder ? 0x10 : 0),
      ...u32(offset),
    ]), name)

    offset += local.length + name.length + data.length
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = Uint8Array.from([
    ...u32(SIG_END), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ])

  return new Blob([...chunks, ...central, end], { type: 'application/zip' })
}

/**
 * Whether a buffer looks like a ZIP archive.
 *
 * Checked by signature rather than by filename, because the file picker will
 * hand over whatever the user chose and the extension is the least reliable
 * thing about it.
 *
 * @param {ArrayBuffer} buffer - The file's bytes.
 * @returns {boolean} True when the buffer starts with a local file header.
 * @pure
 */
export function isZip(buffer) {
  if (buffer.byteLength < 4) return false
  const b = new Uint8Array(buffer, 0, 4)
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

/**
 * Locate the end-of-central-directory record.
 *
 * Searched backwards from the end, because the record is last but may be
 * followed by a variable-length comment. The scan is bounded by the largest
 * comment the format allows.
 *
 * @param {DataView} view - The whole archive.
 * @returns {number} The record's offset, or `-1` when there is none.
 * @pure
 */
function findEnd(view) {
  const min = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_END) return i
  }
  return -1
}

/**
 * Read a ZIP archive.
 *
 * The central directory is the index — entries are read from there rather than
 * by walking local headers, because only the directory is authoritative about
 * what the archive contains. Folder entries are reported with `folder: true`
 * and no data.
 *
 * @param {ArrayBuffer} buffer - The archive's bytes.
 * @returns {Promise<Array<{path: string, data: Uint8Array|null, folder: boolean}>>} One record per entry, in directory order.
 * @throws {Error} When the archive is malformed, or uses a feature this does not read.
 * @sideEffect Decompresses through the platform's streams.
 */
export async function readZip(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()

  const end = findEnd(view)
  if (end === -1) throw new Error('Not a ZIP archive, or it is truncated.')

  const count = view.getUint16(end + 10, true)
  let p = view.getUint32(end + 16, true)
  const out = []

  for (let i = 0; i < count; i++) {
    if (p + 46 > buffer.byteLength || view.getUint32(p, true) !== SIG_CENTRAL) {
      throw new Error('This archive’s index is damaged.')
    }
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const csize = view.getUint32(p + 20, true)
    const usize = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const local = view.getUint32(p + 42, true)
    const path = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))

    if (flags & 0x1) throw new Error('Encrypted archives are not supported.')
    if (method !== STORED && method !== DEFLATE) {
      throw new Error(`“${path}” uses an unsupported compression method.`)
    }

    const folder = path.endsWith('/')
    if (folder) {
      out.push({ path: path.slice(0, -1), data: null, folder: true })
    } else {
      // The local header's name and extra fields are sized independently of
      // the central directory's, so the data offset has to be read from the
      // local header rather than assumed.
      if (view.getUint32(local, true) !== SIG_LOCAL) throw new Error(`“${path}” is not where the index says it is.`)
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const raw = bytes.subarray(start, start + csize)
      const data = method === DEFLATE ? await inflate(raw) : raw.slice()
      if (data.length !== usize) throw new Error(`“${path}” did not unpack to its recorded size.`)
      if (crc32(data) !== view.getUint32(p + 16, true)) throw new Error(`“${path}” failed its checksum.`)
      out.push({ path, data, folder: false })
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
