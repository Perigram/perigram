import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import * as pagesService from '~/server/features/pages/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  const pageId = getRouterParam(event, 'id') || '';
  if (!pageId) throw createError({ statusCode: 400, message: 'Page id is required' });
  const body = await readBody(event) || {};
  const encoded = String(body.contentBase64 || '').replace(/\s/g, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw createError({ statusCode: 400, message: 'contentBase64 must be valid base64' });
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.toString('base64') !== encoded) {
    throw createError({ statusCode: 400, message: 'contentBase64 is not canonical base64' });
  }
  return pagesService.bakeFile({
    pageId,
    path: body.path,
    buffer,
    mimeType: body.mimeType,
    conflictPolicy: body.conflictPolicy,
    provenance: body.provenance
  }, auth);
});
