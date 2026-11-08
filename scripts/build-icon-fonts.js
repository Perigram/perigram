/**
 * Builds the app's icon fonts from SVG sources and syncs each generated
 * CSS block into assets/css/main.css.
 *
 * Families (one font, one class base, one marker block each):
 *   ck-entity-icons     public/icons/data-model/cnc-domain   — hand-drawn
 *                      CNC domain glyphs (the owner's authored assets)
 *   ck-file-type-icons  public/icons/file-types              — the CTS file
 *                      types' glyphs (Google Material Symbols Outlined,
 *                      Apache-2.0; the style icons8 ships as "Material
 *                      Outlined". SVG is a paid format on icons8's CDN, so
 *                      the upstream Google sources are vendored instead)
 *
 * Fonts:  public/fonts/<dir>/<font>.{woff2,ttf}
 * CSS:    rewrites the block between the `<font>:start` and `<font>:end`
 *         markers in assets/css/main.css, so icon codepoints never drift
 *         from the class definitions.
 * Palette: rewrites the marker block in shared/icon-fonts.js — every
 *         glyph class string the families offer, the authoring palette
 *         consumed by the declaration glyph row.
 *
 * Metrics are tuned to match PrimeIcons optically: PrimeIcons glyphs fill
 * ~100% of the em box and extend into the descent, while 24-grid sources
 * keep live-area padding. --descent 158 aligns the live-area bottom with
 * PrimeIcons' baseline overshoot, and each family's base class scales
 * glyphs by 1/live-area-fill (see FAMILIES) so every set renders at the
 * same size at the same font-size. The scale rides `transform`, not
 * `font-size`: the glyph keeps a 1em advance like a PrimeIcon, so
 * fixed-size icon boxes (Avatar pins `.p-avatar-icon` at 1em) center it
 * instead of clipping a wider-than-box advance.
 *
 * Run: `npm run icons:build` after adding or editing source SVGs.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CSS_FILE = join(ROOT, 'assets/css/main.css');
const PALETTE_FILE = join(ROOT, 'shared/icon-fonts.js');
const PALETTE_START = '/* icon-fonts:start */';
const PALETTE_END = '/* icon-fonts:end */';
const PRIMEICON_DIR = join(ROOT, 'node_modules/primeicons/raw-svg');
const PRIMEICON_FILE = join(ROOT, 'shared/primeicons.js');
const PRIMEICON_START = '/* primeicons:start */';
const PRIMEICON_END = '/* primeicons:end */';

const FAMILIES = [
    {
        name: 'ck-entity-icons',
        classBase: 'ck-entity-icon',
        sourceDir: 'public/icons/data-model/cnc-domain',
        fontDir: 'public/fonts/cnc-domain',
        publicBase: '/fonts/cnc-domain',
        // 2.25-unit live-area padding (~81% fill): 1/0.814 ≈ 1.23
        sizeCompensation: 'scale(1.23)',
        comment: 'Custom CNC entity icon font (built from\n   public/icons/data-model/cnc-domain).'
    },
    {
        name: 'ck-file-type-icons',
        classBase: 'ck-file-type-icon',
        sourceDir: 'public/icons/file-types',
        fontDir: 'public/fonts/file-types',
        publicBase: '/fonts/file-types',
        // Material 24-grid live area (20/24 ≈ 83% fill): 1/0.833 ≈ 1.2
        sizeCompensation: 'scale(1.2)',
        comment: 'CTS file-type glyphs — Google Material Symbols Outlined\n   sources, Apache-2.0 (the type → icon mapping lives in\n   scripts/README.md).'
    }
];

function buildFamily(family) {
    const startMarker = `/* ${family.name}:start */`;
    const endMarker = `/* ${family.name}:end */`;
    const sourceDir = join(ROOT, family.sourceDir);
    const fontDir = join(ROOT, family.fontDir);
    const buildDir = join(tmpdir(), `${family.name}-${process.pid}`);
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(fontDir, { recursive: true });

    try {
        execFileSync('npx', [
            'fantasticon', sourceDir,
            '-o', buildDir,
            '-n', family.name,
            '-t', 'woff2', '-t', 'ttf',
            '-g', 'css', '-g', 'json',
            '--normalize', 'true',
            '--font-height', '1000',
            '--descent', '158'
        ], { stdio: 'inherit' });

        const generatedCss = readFileSync(join(buildDir, `${family.name}.css`), 'utf8');
        const codepoints = JSON.parse(readFileSync(join(buildDir, `${family.name}.json`), 'utf8'));
        const cacheKey = generatedCss.match(/\?([0-9a-f]{16,})/)?.[1];
        if (!cacheKey) throw new Error('Could not read cache key from generated CSS');

        cpSync(join(buildDir, `${family.name}.woff2`), join(fontDir, `${family.name}.woff2`));
        cpSync(join(buildDir, `${family.name}.ttf`), join(fontDir, `${family.name}.ttf`));

        const iconClasses = Object.entries(codepoints)
            .sort(([, a], [, b]) => a - b)
            .map(([name, code]) => `.${family.classBase}-${name}::before {\n    content: "\\${code.toString(16)}";\n}`)
            .join('\n\n');

        const block = `${startMarker}
/* GENERATED by scripts/build-icon-fonts.js — do not edit by hand. */
@font-face {
    font-family: '${family.name}';
    src: url('${family.publicBase}/${family.name}.woff2?${cacheKey}') format('woff2'),
        url('${family.publicBase}/${family.name}.ttf?${cacheKey}') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: block;
}

/* ${family.comment}
   Behaves like a PrimeIcon class string in every surface (<i :class>, PrimeVue
   Tree/Menu/Tab icon props) and follows the active color scheme.
   The transform scale compensates the 24-grid live-area padding so these
   glyphs match PrimeIcons' edge-to-edge em fill at the same nominal size,
   while the glyph keeps its 1em advance — fixed-size icon boxes (Avatar)
   center it exactly like a PrimeIcon. */
.${family.classBase} {
    font-family: '${family.name}';
    transform: ${family.sizeCompensation};
    font-style: normal;
    font-weight: normal;
    font-variant: normal;
    text-transform: none;
    line-height: 1;
    display: inline-block;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

${iconClasses}
${endMarker}`;

        const css = readFileSync(CSS_FILE, 'utf8');
        const pattern = new RegExp(`${startMarker.replace(/[/*]/g, '\\$&')}[\\s\\S]*?${endMarker.replace(/[/*]/g, '\\$&')}`);
        if (!pattern.test(css)) throw new Error(`Marker block not found in ${CSS_FILE}: ${startMarker}`);
        writeFileSync(CSS_FILE, css.replace(pattern, block));

        console.log(`Built ${Object.keys(codepoints).length} ${family.name} glyphs -> ${fontDir}`);
        return Object.keys(codepoints)
            .sort((a, b) => codepoints[a] - codepoints[b])
            .map(name => `${family.classBase} ${family.classBase}-${name}`);
    } finally {
        rmSync(buildDir, { recursive: true, force: true });
    }
}

// Every PrimeIcons class the installed package ships, read from its SVG
// source directory so the picker palette tracks the dependency.
function writePrimeiconModule() {
    const glyphs = readdirSync(PRIMEICON_DIR)
        .filter(file => file.endsWith('.svg'))
        .map(file => `pi pi-${file.slice(0, -'.svg'.length)}`)
        .sort();
    const moduleText = `${PRIMEICON_START}
// GENERATED by scripts/build-icon-fonts.js — do not edit by hand.
// Every PrimeIcons class string the installed primeicons package ships.
export const primeiconGlyphs = Object.freeze([
${glyphs.map(value => `    '${value}'`).join(',\n')}
]);
${PRIMEICON_END}
`;
    const existing = existsSync(PRIMEICON_FILE) ? readFileSync(PRIMEICON_FILE, 'utf8') : null;
    if (existing !== null) {
        const pattern = new RegExp(`${PRIMEICON_START.replace(/[/*]/g, '\\$&')}[\\s\\S]*?${PRIMEICON_END.replace(/[/*]/g, '\\$&')}`);
        if (!pattern.test(existing)) throw new Error(`Marker block not found in ${PRIMEICON_FILE}`);
        writeFileSync(PRIMEICON_FILE, existing.replace(pattern, moduleText.trimEnd()));
    } else {
        writeFileSync(PRIMEICON_FILE, moduleText.trimEnd() + '\n');
    }
    console.log(`PrimeIcons palette -> ${PRIMEICON_FILE}`);
}

// The authoring palette module: every glyph class string the built
// families offer, generated beside the CSS so the palette can never
// drift from the fonts (contract home: scripts/README.md).
function writePaletteModule(familyGlyphs) {
    const entries = familyGlyphs.flat().map(value => `    '${value}'`).join(',\n');
    const moduleText = `${PALETTE_START}
// GENERATED by scripts/build-icon-fonts.js — do not edit by hand.
// The authoring palette of the app's icon fonts: every glyph class
// string the built families offer, family by family in codepoint order,
// generated beside the CSS contract in assets/css/main.css (see
// scripts/README.md). Consume like any PrimeIcon class string.
export const iconFontGlyphs = Object.freeze([
${entries}
]);
${PALETTE_END}
`;
    const existing = existsSync(PALETTE_FILE) ? readFileSync(PALETTE_FILE, 'utf8') : null;
    if (existing !== null) {
        const pattern = new RegExp(`${PALETTE_START.replace(/[/*]/g, '\\$&')}[\\s\\S]*?${PALETTE_END.replace(/[/*]/g, '\\$&')}`);
        if (!pattern.test(existing)) throw new Error(`Marker block not found in ${PALETTE_FILE}`);
        writeFileSync(PALETTE_FILE, existing.replace(pattern, moduleText.trimEnd()));
    } else {
        writeFileSync(PALETTE_FILE, moduleText.trimEnd() + '\n');
    }
    console.log(`Palette module -> ${PALETTE_FILE}`);
}

if (process.argv.includes('--palette-only')) {
    writePrimeiconModule();
} else {
    writePaletteModule(FAMILIES.map(buildFamily));
    writePrimeiconModule();
}
