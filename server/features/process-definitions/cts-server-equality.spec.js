// Live-server equality gate: compiles the real active process definition
// through the production runtime (CTS-projected domain) and through the
// legacy hand-authored domain, and requires byte-identical contracts.
// Skipped unless a Mongo URI is provided:
//   NUXT_MONGODB_URI=mongodb://localhost:27017/cutkit_dev npx vitest run server/features/process-definitions/cts-server-equality.spec.js
import { describe, it, expect } from 'vitest';
import { compileProcessDefinition } from '../../../packages/processes/src/index.js';
import { cncDomain } from '../../../packages/domain-cnc/src/index.js';
import { createTypeRegistry, convertCncDomain, projectDomainFromView } from '../../../packages/cts/src/index.js';

const hasDb = Boolean(process.env.NUXT_MONGODB_URI || process.env.MONGODB_URI);

describe.skipIf(!hasDb)('active runtime compiles identically through the CTS projection (live)', () => {
  it('every active process definition byte-matches the legacy compile', { timeout: 60000 }, async () => {
    const { default: repository } = await import('./repository.js');
    const { compileActiveProcessRuntime } = await import('./runtime.js');
    const { connectDB } = await import('../../db/mongo.js');

    const db = await connectDB();
    try {
      const activeDocs = await db.collection('process_definitions')
        .find({ 'status.state.primary': 'ACTIVE' })
        .limit(10)
        .toArray();
      expect(activeDocs.length).toBeGreaterThan(0);

      const registry = createTypeRegistry({ id: 'equality' });
      for (const declaration of convertCncDomain({ entities: cncDomain.entities, workflows: cncDomain.workflows, containment: cncDomain.containment })) {
        registry.defineType(declaration);
      }

      const { migrateProducerOutputIdentities } = await import('../../../packages/processes/src/index.js');
      const strip = compiled => {
        const copy = structuredClone(compiled);
        delete copy.activatedAt;
        return copy;
      };
      // legacy pipeline: same migration step the runtime always ran, then
      // compile against the hand-authored domain
      const legacyRuntime = data => {
        const migration = migrateProducerOutputIdentities(structuredClone(data), cncDomain);
        if (migration.errors.length) throw new Error(migration.errors.join('; '));
        return compileProcessDefinition({ ...migration.data, compiled: null }, cncDomain, { roles: {} });
      };

      for (const doc of activeDocs) {
        const organizationId = doc.lineage?.organizationId?.toString() || null;
        let legacy;
        let legacyError = null;
        try { legacy = strip(legacyRuntime(doc.data)); } catch (error) { legacyError = error.message; }
        let projected;
        let projectedError = null;
        try { projected = strip(await compileActiveProcessRuntime(structuredClone(doc.data), {}, organizationId)); } catch (error) { projectedError = error.message; }
        if (legacyError !== null || projectedError !== null) {
          expect(projectedError, `active def ${doc._id}`).toBe(legacyError);
          continue;
        }
        expect(projected, `active def ${doc._id}`).toEqual(legacy);
      }
    } finally {
      // the shared client is owned by the mongo module; no teardown here
    }
  });
});
