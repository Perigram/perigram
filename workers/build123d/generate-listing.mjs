// Compile the discovered build123d catalog into the plugin listing.
// Generated file: regenerate with
//   python3 discover.py > catalog.json && node generate-listing.mjs
// The listing validates through the SDK's parseListing before it is
// written, so a catalog that cannot register refuses loudly.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseListing } from '@perigram/plugin-sdk/listing';

const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const version = catalog.provenance.version;

const KIND_ICONS = {
  constructor: 'pi pi-box',
  function: 'pi pi-cog',
  operator: 'pi pi-objects-column'
};

// CTS field base per catalog param type: scalars prompt as command
// parameters; shape and json params are graph data sockets.
const FIELD_BASE = {
  number: 'number',
  boolean: 'boolean',
  string: 'string',
  shape: 'json',
  json: 'json'
};

const services = catalog.ops.map(op => ({
  id: op.id,
  label: op.label,
  mode: 'endpoint',
  palette: op.palette,
  cache: 'deterministic',
  render: { label: op.label, icon: KIND_ICONS[op.kind] },
  signature: {
    input: {
      base: 'record',
      fields: Object.fromEntries(op.params.map(param => [
        param.name,
        {
          base: FIELD_BASE[param.type],
          ...(param.required ? {} : { nullable: true }),
          ...('default' in param && FIELD_BASE[param.type] !== 'json'
            ? { default: param.default }
            : {})
        }
      ]))
    },
    output: { base: 'json' }
  }
}));

const listing = {
  pluginId: 'build123d',
  name: 'build123d',
  description: `Parametric B-Rep CAD operations discovered from the installed build123d ${version} API: shape constructors, part/sketch operations, and the shape-algebra operators, as deterministic value services`,
  version: '1',
  declarations: {
    types: [
      {
        id: 'b3d-part',
        class: 'file',
        scope: 'system',
        name: 'Part',
        fields: {
          name: { base: 'string', identifier: true }
        },
        payload: {
          mime: ['application/step', 'model/step'],
          accept: ['.step', '.stp', 'application/step'],
          maxSize: 52428800,
          preview: 'none',
          creation: ['upload']
        },
        revisions: 'content'
      }
    ],
    services
  }
};

parseListing(listing);

writeFileSync(new URL('./listing.json', import.meta.url), JSON.stringify(listing, null, 2) + '\n');
const groups = new Set(catalog.ops.map(op => op.palette.group));
console.log(`listing: ${services.length} services from build123d ${version} across ${groups.size} palette sections (${[...groups].sort().join(', ')})`);
