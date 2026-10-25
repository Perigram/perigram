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

## GridFS contract

| Export | Contract |
|---|---|
| `uploadFile(buffer, fileName, metadata, bucket, contentType)` | Stores one file; returns `{ id, filename, url }` with `url = /api/files/download/<id>?bucket=<bucket>`. `metadata.createdAt` is stamped; a non-empty `contentType` is stored on the file. |
| `getFileStream(fileId, bucket)` | Full download stream. |
| `getFileRangeStream(fileId, bucket, start, endInclusive)` | Range stream for media seeking; the inclusive end maps to GridFS's exclusive `end`. |
| `findFileMeta(fileId, bucket)` | `{ filename, contentType, length, metadata }` or `null`. |
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
| TTL | 24 h |

| Export | Contract |
|---|---|
| `createUploadSession({ fileName, mimeType, size }, context, bucket)` | Validates the byte count against the cap; returns `{ uploadId, chunkSize, size }`. |
| `getUploadSession(uploadId, { userId })` | Resume state `{ uploadId, chunkSize, size, received }` with the received chunk indexes. |
| `appendUploadChunk(uploadId, index, buffer, { userId })` | Idempotent per index; validates index range and chunk size. |
| `completeUploadSession(uploadId, { userId })` | Requires every chunk present; assembles, checks the byte count, uploads through `uploadFile` into the session's bucket, deletes the session. |

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
