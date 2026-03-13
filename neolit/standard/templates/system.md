# SYSTEM Level Template

**Location:** Project root (`README.md`)

**Size:** 60-100 lines

**Use:** Every project (always)

---

## Template

````markdown
# Project Name

**Level:** SYSTEM

## Overview
Brief description of system (2-3 sentences: what it does, why it exists)

## Architecture
- Design pattern: Microservices / Monolith / etc
- Technology stack: Node.js, PostgreSQL, Redis, etc
- Deployment: Docker, Kubernetes, etc

## Containers (if multi-deployable)
- **[API Server](api/README.md)** - REST API (deployable unit)
- **[Worker](worker/README.md)** - Background jobs (deployable unit)
- **[Frontend](frontend/README.md)** - Web application (deployable unit)

## Components (if single deployable)
- **[Auth](src/auth/README.md)** - Authentication and authorization
- **[User](src/user/README.md)** - User management
- **[Payment](src/payment/README.md)** - Payment processing

## Data Flow
```
Client → API → Business Logic → Database
       ↓
    Worker → External Services
```

## Workflows

### User Registration
1. Submit form → [Auth Component](src/auth/README.md)
2. Validate credentials → Database
3. Store user → [Database Component](src/database/README.md)
4. Send welcome email → [Worker](worker/README.md) (if applicable)

### Payment Processing
1. Submit payment → [Payment Component](src/payment/README.md)
2. Validate → Payment gateway
3. Update order → Database
4. Send confirmation → User

[2-3 key workflows showing how components interact]

## Global Constraints

**MUST:**
- Use TypeScript strict mode
- Handle all errors gracefully
- Validate all user inputs
- Log all authentication attempts

**MUST NOT:**
- Expose internal database IDs
- Store plaintext passwords
- Skip input validation
- Ignore error conditions

## For AI Agents
Entry point: `neolit/prompts/BASE.md`
````

---

## Required Sections

1. **Overview** - What and why (2-3 sentences)
2. **Architecture** - High-level design, tech stack
3. **Containers OR Components** - List with links (use Containers for multi-deployable, Components for single)
4. **Data Flow** - Visual representation
5. **Workflows** - 2-3 key workflows
6. **Global Constraints** - Project-wide MUST/MUST NOT
