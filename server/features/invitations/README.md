# COMPONENT: Invitations

Manages organization membership invitations.

## Core Files
- `repository.js`: Database operations for `invitations` collection.
- `service.js`: Invitation generation and processing.

## Workflows
1. **Generate**: An organization user with `users` access creates a unique
   token and short code for organization joining. The team-management UI shows
   the generated `/invitation/:token` link for copying; invitations are not
   addressed to a specific email.
2. **Authenticate**: Anonymous invitees use the link to log in or register.
   Registration from an invitation creates only the user account and preserves
   the redirect back to the invitation instead of asking for organization
   details.
3. **Join**: The authenticated user accepts the invitation via token or code,
   creating a pending membership with the invited process role ids. Organization
   admins approve or reject the pending membership from team management.
   Approval activates the matching assignment in the organization's active
   process definition.

## API / Functions
- `generateInvitation()`: Creates new invitation.
- `joinByToken()`: Process join using secret token.
- `joinByCode()`: Process join using short alphanumeric code.
