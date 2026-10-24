# COMPONENT: Sessions

Manages user authentication sessions.

Parent: [server/features](../README.md).

## Core Files
- `repository.js`: Database operations for `sessions` collection.

## Functions
- `create()`: Store new session.
- `findBySessionId()`: Retrieve active session.
- `deleteBySessionId()`: Invalidate specific session (logout).
- `deleteByUserId()`: Invalidate all sessions for a user.
- `deleteExpired()`: Cleanup task.
