import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NodeTypes, parse as parseVueTemplate } from '@vue/compiler-dom';
import { parse as parseVueSfc } from '@vue/compiler-sfc';

const SOURCE_DIRS = ['components', 'pages', 'layouts', 'stores', 'composables', 'utils'];
const LOCALE_FILES = {
  en: 'i18n/locales/en.json',
  ru: 'i18n/locales/ru.json'
};
const VISIBLE_LITERAL_ATTRS = new Set(['label', 'placeholder', 'title', 'aria-label', 'header', 'message']);
const VISIBLE_VALUE_COMPONENTS = new Set(['Badge', 'Chip', 'Tag']);
const ALLOWED_VISIBLE_LITERALS = new Set(['CutKit', 'DXF', 'SVG', 'PDF', 'OCCS', 'JSON', 'CSV', 'RU', 'EN']);

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

function extractVueTemplate(source) {
  return parseVueSfc(source).descriptor.template?.content || '';
}

function isVisibleLiteral(value) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (!/[A-Za-zА-Яа-я]/.test(text)) return false;
  if (ALLOWED_VISIBLE_LITERALS.has(text)) return false;
  if (/^\(?[a-zA-Z²³%]+\)?$/.test(text)) return false;
  if (/^[\w./-]+\.(js|ts|vue|json|md)$/.test(text)) return false;
  if (/^[A-Z0-9_\s-]+$/.test(text)) return false;
  return true;
}

function collectHardcodedVueCopy() {
  const offenders = [];
  const sourceFiles = ['components', 'pages', 'layouts']
    .flatMap(dir => listSourceFiles(dir))
    .filter(file => file.endsWith('.vue'));

  function visit(node, file, source) {
    if (node.type === NodeTypes.TEXT && isVisibleLiteral(node.content)) {
      const offset = node.loc?.start?.offset || 0;
      offenders.push({
        file: relative(process.cwd(), file),
        line: lineNumber(source, offset),
        text: node.content.replace(/\s+/g, ' ').trim()
      });
    }

    if (node.type === NodeTypes.ELEMENT) {
      for (const prop of node.props || []) {
        if (prop.type !== NodeTypes.ATTRIBUTE || !prop.value) continue;
        const isVisibleAttr = VISIBLE_LITERAL_ATTRS.has(prop.name) ||
          (prop.name === 'value' && VISIBLE_VALUE_COMPONENTS.has(node.tag));
        if (!isVisibleAttr || !isVisibleLiteral(prop.value.content)) continue;

        const offset = prop.loc?.start?.offset || node.loc?.start?.offset || 0;
        offenders.push({
          file: relative(process.cwd(), file),
          line: lineNumber(source, offset),
          text: `${node.tag} ${prop.name}="${prop.value.content}"`
        });
      }
    }

    for (const child of node.children || []) {
      visit(child, file, source);
    }
  }

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    const template = extractVueTemplate(source);
    if (!template) continue;

    const ast = parseVueTemplate(template, { comments: false });
    visit(ast, file, source);
  }

  return offenders;
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

  it('does not leave static Vue template copy outside i18n', () => {
    expect(collectHardcodedVueCopy()).toEqual([]);
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
