# Contract specification: `src/utils/zip.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A minimal ZIP reader and writer.

Written by hand rather than pulled from a package because the whole of what
is needed here is one archive shape: a flat list of paths, each holding a
small JSON document. That is a few hundred lines of well-documented format,
against a dependency in a project that otherwise has none for this.

Compression is the browser's. `CompressionStream('deflate-raw')` and its
decompressing twin are built in, which leaves this module responsible only
for the container — headers, the central directory, and the CRC. Where the
streams are unavailable, entries are stored uncompressed; a ZIP with stored
entries is still a perfectly ordinary ZIP.

Deliberately not supported: encryption, ZIP64, multi-disk archives, and the
compression methods older than deflate. An archive using any of them is
rejected by name rather than half-read. Workspaces are tens of kilobytes of
JSON, so the 4 GB and 65,535-entry ceilings that ZIP64 exists to lift are
not ceilings this will meet.

## EXPORTED (5)

### `crc32(bytes)`

- **Reachability:** EXPORTED
- **Obtain via:** import { crc32 } from '../../src/utils/zip.js'

The CRC-32 checksum ZIP stores for each entry.

**Parameters**

- `bytes` — `Uint8Array` — The uncompressed data.

**Returns**

- `number` — The checksum, as an unsigned 32-bit integer.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dosStamp(date)`

- **Reachability:** EXPORTED
- **Obtain via:** import { dosStamp } from '../../src/utils/zip.js'

A timestamp in the two 16-bit fields MS-DOS used.

Seconds are stored in units of two, and years count from 1980, both being
what the format has recorded since it was designed for floppies. Dates
outside its range are clamped rather than allowed to wrap into a
nonsensical year.

**Parameters**

- `date` — `Date` — The time to encode.

**Returns**

- `{time: number, date: number}` — The two packed fields.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `createZip(entries, stamp)`

- **Reachability:** EXPORTED
- **Obtain via:** import { createZip } from '../../src/utils/zip.js'
- **Async:** returns a Promise

Build a ZIP archive.

Folders are written as their own zero-length entries with a trailing
separator, which is how a ZIP records a folder that holds nothing. Without
them an empty folder would simply not survive the round trip.

**Parameters**

- `entries` — `Array<{path: string, data?: Uint8Array|string, folder?: boolean}>` — What to archive. A `folder` entry needs no data.
- `stamp` — `Date` _(optional)_ — Modification time recorded for every entry; defaults to now.

**Returns**

- `Promise<Blob>` — The archive.

**Side effects**

- Compresses through the platform's streams; reads the clock when no stamp is given.

### `isZip(buffer)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isZip } from '../../src/utils/zip.js'

Whether a buffer looks like a ZIP archive.

Checked by signature rather than by filename, because the file picker will
hand over whatever the user chose and the extension is the least reliable
thing about it.

**Parameters**

- `buffer` — `ArrayBuffer` — The file's bytes.

**Returns**

- `boolean` — True when the buffer starts with a local file header.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `readZip(buffer)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readZip } from '../../src/utils/zip.js'
- **Async:** returns a Promise

Read a ZIP archive.

The central directory is the index — entries are read from there rather than
by walking local headers, because only the directory is authoritative about
what the archive contains. Folder entries are reported with `folder: true`
and no data.

**Parameters**

- `buffer` — `ArrayBuffer` — The archive's bytes.

**Returns**

- `Promise<Array<{path: string, data: Uint8Array|null, folder: boolean}>>` — One record per entry, in directory order.

**Throws**

- `Error` — When the archive is malformed, or uses a feature this does not read.

**Side effects**

- Decompresses through the platform's streams.

## UNREACHABLE (5)

### `u16(n)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A 16-bit little-endian value, as bytes.

**Parameters**

- `n` — `number` — The value.

**Returns**

- `number[]` — Two bytes, least significant first.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `u32(n)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A 32-bit little-endian value, as bytes.

**Parameters**

- `n` — `number` — The value.

**Returns**

- `number[]` — Four bytes, least significant first.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `deflate(bytes)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Compress bytes with raw deflate, if the browser can.

Returns the input unchanged when compression is unavailable or fails to pay
for itself — a JSON document that deflates larger than it started, which
happens for very short files, is better stored.

**Parameters**

- `bytes` — `Uint8Array` — The data to compress.

**Returns**

- `Promise<{method: number, data: Uint8Array}>` — The chosen method and the bytes to write.

**Side effects**

- Uses the platform's compression streams when present.

### `inflate(bytes)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Decompress raw deflate bytes.

**Parameters**

- `bytes` — `Uint8Array` — The compressed data.

**Returns**

- `Promise<Uint8Array>` — The original bytes.

**Throws**

- `Error` — When the platform cannot decompress, or the data is corrupt.

**Side effects**

- Uses the platform's decompression streams.

### `findEnd(view)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Locate the end-of-central-directory record.

Searched backwards from the end, because the record is last but may be
followed by a variable-length comment. The scan is bounded by the largest
comment the format allows.

**Parameters**

- `view` — `DataView` — The whole archive.

**Returns**

- `number` — The record's offset, or `-1` when there is none.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
