# COMPONENT: Files

GridFS blob transport for the app: single-request uploads, inline/range
downloads, and resumable chunked upload sessions.

Parent: [server/features](../README.md).

## Responsibility

- `service.js` owns the GridFS bucket seam and upload-session validation.
- `repository.js` owns the session collections (`files_upload_sessions`,
  `files_upload_chunks`).
- API routes import the service directly; wire behavior of the routes
  (byte ranges, RFC 6266 disposition filenames) is owned by
  [server/api](../../api/README.md).

## Access

HTTP downloads require an authenticated principal. Organization-owned files
are readable only in their owning active organization (or through a matching
membership when no organization is active); unscoped user uploads are private
to their uploader. Unowned system files are readable by authenticated users.
GridFS ids are not bearer credentials. The HTTP transport exposes only the
`uploads` and `files` buckets.

## GridFS contract

| Export | Contract |
|---|---|
| `uploadFile(buffer, fileName, metadata, bucket, contentType)` | Stores one file; returns `{ id, filename, url }` with `url = /api/files/download/<id>?bucket=<bucket>`. `metadata.createdAt` is stamped, and a non-empty buffer carries `metadata.contentHash` — the payload's `sha256:<hex>` (SPEC §28 artifact contract: every stored file is content-addressed, every bucket). A non-empty `contentType` is stored on the file. |
| `getFileStream(fileId, bucket)` | Full download stream. |
| `getFileRangeStream(fileId, bucket, start, endInclusive)` | Range stream for media seeking; the inclusive end maps to GridFS's exclusive `end`. |
| `findFileMeta(fileId, bucket)` | `{ filename, contentType, length, metadata }` or `null`. |
| `findFileMetaByFilename(filename, bucket)` | Same shape plus `id`, resolved by GridFS filename; `null` when absent. |
| `listFileMetasWhere(bucket, filter)` | Every file meta matching a GridFS filter, each `{ id, filename, contentType, length, metadata }` — retraction-style cleanup over a bucket. |
| `getFileBuffer(fileId, bucket)` | Whole file as one `Buffer`. |
| `deleteFile(fileId, bucket)` | Deletes; a missing file is a no-op. |
| `contentTypeForFile({ filename, contentType, metadata })` | Resolution order: stored `contentType`, then `metadata.mimeType`, then the filename-extension map, then `application/octet-stream`. Sniffed and octet-stream values lose to the extension map so declared previews render inline. |

Buckets: `uploads` is the single-POST default; `files` is the
upload-session target (the SPEC §3 blob home instance payloads and chat
attachments live in).

## Resumable upload sessions

Big uploads ride chunk-append sessions so a disconnect resumes with only
the missing chunks. Chunks persist as plain documents (survive server
restarts); TTL indexes reap abandoned sessions and chunks after one day.

| Constant | Value |
|---|---|
| Chunk size | 5 MiB |
| Session size cap | 1 GiB |
| Session status | `open`, `completed`, `expired` |
| Open expiry | 24 h |
| Session document TTL | 48 h |

The session's `status` is its state; the chunk collection is a fact about an
`open` session.

| From | Event / guard | To |
|---|---|---|
| — | create session | `open` |
| `open` | complete with every chunk present | `completed` |
| `open` | sweep after 24 h | `expired` |

`completed` and `expired` are terminal. A duplicate completion returns the
stored result without uploading again. The sweep marks stale open sessions
`expired`, deletes their chunks, and runs every 10 minutes
(`UPLOAD_SESSION_SWEEP_INTERVAL_MS`); the session document is reaped later by
its TTL index.

| Export | Contract |
|---|---|
| `createUploadSession({ fileName, mimeType, size }, context, bucket)` | Validates the byte count against the cap; returns `{ uploadId, chunkSize, size, status }`. |
| `getUploadSession(uploadId, { userId })` | Resume state `{ uploadId, chunkSize, size, status, received }` with the received chunk indexes; `expired` answers `410`. |
| `appendUploadChunk(uploadId, index, buffer, { userId })` | Idempotent per index; requires `open` and validates index range and chunk size. |
| `completeUploadSession(uploadId, { userId })` | Requires every chunk present; assembles, checks the byte count, uploads through `uploadFile` into the session's bucket, and marks the session `completed`. |
| `sweepExpiredUploadSessions(now?)` | Marks stale `open` sessions `expired` and deletes their chunks. |

Sessions are caller-scoped: a `userId` mismatch reads as not found.

## API

| Route | Responsibility |
|---|---|
| `POST /api/files/upload` | Multipart single-request upload (field `file`; `?bucket=` override). |
| `GET /api/files/download/:id` | Inline-first stream; `?download=1`, `?bucket=`, `Range` → `206`. |
| `POST /api/files/upload-sessions` | Opens a session. |
| `GET /api/files/upload-sessions/:id` | Reports the received chunk indexes. |
| `PUT /api/files/upload-sessions/:id/:index` | Appends one raw-bytes chunk. |
| `POST /api/files/upload-sessions/:id/complete` | Assembles and stores the file. |

## Consumers

- Chat attachments and the `useChatFileUpload` transport
  ([support](../support/README.md)).
- Revision snapshot files stream through
  [instance-revisions](../instance-revisions/README.md).

## Related

- [server/api](../../api/README.md) — route-level wire contracts.
