import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_DIRS = ['components', 'pages', 'layouts', 'stores', 'composables', 'utils'];
const LOCALE_FILES = {
  en: 'i18n/locales/en.json',
  ru: 'i18n/locales/ru.json'
};

function flattenLocale(value, prefix = '', out = {}) {
  for (const [key, entry] of Object.entries(value || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenLocale(entry, path, out);
    } else {
      out[path] = entry;
    }
  }
  return out;
}

function listSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(fullPath, out);
    } else if (/\.(vue|js|ts)$/.test(entry.name) && !/\.spec\.(js|ts)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectStaticI18nKeys() {
  const keys = new Map();

  for (const file of SOURCE_DIRS.flatMap(dir => listSourceFiles(dir))) {
    const source = readFileSync(file, 'utf8');
    const staticCallPattern = /(?:\$t|(?<![\w$])t)\(\s*(['"])([A-Za-z0-9_.-]+)\1/g;

    for (const match of source.matchAll(staticCallPattern)) {
      const key = match[2];
      if (!keys.has(key)) keys.set(key, []);
      keys.get(key).push(`${relative(process.cwd(), file)}:${lineNumber(source, match.index)}`);
    }
  }

  return keys;
}

const locales = Object.fromEntries(
  Object.entries(LOCALE_FILES).map(([locale, file]) => [
    locale,
    flattenLocale(JSON.parse(readFileSync(file, 'utf8')))
  ])
);

describe('Localization contract', () => {
  it('keeps locale dictionaries structurally aligned', () => {
    const allKeys = new Set(Object.values(locales).flatMap(locale => Object.keys(locale)));
    const missingByLocale = Object.fromEntries(
      Object.entries(locales).map(([locale, keys]) => [
        locale,
        [...allKeys].filter(key => !Object.hasOwn(keys, key)).sort()
      ])
    );

    expect(missingByLocale).toEqual({ en: [], ru: [] });
  });

  it('defines every static translation key used by frontend source', () => {
    const missing = [];

    for (const [key, refs] of collectStaticI18nKeys()) {
      const missingLocales = Object.entries(locales)
        .filter(([, keys]) => !Object.hasOwn(keys, key))
        .map(([locale]) => locale);

      if (missingLocales.length) {
        missing.push({ key, missingLocales, refs });
      }
    }

    expect(missing).toEqual([]);
  });

  it('covers known dynamic translation key families', () => {
    const dynamicKeys = [
      'auth.membership.approve',
      'auth.membership.reject',
      'cassette.rootDim',
      'cassette.faceDepth',
      'cassette.flangeDepth',
      'cassette.custom',
      'roles.ManufacturerAdmin',
      'roles.ContractorAdmin',
      'roles.CustomerAdmin',
      'roles.IndividualAdmin',
      'roles.IndividualUser',
      'uiLab.statusPolicy.interactive',
      'uiLab.statusPolicy.hidden',
      'uiLab.statusPolicy.readonly'
    ];

    const missing = dynamicKeys.flatMap(key => (
      Object.entries(locales)
        .filter(([, keys]) => !Object.hasOwn(keys, key))
        .map(([locale]) => ({ key, locale }))
    ));

    expect(missing).toEqual([]);
  });
});
