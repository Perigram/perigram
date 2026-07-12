# COMPONENT: Invitations

Manages organization membership invitations.

## Core Files
- `repository.js`: Database operations for `invitations` collection.
- `service.js`: Invitation generation and processing.

## Workflows
1. **Generate**: A user who can manage team members in the organization creates
   a unique token and short code for organization joining. The same
   team-management access check is used for listing, creating, and revoking
   invitations: active process `users:admin` grants pass first, with the narrow
   stored membership `users:admin` grant recovery path from the users feature.
   The team-management UI shows the generated `/invitation/:token` link for
   copying; invitations are not addressed to a specific email.
2. **Authenticate**: Anonymous invitees use the link to log in or register.
   Registration from an invitation creates only the user account and preserves
   the redirect back to the invitation instead of asking for organization
   details.
3. **Join**: The authenticated user accepts the invitation via token or code,
   creating a pending membership with the invited process role ids and no copied
   permission preset. Organization admins approve or reject the pending
   membership from team management. Approval activates the matching assignment
   in the organization's active process definition, which is the runtime access
   source for the invited user.

Invitation organization ids use the repository `toFlexibleId()` convention so
both string organization ids such as `org-...` and Mongo ObjectIds can own and
query invitations.

## API / Functions
- `generateInvitation()`: Creates a new invitation after team-management
  authorization and stores one or more invited process role ids.
- `listByOrgForUser()`: Lists active organization invitations after
  team-management authorization.
- `revokeInvitation()`: Revokes an invitation after team-management
  authorization.
- `joinByToken()`: Process join using secret token.
- `joinByCode()`: Process join using short alphanumeric code.
