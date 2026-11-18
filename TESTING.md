# Testing and acceptance policy

A passing lower-level test must never be represented as proof of a higher-level runtime or deployment boundary.

## Required test layers

1. **Unit and contract (Vitest):** pure behavior, schema validation, serialization, graph compilation, operation contracts, capability policy, and isolated server behavior. These tests do not prove browser module loading or deployment wiring.
2. **SSR smoke (Vitest + Vue server renderer):** real page SFC setup and server rendering with Nuxt imports stubbed. This does not prove hydration, browser APIs, Workers, or interactive behavior.
3. **Runtime-target acceptance:** every declared browser runtime must be bundled as a browser-loadable artifact and imported and executed in a real browser. Every managed server runtime must also be loaded and executed through its managed runtime boundary. Source-module tests alone do not satisfy this requirement.
4. **Application E2E (Playwright):** user-visible graph/HAG workflows must execute against a running application stack. The command `playwright test --list` proves discovery only; it is never an acceptance test.
5. **Deployment acceptance:** a release must verify the actual published package assets, installed version pin, served module URLs, and a representative operation after installation. A source checkout test cannot prove that a catalog or deployment contains the same artifact.

## Runtime rules

- Browser runtime entrypoints must be self-contained ESM bundles. Bare npm specifiers are not browser-resolvable and must not leak into served runtime modules.
- Build the portable artifact before packaging or publishing the plugin. The listing's runtime entry must point at that artifact.
- Runtime asset collection must package the exact entry named by the listing and its complete static import graph.
- A browser runtime test must import the packaged artifact in Chromium and execute an operation that exercises third-party dependencies.
- A test that only imports source in Node, checks declarations, or lists Playwright specs must be described by exactly that limited scope.

## CI reporting

CI reports each layer separately. A missing environment or skipped acceptance layer is a visible gap, not a passing result. Do not collapse source tests, SSR, browser runtime, application E2E, and deployed-artifact acceptance into one undifferentiated "tests passed" claim.

## Current staging workflow scope

The staging workflow currently runs the Documents browser Worker smoke against
the built portable runtime, the Vitest suite, SSR smoke, and static discovery
of the graph/HAG Playwright specs. That discovery command does not execute
those application workflows. Full graph/HAG application E2E and a smoke
against the deployed, installed catalog artifact remain separate acceptance
gaps until the workflow provisions and tears down an isolated application
stack and deployment target.
