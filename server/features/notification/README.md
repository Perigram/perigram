# COMPONENT: Notification

Legacy notification helper for compatibility nesting jobs.

## Files

| File | Purpose |
|---|---|
| `sendEmail.js` | Sends nesting-finished emails through Resend when notification credentials are configured. |

## Contract

- `sendNestFinishEmail(nestingJob)` resolves the project by
  `nestingJob.projectSlug` and the owner user by `nestingJob.ownerId`.
- Email delivery is best-effort. Missing users/projects or Resend/API errors
  return `false` and log a warning so nesting completion is not reported as a
  server error.
- Results are stored as `notification_sent` or `notification_skipped` on the
  compatibility `nesting_jobs.emailNotify` field.
