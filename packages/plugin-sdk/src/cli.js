#!/usr/bin/env node
// The perigram-plugin CLI: the whole plugin authoring loop as commands —
// validate and run the executor locally, then publish, install, connect,
// and test against a running platform. Configuration is explicit:
//
//   PERIGRAM_APP              platform base URL (default http://localhost:3000)
//   PERIGRAM_OPERATOR_TOKEN   platform operator token (publish)
//   PERIGRAM_TOKEN            user access token (install/connector/connect/test)
//   PERIGRAM_ORG_ID           organization for org-scoped commands
//
// A services module is any ESM file exporting `services` (or a default):
// `{ '<serviceId>': async input => output }`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseListing } from './listing.js';
import { createEndpointExecutor } from './endpoint-executor.js';
import { runClaimExecutor } from './claim-executor.js';
import { createPluginClient } from './api-client.js';
import { checkSurfaceModule } from './surface-check.js';
import { vendorDependencies } from './vendor.js';

const APP = process.env.PERIGRAM_APP || 'http://localhost:3000';

const commands = {
  surfaces: async args => {
    const listingPath = flag(args, '--listing');
    const options = {};
    if (listingPath) {
      const listing = readListing(listingPath);
      options.dependencies = parseListing(listing).dependencies;
      options.pluginRoot = dirname(resolve(listingPath));
    }
    const ok = await checkSurfaceModule(requireArg(args, 'surface module path'), options);
    if (ok) process.stdout.write('surface module OK — import graph clean, factory returns a component\n');
  },

  vendor: async args => {
    const listingPath = flag(args, '--listing');
    const entry = flag(args, '--entry')
      || (listingPath ? resolve(dirname(resolve(listingPath)), 'surfaces') : null);
    if (!entry) {
      throw new Error('vendor needs --entry <dir|file>, or --listing listing.json (entry defaults to the plugin\'s surfaces/)');
    }
    const { bundled, manifest, leftovers } = await vendorDependencies({
      pluginRoot: listingPath ? dirname(resolve(listingPath)) : process.cwd(),
      entry,
      listingPath
    });
    if (!bundled.length) {
      process.stdout.write('no bare imports to vendor — the graph is already self-contained\n');
      return;
    }
    for (const name of bundled) {
      const entryOf = manifest.find(item => item.name === name);
      process.stdout.write(`vendored ${name}@${entryOf.version} (${entryOf.license}) → ${entryOf.module}\n`);
    }
    if (listingPath) process.stdout.write(`dependencies merged into ${resolve(listingPath)}\n`);
    if (leftovers.length) {
      process.stdout.write(`not vendorable (no resolvable package): ${leftovers.join(', ')}\n`);
    }
  },

  login: async args => {
    const [emailFlag, passwordFlag] = pickFlags(args, ['--email', '--password']);
    const client = createPluginClient({ appUrl: APP });
    const token = await client.login({ email: emailFlag, password: passwordFlag });
    process.stdout.write(`${token}\n`);
  },

  validate: async args => {
    const listing = readListing(requireArg(args, 'listing.json path'));
    const layer = parseListing(listing);
    const counts = [
      `${layer.types.length} type(s)`,
      `${layer.services.length} service(s)`,
      `${layer.editors.length} editor binding(s)`,
      `${Object.keys(layer.attachmentKinds).length} attachment kind(s)`,
      `${layer.conversions.length} conversion(s)`,
      layer.requires.length ? `requires: ${layer.requires.join(', ')}` : null
    ].filter(Boolean);
    process.stdout.write(`OK ${layer.pluginId} v${String(listing.version || '1')} — ${counts.join(', ')}\n`);
  },

  dev: async args => {
    const { services } = await loadServices(requireArg(args, 'services module path'));
    const port = Number(flag(args, '--port') || 8787);
    const token = flag(args, '--token') || null;
    const server = createEndpointExecutor({ services, token }).listen(port);
    await new Promise(resolve => server.once('listening', resolve));
    const served = Object.keys(services).map(id => `  POST http://localhost:${port}/${id}`).join('\n');
    process.stdout.write(`endpoint executor on :${port}\n${served}\n`);
    await waitForever();
  },

  run: async args => {
    const { services } = await loadServices(requireArg(args, 'services module path'));
    await runClaimExecutor({
      appUrl: flag(args, '--app') || APP,
      token: requireFlag(args, '--token', 'connector token'),
      workerId: flag(args, '--worker-id') || `executor-${process.pid}`,
      services,
      onLog: message => process.stdout.write(`${message}\n`)
    });
  },

  publish: async args => {
    const listing = readListing(requireArg(args, 'listing.json path'));
    const client = createPluginClient({
      appUrl: APP,
      operatorToken: process.env.PERIGRAM_OPERATOR_TOKEN
    });
    const published = await client.publish(listing);
    process.stdout.write(`published ${published.pluginId} v${published.version} (${published.types.length} type(s), ${published.services.length} service(s))\n`);
  },

  install: async args => {
    const client = orgClient();
    const installed = await client.install(requireArg(args, 'pluginId'));
    process.stdout.write(formatJson(installed));
  },

  connector: async args => {
    const client = orgClient();
    const info = await client.connector(requireArg(args, 'pluginId'));
    process.stdout.write(formatJson(info));
  },

  connect: async args => {
    const client = orgClient();
    const pluginId = requireArg(args, 'pluginId');
    const key = flag(args, '--key');
    const sets = flagSets(args, '--set');
    const surfaceOrigin = flag(args, '--surface-origin');
    if (sets.length || key !== null || surfaceOrigin !== null) {
      const endpoints = {};
      for (const [serviceId, url] of sets) endpoints[serviceId] = url;
      const saved = await client.saveSettings(pluginId, {
        endpoints,
        authToken: key,
        ...(surfaceOrigin !== null ? { surfaceOrigin } : {})
      });
      process.stdout.write(formatJson(saved));
    } else {
      process.stdout.write(formatJson(await client.settings(pluginId)));
    }
  },

  test: async args => {
    const client = orgClient();
    const pluginId = requireArg(args, 'pluginId');
    const serviceId = requireArg(args, 'serviceId');
    const inputPath = flag(args, '--input');
    const input = inputPath ? JSON.parse(readFileSync(inputPath, 'utf8')) : null;
    const result = await client.invoke(pluginId, serviceId, input);
    process.stdout.write(formatJson(result));
  }
};

const usage = `perigram-plugin — author Perigram plugins (SDK: @perigram/plugin-sdk)

  login --email E --password P        print an access token (save as PERIGRAM_TOKEN)
  validate <listing.json>             validate the listing locally
  dev <services.mjs> [--port N] [--token K]   run the endpoint executor locally
  run <services.mjs> --token <connector token> [--app URL] [--worker-id ID]
                                      poll the claim protocol and execute runs
  publish <listing.json>              publish to the catalog (PERIGRAM_OPERATOR_TOKEN)
  install <pluginId>                  install into PERIGRAM_ORG_ID
  connector <pluginId>                connector panel: token, queue, endpoints
  connect <pluginId> [--set svc=URL ...] [--key K]   read/save connection settings
  test <pluginId> <serviceId> [--input file.json]   invoke an installed service
  surfaces <module.mjs>               check a surface module: clean import
                                      graph (host externals are injected),
                                      factory shape, stub-context smoke

env: PERIGRAM_APP, PERIGRAM_OPERATOR_TOKEN, PERIGRAM_TOKEN, PERIGRAM_ORG_ID`;

const [command, ...rest] = process.argv.slice(2);
try {
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(`${usage}\n`);
  } else if (!commands[command]) {
    throw new Error(`unknown command ${JSON.stringify(command)}`);
  } else {
    await commands[command](rest);
  }
} catch (error) {
  process.stderr.write(`error: ${error?.message || error}\n`);
  process.exit(1);
}

function orgClient() {
  return createPluginClient({
    appUrl: APP,
    token: process.env.PERIGRAM_TOKEN,
    organizationId: process.env.PERIGRAM_ORG_ID
  });
}

function readListing(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function loadServices(path) {
  const module = await import(pathToFileURL(path).href);
  const services = module.services || module.default;
  if (!services || typeof services !== 'object') {
    throw new Error(`${path} must export \`services\` (or a default): { '<serviceId>': async input => output }`);
  }
  return { services };
}

function requireArg(args, what) {
  const value = args.find(arg => !arg.startsWith('--'));
  if (!value) throw new Error(`missing ${what}`);
  return value;
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function requireFlag(args, name, what) {
  const value = flag(args, name);
  if (!value) throw new Error(`missing ${what} (${name})`);
  return value;
}

function pickFlags(args, names) {
  return names.map(name => flag(args, name));
}

function flagSets(args, name) {
  const sets = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      const [key, value] = String(args[index + 1] || '').split('=');
      if (!key || !value) throw new Error(`${name} expects serviceId=URL`);
      sets.push([key, value]);
      index += 1;
    }
  }
  return sets;
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function waitForever() {
  return new Promise(() => {});
}
