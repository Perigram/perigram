// The tech-drawing plugin's executor services (endpoint mode): pure
// compute over values — the platform sends referenced instances with
// their payloads as base64, the service returns the composed file.
import { composeDxfPlacement } from './placement.js';

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export const services = {
  'place-dxf': async (input = {}) => {
    const template = input?.refs?.template;
    if (!template?.payloadBase64) badRequest('place-dxf requires a template ref with a payload');
    const parts = input?.refs?.parts;
    if (!Array.isArray(parts) || !parts.length) badRequest('place-dxf requires parts refs with payloads');
    const composed = composeDxfPlacement(
      Buffer.from(template.payloadBase64, 'base64').toString('utf8'),
      parts.map(part => {
        if (!part?.payloadBase64) badRequest('place-dxf requires every part to carry a payload');
        return {
          name: part.name || '',
          text: Buffer.from(part.payloadBase64, 'base64').toString('utf8')
        };
      })
    );
    const name = String(input.draft?.name || input.draft?.identity?.name || template.name || 'drawing').replace(/\.[^.]+$/, '');
    return {
      payload: {
        base64: Buffer.from(composed, 'utf8').toString('base64'),
        mime: 'application/dxf',
        name: `${name}.dxf`
      }
    };
  }
};
