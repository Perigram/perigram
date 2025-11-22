# Nesting Platform Onboarding
_Get up and running in 10 minutes_

---

## Quick Start

**1. Prerequisites:**
```bash
node -v  # v18+
npm -v   # v9+
```

**2. Clone & Install:**
```bash
git clone <repo-url>
cd cutkit-demo
npm install
```

**3. Configure Database:**
```bash
# Create .env
MONGODB_URI=mongodb://localhost:27017/nest2d-v2
```

**4. Seed System Data:**
```bash
node server/scripts/seed-all.js
```

**5. Start Dev Server:**
```bash
npm run dev
```

Open http://localhost:3000

---

## Project Structure

```
/server/
  /features/          # Backend modules (repository → service pattern)
    /layer-standards/ # Parametric layer templates
    /pen-templates/   # Display styles
    /tool-profiles/   # CNC tool library
    /cassettes/       # Template management
    /batches/         # Production runs
    /artifacts/       # Generated outputs
  /api/               # Nuxt API routes (thin wrappers)
  /db/                # Database utilities
  /scripts/           # Seeding scripts

/docs/
  /specs/             # Data schemas
  /planning/          # Implementation roadmap
  
ARCHITECTURE.md       # System design patterns
AGENTS.md            # AI agent instructions
```

---

## Common Tasks

### Add a New Module

**1. Copy template:**
```bash
cp -r server/features/_template/ server/features/your-module/
```

**2. Update `repository.js`:**
```javascript
const COLLECTION = 'your_collection';
```

**3. Customize `service.js`:**
- Add validation logic
- Add business rules
- Never access DB directly (use repository)

**4. Create API endpoints:**
```javascript
// server/api/your-module/index.get.js
import { service } from '~/server/features/your-module';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  return await service.listForUser(userId);
});
```

### Work with Layer Standards

**Generate layer name from template:**
```javascript
import { service } from '~/server/features/layer-standards';

const standard = await service.getByCode('2_1_CUT');
// standard.i18n.ru.nameTemplate = "Обрезь_{diameter}"
// standard.parameters = ["diameter"]

const layerName = service.generateLayerName(
  standard, 
  { diameter: 3.15 }, 
  'ru'
);
// Result: "2_1_CUT_Обрезь_3,15"
```

### Create User Templates

**Create custom pen:**
```javascript
const pen = await $fetch('/api/templates/pens', {
  method: 'POST',
  body: {
    name: "My Red Pen",
    stroke: {
      color: "#FF0000",
      weight: 0.5,
      pattern: "SOLID"
    }
  }
});
```

**Create custom tool:**
```javascript
const tool = await $fetch('/api/templates/tools', {
  method: 'POST',
  body: {
    name: "My Custom Mill",
    diameter: 4.5,
    angle: 0
  }
});
```

### Create Batch

**1. Get cassette templates:**
```javascript
const cassettes = await $fetch('/api/cassettes');
```

**2. Create batch:**
```javascript
const batch = await $fetch('/api/project/my-project/batches', {
  method: 'POST',
  body: {
    name: "Production Batch #1",
    entries: [
      {
        entryId: "A",
        cassetteTemplateId: cassette1._id,
        quantity: 10
      },
      {
        entryId: "B",
        cassetteTemplateId: cassette2._id,
        quantity: 5
      }
    ]
  }
});
```

---

## Database Operations

### Create Indexes

```bash
node server/db/indexes.js create
```

### List Indexes

```bash
node server/db/indexes.js list batches
```

### Reset System Data

```bash
# MongoDB shell
use nest2d-v2;
db.layer_standards.deleteMany({ownerId: null});
db.pen_templates.deleteMany({ownerId: null});
db.tool_profiles.deleteMany({ownerId: null});

# Re-seed
node server/scripts/seed-all.js
```

---

## Code Patterns

### Repository Pattern (DB Only)

```javascript
// ✅ DO: Simple DB operations
export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

// ❌ DON'T: Business logic in repository
export async function findById(id) {
  const db = await connectDB();
  const item = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!item) throw new Error('Not found'); // ❌ This belongs in service
  return item;
}
```

### Service Pattern (Business Logic)

```javascript
// ✅ DO: Validation and business rules
export async function create(data, userId) {
  // Validate
  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name required' });
  }
  
  // Business logic
  const itemData = {
    ...data,
    ownerId: userId ? new ObjectId(userId) : null
  };
  
  // Call repository
  return await repository.create(itemData);
}

// ❌ DON'T: Direct DB access
export async function create(data) {
  const db = await connectDB(); // ❌ Never access DB in service
  return await db.collection('items').insertOne(data);
}
```

### API Pattern (Thin Wrapper)

```javascript
// ✅ DO: Extract auth, call service
export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const body = await readBody(event);
  return await service.create(body, userId);
});

// ❌ DON'T: Business logic in API
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body.name) throw createError(...); // ❌ Validation belongs in service
  return await service.create(body);
});
```

---

## Troubleshooting

**MongoDB connection failed:**
- Check `MONGODB_URI` in `.env`
- Ensure MongoDB is running: `sudo systemctl status mongod`

**Import errors:**
- Use `~~/server/` for server imports
- Use `~/` for universal imports

**Validation errors:**
- Check service layer for validation rules
- See error messages in console

**Seed scripts fail:**
- Check if data already exists (scripts prevent duplicates)
- Drop collections and re-run

---

## Next Steps

1. Review `/docs/specs/data-schema.md` for entity schemas
2. Read `/ARCHITECTURE.md` for design patterns
3. Check `/docs/planning/implementation_plan.md` for roadmap
4. See `/docs/STATUS_2025-11-22.md` for current progress

**Ready to code!** Follow patterns from existing modules.
