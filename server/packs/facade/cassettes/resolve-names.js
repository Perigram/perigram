// The `cassettes.resolveByName` service handler: order-line template
// names → cassette refs, order-preserving, so a bake construct consumes
// refs aligned with the rows that named them. Unmatched names fail the
// call listing every missing name — silent misalignment is worse than a
// loud 400.
import { createError } from 'h3';
import { instanceServiceResolver } from '../../../features/instances/service.js';

export async function resolveCassetteNames({ parameters = {}, auth } = {}) {
  const names = Array.isArray(parameters.names)
    ? parameters.names.map(name => String(name ?? '').trim()).filter(Boolean)
    : [];
  if (!names.length) {
    throw createError({ statusCode: 400, message: 'Template resolution requires names' });
  }

  const templates = await instanceServiceResolver('cassette')
    .list({}, auth?.userId, auth?.organizationId);
  const byName = new Map(templates.map(template => [
    String(template.identity?.name ?? template.name ?? template._id).trim().toLowerCase(),
    template
  ]));

  const resolved = [];
  const unmatched = [];
  for (const name of names) {
    const template = byName.get(name.toLowerCase());
    if (!template) unmatched.push(name);
    else resolved.push({ type: 'cassette', id: String(template._id) });
  }
  if (unmatched.length) {
    throw createError({
      statusCode: 400,
      message: `No cassette template named ${unmatched.join(', ')}`
    });
  }
  return resolved;
}
