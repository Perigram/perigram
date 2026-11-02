# COMPONENT: Invitations

Parent: [server/features](../README.md).

## Workflows
1. **Generate**: A user who can manage team members in the organization creates
   a unique token and short code for organization joining. The same
   team-management access check is used for listing, creating, and revoking
   invitations: active process `users:admin` grants pass first, with the narrow
   stored membership `users:admin` grant recovery path from the users feature.
   The team-management UI shows the generated `/invitation/:token` link for
   copying; invitations are not addressed to a specific email.
2. **Authenticate**: Anonymous invitees use the link to log in or register.
   Registration from an invitation creates only the user account, preserves
   the redirect back to the invitation, and skips the organization-details
   step.
   The public token endpoint returns a sanitized invitation presentation with
   the stored organization name and server-resolved role labels. The browser
   never requests the protected organization entity while rendering the form.
3. **Join**: The authenticated user accepts the invitation via token or code,
   creating a pending membership with no copied role state or permission preset
   and writing the invited role ids to the organization's authoritative role
   assignment. Organization admins approve or reject the membership from team
   management. Pending membership prevents runtime tenant access; rejection
   removes both membership and organization assignment.

## Invitation Machine

One `status` field is the invitation state. Link and targeted invitations
share the machine.

| From | Event / guard | To |
|---|---|---|
| `pending` | link join by token or code | `accepted` |
| `pending` | targeted invitee accepts | `accepted` |
| `pending` | targeted invitee declines | `declined` |
| `pending` | team administrator revokes | `revoked` |
| `pending` | access after `expiresAt` | `expired` |

Expiry is a lazy transition: the next token, code, or targeted-response read
after `expiresAt` writes `expired` and answers `410`. `accepted`, `declined`,
`expired`, and `revoked` are terminal; a repeated response reads as not found
and writes no membership. Link join creates the membership in `pending`;
targeted accept creates it in `active`. Membership transitions live in the
[users](../users/README.md) component.

## Targeted Invitations (invite an existing user)

`generateInvitation` accepts an optional `inviteeUserId` (validated to exist
and not already be a member or hold a pending invitation). Targeted
invitations address exactly one existing user discovered through the
[directory](../directory/README.md) and complete in a **single handshake**:
the team administrator already chose the user, so the invitee's acceptance
creates the **active** membership and the role assignment directly — there
is no second organizational approval round. Declining simply closes the
invitation.

- `listMine(user)` returns the caller's pending targeted invitations
  (`GET /api/invitations/mine`) — the shared `TargetedInvitations` surface
  renders them with accept/decline actions, mounted both in the account
  settings popup (above the memberships section, reachable for members of
  other organizations) and on the orgless organization shell.
- `respondInvitation(id, user, action)` (`POST /api/invitations/:id/respond`)
  accepts or declines; only the addressed user may respond.
- The organization-side listing (`listByOrgForUser`) includes targeted
  invitations with `inviteeUserId`/`inviteeName` and their state, beside the
  copyable link invitations.

## API

Service seam: `generateInvitation`, `listByOrgForUser`, `revokeInvitation`,
`joinByToken`, `joinByCode`, `listMine`, `respondInvitation`.

| Endpoint | Responsibility |
|---|---|
| `POST /api/organizations/:id/invitations` | Generate an invitation (`roleIds`, optional `inviteeUserId` for a targeted one) after team-management authorization. |
| `GET /api/organizations/:id/invitations` | List active organization invitations (team-management). |
| `DELETE /api/organizations/:id/invitations/:invId` | Revoke an invitation (team-management). |
| `GET /api/invitations/:token` | Public sanitized invitation presentation (organization name, resolved role labels). |
| `POST /api/invitations/:token/join` | Accept by token (authenticated). |
| `POST /api/auth/join-org` | Accept by short code (`{ code }`, authenticated). |
| `GET /api/invitations/mine` | The caller's active targeted invitations. |
| `POST /api/invitations/:id/respond` | Accept/decline a targeted invitation (addressed user only). |
