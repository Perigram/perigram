# COMPONENT: Invitations

Manages organization membership invitations.

## Core Files
- `repository.js`: Database operations for `invitations` collection.
- `service.js`: Invitation generation and processing.

## Workflows
1. **Generate**: Create a unique token and short code for organization joining.
2. **Join**: User accepts invitation via token or code, creating a pending membership.

## API / Functions
- `generateInvitation()`: Creates new invitation.
- `joinByToken()`: Process join using secret token.
- `joinByCode()`: Process join using short alphanumeric code.
