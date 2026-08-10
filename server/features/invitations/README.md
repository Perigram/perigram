# COMPONENT: Invitations

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
   The public token endpoint returns a sanitized invitation presentation with
   the stored organization name and server-resolved role labels. The browser
   never requests the protected organization entity while rendering the form.
3. **Join**: The authenticated user accepts the invitation via token or code,
   creating a pending membership with no copied role state or permission preset
   and writing the invited role ids to the organization's authoritative role
   assignment. Organization admins approve or reject the membership from team
   management. Pending membership prevents runtime tenant access; rejection
   removes both membership and organization assignment.

Invitation organization ids use the repository `toFlexibleId()` convention
covered by the [feature template](../_template/README.md).

## API / Functions
- `generateInvitation()`: Creates a new invitation after team-management
  authorization, validates organization role ids, and stores those ids.
- `listByOrgForUser()`: Lists active organization invitations after
  team-management authorization.
- `revokeInvitation()`: Revokes an invitation after team-management
  authorization.
- `joinByToken()`: Process join using secret token.
- `joinByCode()`: Process join using short alphanumeric code.
