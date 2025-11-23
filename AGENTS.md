# AGENTS.md

**Purpose:** Instructions for AI agents working on the Cutkit-Demo project.

This file tells you **HOW** to work with this codebase. For **WHAT** the architecture is, see the linked documents.

---

## Quick Reference

- **Architecture Details:** → `/ARCHITECTURE.md`
- **Data Schemas:** → `/docs/specs/data-schema.md`
- **Setup Guide:** → `/ONBOARDING.md`
- **Implementation Plan:** → `/docs/planning/implementation_plan.md`

---

## Core Principles

### 1. Documentation-First Development

**Every code change MUST update relevant documentation in the SAME commit.**

**Documentation locations:**
- Schema changes → Update `/docs/specs/data-schema.md`
- API changes → Update `/ARCHITECTURE.md` API section
- New patterns → Update `/ARCHITECTURE.md` or `/ONBOARDING.md`
- Task completion → Mark `[x]` in `/docs/planning/implementation_plan.md`

**Example commit:**
```
Add user authentication endpoint

- Created POST /api/auth/login endpoint
- Updated ARCHITECTURE.md API section
- Marked task [x] in implementation_plan.md
```

### 2. Minimal Changes Philosophy

- Change **only** what's needed to fix/implement the task
- Don't refactor unrelated code
- Don't fix unrelated bugs unless explicitly asked
- Keep commits focused and small

### 3. Follow Existing Patterns

**Before adding new code, check:**
1. Is there already a similar implementation?
2. What pattern does the existing code use?
3. Can I reuse existing utilities/components?

**Where to look:**
- Service layer pattern → `/server/features/` (any module)
- Component patterns → `/components/` (check existing)
- Store pattern → `/composables/` (check any store file)

---

## Working with This Codebase

### Service Layer Pattern

**All backend logic follows:** `repository.js` → `service.js` → `API endpoint`

**When adding a new feature:**
1. Check `/server/features/` for existing similar modules
2. Copy the pattern from an existing module
3. Create: `repository.js` (DB operations), `service.js` (business logic), `index.js` (exports)
4. Add API endpoint in `/server/api/` that calls service

**Never:**
- Access MongoDB directly from API endpoints
- Put business logic in API handlers
- Skip the service layer

### Frontend Store Pattern

**All stores use:** Readonly reactive pattern

**Template:**
```javascript
// composables/myFeature.js
import { reactive, readonly, computed } from 'vue';

const state = reactive({
  data: null,
  loading: false
});

export const myFeatureStore = readonly({
  getters: {
    data: computed(() => state.data),
    loading: computed(() => state.loading)
  },
  actions: {
    async fetch() {
      state.loading = true;
      state.data = await $fetch('/api/my-endpoint');
      state.loading = false;
    }
  }
});
```

**Never:**
- Mutate state directly from components
- Export mutable state
- Use Vuex/Pinia (we use composables)

### Component Guidelines

**Check first:** Is there an existing component that does something similar?

**Current UI migration:** Custom components → PrimeVue components

**When creating components:**
- Use PrimeVue for new components
- Follow existing file structure in `/components/`
- Use design tokens from `/assets/css/main.css`

---

## Common Tasks

### Adding a New API Endpoint

1. Create service in `/server/features/{module}/service.js`
2. Create endpoint in `/server/api/{resource}/{action}.{method}.js`
3. Use `event.context.auth.userId` for authentication
4. Update `/ARCHITECTURE.md` API section
5. Test with curl or browser

### Client-Side File Parsing

**Pattern:** Parse files in browser before upload (better UX, less server load)

**Example (DXF cassettes):**
```javascript
// Install parser: npm install dxf-parser
// Create utility: /utils/dxfParser.js
import DxfParser from 'dxf-parser';

export async function extractDxfLayers(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parser = new DxfParser();
      const dxf = parser.parseSync(e.target.result);
      const layers = Array.from(new Set(
        dxf.entities.map(e => e.layer)
      )).sort();
      resolve(layers);
    };
    reader.readAsText(file);
  });
}

// Use in component:
const handleFileSelect = async (event) => {
  const file = event.files[0];
  const layers = await extractDxfLayers(file);
  // Show UI immediately, upload with parsed data
};
```

**Benefits:**
- Instant feedback (no server round-trip)
- No worker queues or polling
- Server just stores file + metadata
- Status immediately 'done'

### Adding a New Database Collection

1. Design schema in `/docs/specs/data-schema.md`
2. Create indexes in `/server/db/indexes.js`
3. Add repository in `/server/features/{module}/repository.js`
4. Add service layer
5. Update `/ARCHITECTURE.md` Data Model section

### Fixing Bugs

1. Reproduce the error
2. Find root cause (check server logs, browser console)
3. Make minimal fix
4. Test the fix works
5. Update documentation if schema/API changed
6. Commit with clear description

### Running Tests

```bash
# Backend
node server/scripts/test-endpoint.js

# Frontend
npm run dev  # Manual testing in browser
```

---

## Important Notes

### User IDs are Strings, Not ObjectIds

**⚠️ Critical:** `userId` fields contain OAuth provider IDs like `"google:12345"`, not MongoDB ObjectIds.

**When querying by userId:**
```javascript
// ❌ WRONG
{ userId: new ObjectId(userId) }

// ✅ CORRECT
{ userId: userId }  // Direct string comparison
```

### Collection Names

**⚠️ Legacy:** Some collections use old names:
- `cassettes` (not `cassette_templates`)
- Check `/docs/specs/data-schema.md` for actual collection names

### Authentication Context

All API endpoints get auth from middleware:
```javascript
const userId = event.context?.auth?.userId;
if (!userId) {
  throw createError({ statusCode: 401, message: 'Unauthorized' });
}
```

---

## Workflow

### When Starting Work

1. Read `/docs/planning/implementation_plan.md` for current task
2. Check relevant section in `/ARCHITECTURE.md` or `/ONBOARDING.md`
3. Review similar existing code
4. Implement following existing patterns
5. Update documentation
6. Mark task `[x]` in implementation plan
7. Commit

### When Asked to "Continue"

1. Check implementation plan for next uncompleted `[ ]` task
2. Complete that task
3. Update docs + mark `[x]`
4. Commit
5. Move to next task
6. Repeat until told to stop

### When Finding Inconsistencies

**If documentation conflicts with code:**
1. Check which is correct (usually code is truth)
2. Update documentation to match reality
3. Add note explaining the discrepancy
4. Commit documentation fix

---

## Key Learnings from Real Sessions

### Schema Design
- System templates use `ownerId: null` (not `isSystem: true`)
- Users copy and modify, don't override
- Keep schemas minimal - only add fields when needed
- OAuth provider IDs are strings, not ObjectIds

### Implementation Flow
- Complete cycle: Read task → Implement → Update docs → Mark [x] → Commit
- Don't wait for reviews - user will tell you to stop
- "Continue" means keep working through tasks
- Track progress in implementation_plan.md

### Communication
**User wants:**
- Continuous work until told "stop"
- Autonomous commits without asking
- Calm fixes of mistakes
- Clear knowledge of what's done/what's next

**User gets frustrated when:**
- You stop without being told
- You ask permission for every commit
- You forget what's done
- You write CAPS apology commits

---

## Debugging Tips

- Check server logs in terminal running `npm run dev`
- Check browser console for frontend errors
- Use `curl` to test API endpoints directly
- Check `/server/middleware/auth.js` if auth issues
- Look at similar working code for patterns

---

## Emergency Fixes

### Git Lock Error
```bash
rm -f .git/index.lock
```

### Files Disappeared After `cat >`
```bash
ls -la  # Verify files exist before git add
```

### MongoDB Connection Issues
Check `.env` file has `MONGODB_URI=mongodb://localhost:27017/nest2d`

---

## When in Doubt

1. Read the documentation files first
2. Check existing similar code
3. Ask user for clarification if truly unclear
4. Don't guess - wrong changes waste time

---

**Remember:** This file is guidance for YOU (the AI). All actual architecture, schemas, and details live in other documented files.
