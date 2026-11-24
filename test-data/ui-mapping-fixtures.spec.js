import { describe, it, expect } from 'vitest';
import {
  resolveFieldControl,
  resolveActionButton,
  composeScreen,
  buildInstancePool,
  applyBudget,
  titleFor,
  resolveListLayout,
  VARIANTS
} from '#shared/ui-mapping/index.js';
import {
  createUiMappingClientBundle,
  createUiMappingCompiledContract,
  createUiMappingInstances
} from './ui-mapping-fixtures.js';

const bundle = createUiMappingClientBundle();
const contract = createUiMappingCompiledContract();
const instances = createUiMappingInstances();
const pool = buildInstancePool(instances);

describe('hydration four breaks the previous skeleton', () => {
  it('recurses containment and has no single root', () => {
    const folderType = bundle.types.find(type => type.id === 'folder');
    expect(folderType.edges.children.folders.types).toEqual(['folder']);
    const tops = instances.folders.filter(folder => Object.keys(folder.lineage).length === 0);
    expect(tops.length).toBeGreaterThanOrEqual(3);
    const depthOf = (folder, size = 1) => {
      const parent = Object.values(folder.lineage)[0];
      if (!parent) return size;
      return depthOf(pool.folder[parent.id], size + 1);
    };
    expect(Math.max(...instances.folders.map(folder => depthOf(folder)))).toBeGreaterThanOrEqual(6);
  });

  it('keeps items floating with no lineage at all', () => {
    expect(instances.keepers.every(keeper => Object.keys(keeper.lineage).length === 0)).toBe(true);
    expect(instances.keepers).toHaveLength(3);
  });

  it('chains documents through a self-type supersedes ref', () => {
    expect(instances.documents[0].relations.supersedes).toBeNull();
    expect(instances.documents[2].relations.supersedes).toEqual({ type: 'document', id: 'document-2' });
    let chain = 1;
    let cursor = instances.documents[10];
    while (cursor.relations.supersedes) {
      cursor = instances.documents.find(document => document.id === cursor.relations.supersedes.id);
      chain += 1;
    }
    expect(chain).toBeGreaterThanOrEqual(4);
  });

  it('links files many-to-many in both directions', () => {
    const docFour = instances.documents[3];
    const linked = docFour.relations.linkedSheets.map(ref => ref.id);
    for (const sheetId of linked) {
      const sheet = pool.sheet[sheetId];
      expect(sheet.relations.sources.some(ref => ref.id === 'document-4')).toBe(true);
    }
    expect(linked.length).toBe(5);
  });

  it('relates groups to files (folder pins)', () => {
    expect(bundle.types.find(type => type.id === 'folder').edges.relations.pinned.types).toEqual(['document']);
    expect(instances.folders[0].relations.pinned).toHaveLength(2);
  });

  it('makes the process stream the bulk of the data', () => {
    expect(instances.jobs).toHaveLength(14);
    expect(instances.jobs.length).toBeGreaterThan(instances.documents.length);
    const home = composeScreen(contract.screens.home_operator, contract, bundle, pool);
    expect(home.regions.map(region => `${region.typeId}:${region.instances.length}`)).toEqual([
      'watch_job:14', 'document:11'
    ]);
    expect(home.regionsArrangement.wide.mode).toBe('tabs');
    expect(home.regionsArrangement.narrow.mode).toBe('tabs');
  });

  it('composes the deep folder detail with recursive subfolders and documents', () => {
    const composed = composeScreen(contract.screens.auto_operator_folder_detail, contract, bundle, pool);
    const main = composed.regions[0];
    expect(main.instances[0].id).toBe('folder-a1ai');
    const childKinds = main.childRegions.map(child => `${child.typeId}:${child.instances.length}`);
    expect(childKinds).toEqual(['folder:1', 'document:4']);
    expect(main.childRegions[0].instances[0].id).toBe('folder-a1aialpha');
    expect(main.childRegions[1].instances.every(document => document.lineage.documents?.id === 'folder-a1ai')).toBe(true);
    // Class screens stay flat by contract: a folder type (containment
    // edges and all) resolves the plain columnar table — hierarchy is
    // navigation (the workspace explorer), never a class projection.
    expect(resolveListLayout(bundle.types.find(type => type.id === 'folder'))).toBe('table');
  });

  it('composes document, sheet, and job details from relation scopes', () => {
    const doc = composeScreen(contract.screens.auto_operator_document_detail, contract, bundle, pool);
    expect(doc.regions[0].instances[0].id).toBe('document-4');
    expect(doc.regions[0].childRegions.map(child => `${child.typeId}:${child.instances.length}`)).toEqual([
      'sheet:5', 'watch_job:14'
    ]);
    const sheet = composeScreen(contract.screens.auto_operator_sheet_detail, contract, bundle, pool);
    expect(sheet.regions[0].childRegions[0].instances.length).toBeGreaterThanOrEqual(1);
    const job = composeScreen(contract.screens.auto_operator_job_detail, contract, bundle, pool);
    expect(job.regions[0].instances[0].id).toBe('job-3');
    expect(job.regions[0].childRegions[0].typeId).toBe('document');
  });

  it('covers every declarable class and field base with a different distribution', () => {
    const classes = new Set(bundle.types.map(type => type.class));
    expect([...classes].sort()).toEqual(['file', 'group', 'item', 'process']);
    const bases = new Set(bundle.types.flatMap(type => Object.values(type.fields).map(descriptor => descriptor.base)));
    for (const base of ['string', 'number', 'boolean', 'instant', 'json', 'blob', 'ref', 'quantity', 'record', 'list', 'map', 'variant', 'enum']) {
      expect(bases.has(base), base).toBe(true);
    }
    const files = bundle.types.filter(type => type.class === 'file');
    expect(files.map(type => type.payload.preview)).toEqual(['image', 'geometry']);
  });

  it('resolves every fixture field descriptor in every variant', () => {
    for (const type of bundle.types) {
      for (const [name, descriptor] of Object.entries(type.fields)) {
        for (const variant of VARIANTS) {
          const outcome = resolveFieldControl(descriptor, { variant });
          expect(outcome.component, `${type.id}.${name}/${variant}`).toBeTruthy();
        }
      }
    }
  });

  it('resolves every compiled action with the CTS vocabulary', () => {
    const outcomes = Object.fromEntries(
      Object.values(contract.actions).map(action => [action.id, resolveActionButton(action, { statePolicy: contract.statePolicy.watch_job })])
    );
    expect(outcomes.doc_create).toMatchObject({ tone: 'primary' });
    expect(outcomes.doc_delete).toMatchObject({ tone: 'danger', confirm: true });
    expect(outcomes.job_start).toMatchObject({ tone: 'state', severity: 'info' });
    expect(outcomes.job_abort.severity).toBe('danger');
    expect(outcomes.job_auto_recheck.hidden).toBe(true);
    expect(outcomes.sheet_link).toMatchObject({ tone: 'text', icon: 'pi pi-link' });
  });

  it('resolves declared identities and variable link cardinality', () => {
    expect(titleFor(pool.folder['folder-a1aialpha'], bundle.types.find(type => type.id === 'folder'))).toBe('Sleeve A1a-i-α');
    expect(titleFor(pool.keeper['keeper-3'], bundle.types.find(type => type.id === 'keeper'))).toBe('KPR-03');
    const counts = instances.documents.map(document => document.relations.linkedSheets.length);
    expect(new Set(counts).size).toBeGreaterThan(3);
    const budget = { max: 2, overflow: 'count' };
    expect(instances.documents.map(document => applyBudget(document.relations.linkedSheets, budget).hidden)).toContain(3);
  });

  it('keeps the showcase default screen key present in the contract', () => {
    expect(contract.screens.auto_operator_document_detail?.screenKey).toBe('auto_operator_document_detail');
  });
});
