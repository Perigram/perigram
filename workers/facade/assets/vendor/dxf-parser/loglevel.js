// No-op stand-in for dxf-parser's loglevel dependency: the parser only
// traces parse internals through it. Vendored so the browser-served
// module graph stays self-contained (the surface law).
const noop = () => {};
export default { setLevel: noop, setDefaultLevel: noop, enableAll: noop, disableAll: noop, trace: noop, debug: noop, info: noop, warn: noop, error: noop, getLogger: () => ({ setLevel: noop, trace: noop, debug: noop, info: noop, warn: noop, error: noop }) };
