# Module Template

This is a template for creating new feature modules.

## Structure

```
module-name/
├── repository.js  # Database operations only
├── service.js     # Business logic + validation
└── index.js       # Exported interface
```

## Usage

1. Copy this directory: `cp -r _template/ your-module-name/`
2. Update `COLLECTION` constant in `repository.js`
3. Customize validation logic in `service.js`
4. Export module in `index.js`

## Pattern Rules

**Repository Layer:**
- Only database operations
- No business logic
- No validation
- No error handling (except DB errors)

**Service Layer:**
- All business logic
- All validation
- Ownership checks
- Error handling with createError()
- Never accesses DB directly - only through repository

**API Handlers:**
- Thin wrappers around service calls
- Extract userId from event.context.auth
- Handle request/response formatting

## Example API Handler

```javascript
// server/api/items/index.get.js
import { service } from '~/server/features/items';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  
  // Get both system and user items
  const [systemItems, userItems] = await Promise.all([
    service.listSystem(),
    service.listForUser(userId)
  ]);
  
  return [...systemItems, ...userItems];
});
```
