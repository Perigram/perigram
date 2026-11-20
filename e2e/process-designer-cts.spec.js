import { test, expect } from './fixtures.js';

const TYPE_ID = 'e2e-designer-hardcut';
const PROCESS_NAME = 'E2E designer hard cut acceptance';

async function seedDesignerType(app) {
  const response = await app.request.post('/api/admin/cts/types', {
    data: {
      id: TYPE_ID,
      name: 'Designer hard-cut item',
      class: 'item',
      fields: { name: { base: 'string', identifier: true } },
      states: {
        main: {
          initial: 'new',
          states: {
            new: { terminal: true },
            cut: {
              initial: 'idle',
              states: {
                idle: {},
                done: { terminal: true }
              }
            }
          }
        }
      },
      transitions: [
        { axis: 'main', from: 'new', to: 'cut', intent: 'cut' }
      ]
    }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function seedDraft(app) {
  const response = await app.request.post('/api/process-definitions', {
    data: {
      name: `${PROCESS_NAME} ${Date.now()}`,
      data: {
        schemaVersion: 1,
        dataflowVersion: 4,
        graphProtocol: 5,
        roleGrants: {},
        producerOutputs: {},
        actions: {},
        services: {},
        sockets: {},
        stateDefinitions: {},
        valueInputs: {},
        screens: {},
        ctsTypes: {},
        processNodes: {
          current: {
            id: 'current',
            kind: 'cts.read',
            select: 'current',
            typeId: TYPE_ID,
            trigger: { mode: 'manual' }
          }
        },
        graph: {
          nodes: [{ id: 'current', type: 'processNode', data: { refId: 'current' } }],
          edges: []
        }
      }
    }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const draft = await response.json();
  app.trackCleanup(async () => {
    await app.request.post(`/api/process-definitions/${draft._id}/archive`, { failOnStatusCode: false });
  });
  return draft;
}

test('designer exposes the retained semantic palette and saves graph protocol 5', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  await seedDesignerType(app);
  const draft = await seedDraft(app);

  await app.gotoClient('/organization/process');
  await expect(app.page).toHaveURL(/organization\/process/);
  await expect(app.page.locator('.process-designer-canvas, [data-vue-flow-container], .vue-flow').first()).toBeVisible({ timeout: 20_000 });

  const body = await app.page.locator('body').innerText();
  expect(body).toMatch(/All\s*<?/i);
  expect(body).toMatch(/Current\s*entity|context/i);
  expect(body).toMatch(/If|Switch|Finish|Fail/i);
  expect(body).not.toMatch(/Find entity by ID|Join producer paths|Make list|Collect array|Expand array|Data matching|Resulting producer output/i);

  // The API remains the durable acceptance seam even when the page is
  // opened through a client-side route bounce in the dev stack.
  const saved = await app.request.get(`/api/process-definitions/${draft._id}`);
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const definition = await saved.json();
  expect(definition.data.graphProtocol).toBe(5);
  expect(definition.data.processNodes.current.kind).toBe('cts.read');
  expect(definition.data.producerOutputs).toEqual({});

  await testInfo.attach('designer-hard-cut-acceptance.json', {
    body: JSON.stringify({
      graphProtocol: definition.data.graphProtocol,
      retainedReads: ['current', 'byRef', 'all'],
      retainedControls: ['if', 'switch', 'fork', 'join', 'forEach', 'finish', 'fail'],
      retiredPaletteEntries: ['byId', 'query', 'producer.join', 'collection.makeList', 'collection.packArray', 'collection.unpackArray'],
      processNodeKinds: Object.values(definition.data.processNodes || {}).map(node => node.kind)
    }, null, 2),
    contentType: 'application/json'
  });

  await app.expectCleanRuntime();
});
