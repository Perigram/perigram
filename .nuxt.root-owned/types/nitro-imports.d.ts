declare global {
  const BaseEntity: typeof import('../../server/utils/blocks').BaseEntity
  const Identity: typeof import('../../server/utils/blocks').Identity
  const Lineage: typeof import('../../server/utils/blocks').Lineage
  const Specs: typeof import('../../server/utils/blocks').Specs
  const Status: typeof import('../../server/utils/blocks').Status
  const __buildAssetsURL: typeof import('../../node_modules/nuxt/dist/core/runtime/nitro/utils/paths').buildAssetsURL
  const __publicAssetsURL: typeof import('../../node_modules/nuxt/dist/core/runtime/nitro/utils/paths').publicAssetsURL
  const appendCorsHeaders: typeof import('../../node_modules/h3').appendCorsHeaders
  const appendCorsPreflightHeaders: typeof import('../../node_modules/h3').appendCorsPreflightHeaders
  const appendHeader: typeof import('../../node_modules/h3').appendHeader
  const appendHeaders: typeof import('../../node_modules/h3').appendHeaders
  const appendResponseHeader: typeof import('../../node_modules/h3').appendResponseHeader
  const appendResponseHeaders: typeof import('../../node_modules/h3').appendResponseHeaders
  const assertMethod: typeof import('../../node_modules/h3').assertMethod
  const buildNodiGraph: typeof import('../../server/utils/cassetteGraphBuilder').buildNodiGraph
  const cachedEventHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').cachedEventHandler
  const cachedFunction: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').cachedFunction
  const callNodeListener: typeof import('../../node_modules/h3').callNodeListener
  const canAccessEntity: typeof import('../../server/utils/auth-helpers').canAccessEntity
  const checkEntityAccess: typeof import('../../server/utils/permissions').checkEntityAccess
  const clearResponseHeaders: typeof import('../../node_modules/h3').clearResponseHeaders
  const clearSession: typeof import('../../node_modules/h3').clearSession
  const collectDxfEntities: typeof import('../../server/utils/dxf-writer').collectDxfEntities
  const createApp: typeof import('../../node_modules/h3').createApp
  const createAppEventHandler: typeof import('../../node_modules/h3').createAppEventHandler
  const createAttachment: typeof import('../../server/utils/blocks').createAttachment
  const createAttachmentWithObjectId: typeof import('../../server/utils/blocks').createAttachmentWithObjectId
  const createData: typeof import('../../server/utils/blocks').createData
  const createError: typeof import('../../node_modules/h3').createError
  const createEvent: typeof import('../../node_modules/h3').createEvent
  const createEventStream: typeof import('../../node_modules/h3').createEventStream
  const createIdentity: typeof import('../../server/utils/blocks').createIdentity
  const createRouter: typeof import('../../node_modules/h3').createRouter
  const createSpecs: typeof import('../../server/utils/blocks').createSpecs
  const createStatus: typeof import('../../server/utils/blocks').createStatus
  const defaultContentType: typeof import('../../node_modules/h3').defaultContentType
  const defineAppConfig: typeof import('../../node_modules/nuxt/dist/core/runtime/nitro/utils/config').defineAppConfig
  const defineCachedEventHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').defineCachedEventHandler
  const defineCachedFunction: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').defineCachedFunction
  const defineEventHandler: typeof import('../../node_modules/h3').defineEventHandler
  const defineI18nConfig: typeof import('../../node_modules/@nuxtjs/i18n/dist/runtime/composables/shared').defineI18nConfig
  const defineI18nLocale: typeof import('../../node_modules/@nuxtjs/i18n/dist/runtime/composables/shared').defineI18nLocale
  const defineI18nLocaleDetector: typeof import('../../node_modules/@nuxtjs/i18n/dist/runtime/composables/server').defineI18nLocaleDetector
  const defineLazyEventHandler: typeof import('../../node_modules/h3').defineLazyEventHandler
  const defineNitroErrorHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/error/utils').defineNitroErrorHandler
  const defineNitroPlugin: typeof import('../../node_modules/nitropack/dist/runtime/internal/plugin').defineNitroPlugin
  const defineNodeListener: typeof import('../../node_modules/h3').defineNodeListener
  const defineNodeMiddleware: typeof import('../../node_modules/h3').defineNodeMiddleware
  const defineRenderHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/renderer').defineRenderHandler
  const defineRequestMiddleware: typeof import('../../node_modules/h3').defineRequestMiddleware
  const defineResponseMiddleware: typeof import('../../node_modules/h3').defineResponseMiddleware
  const defineRouteMeta: typeof import('../../node_modules/nitropack/dist/runtime/internal/meta').defineRouteMeta
  const defineTask: typeof import('../../node_modules/nitropack/dist/runtime/internal/task').defineTask
  const defineWebSocket: typeof import('../../node_modules/h3').defineWebSocket
  const defineWebSocketHandler: typeof import('../../node_modules/h3').defineWebSocketHandler
  const deleteCookie: typeof import('../../node_modules/h3').deleteCookie
  const dynamicEventHandler: typeof import('../../node_modules/h3').dynamicEventHandler
  const eventHandler: typeof import('../../node_modules/h3').eventHandler
  const extractCurvesFromDXFLayer: typeof import('../../server/utils/dxf-extractor').extractCurvesFromDXFLayer
  const extractDataModels: typeof import('../../server/utils/extract-data-models').extractDataModels
  const extractNestingPolygons: typeof import('../../server/utils/dxf-extractor').extractNestingPolygons
  const extractPolygonsFromDXF: typeof import('../../server/utils/dxf-extractor').extractPolygonsFromDXF
  const fetchWithEvent: typeof import('../../node_modules/h3').fetchWithEvent
  const fromNodeMiddleware: typeof import('../../node_modules/h3').fromNodeMiddleware
  const fromPlainHandler: typeof import('../../node_modules/h3').fromPlainHandler
  const fromWebHandler: typeof import('../../node_modules/h3').fromWebHandler
  const generateAccessToken: typeof import('../../server/utils/auth-helpers').generateAccessToken
  const generateEntityName: typeof import('../../server/utils/strings').generateEntityName
  const generateLayeredDxf: typeof import('../../server/utils/dxf-writer').generateLayeredDxf
  const generateMarkdown: typeof import('../../server/utils/extract-data-models').generateMarkdown
  const generateRandomString: typeof import('../../server/utils/strings').generateRandomString
  const generateRelationshipDiagram: typeof import('../../server/utils/extract-data-models').generateRelationshipDiagram
  const generateSession: typeof import('../../server/utils/auth-helpers').generateSession
  const getCookie: typeof import('../../node_modules/h3').getCookie
  const getCookieLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').getCookieLocale
  const getDxfArray: typeof import('../../server/utils/multipart').getDxfArray
  const getHeader: typeof import('../../node_modules/h3').getHeader
  const getHeaderLanguage: typeof import('../../node_modules/@intlify/utils/dist/h3').getHeaderLanguage
  const getHeaderLanguages: typeof import('../../node_modules/@intlify/utils/dist/h3').getHeaderLanguages
  const getHeaderLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').getHeaderLocale
  const getHeaderLocales: typeof import('../../node_modules/@intlify/utils/dist/h3').getHeaderLocales
  const getHeaders: typeof import('../../node_modules/h3').getHeaders
  const getLineageFilter: typeof import('../../server/utils/permissions').getLineageFilter
  const getMethod: typeof import('../../node_modules/h3').getMethod
  const getPathLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').getPathLocale
  const getProxyRequestHeaders: typeof import('../../node_modules/h3').getProxyRequestHeaders
  const getQuery: typeof import('../../node_modules/h3').getQuery
  const getQueryLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').getQueryLocale
  const getRequestFingerprint: typeof import('../../node_modules/h3').getRequestFingerprint
  const getRequestHeader: typeof import('../../node_modules/h3').getRequestHeader
  const getRequestHeaders: typeof import('../../node_modules/h3').getRequestHeaders
  const getRequestHost: typeof import('../../node_modules/h3').getRequestHost
  const getRequestIP: typeof import('../../node_modules/h3').getRequestIP
  const getRequestPath: typeof import('../../node_modules/h3').getRequestPath
  const getRequestProtocol: typeof import('../../node_modules/h3').getRequestProtocol
  const getRequestURL: typeof import('../../node_modules/h3').getRequestURL
  const getRequestWebStream: typeof import('../../node_modules/h3').getRequestWebStream
  const getResponseHeader: typeof import('../../node_modules/h3').getResponseHeader
  const getResponseHeaders: typeof import('../../node_modules/h3').getResponseHeaders
  const getResponseStatus: typeof import('../../node_modules/h3').getResponseStatus
  const getResponseStatusText: typeof import('../../node_modules/h3').getResponseStatusText
  const getRouteRules: typeof import('../../node_modules/nitropack/dist/runtime/internal/route-rules').getRouteRules
  const getRouterParam: typeof import('../../node_modules/h3').getRouterParam
  const getRouterParams: typeof import('../../node_modules/h3').getRouterParams
  const getSession: typeof import('../../node_modules/h3').getSession
  const getValidatedQuery: typeof import('../../node_modules/h3').getValidatedQuery
  const getValidatedRouterParams: typeof import('../../node_modules/h3').getValidatedRouterParams
  const handleCacheHeaders: typeof import('../../node_modules/h3').handleCacheHeaders
  const handleCors: typeof import('../../node_modules/h3').handleCors
  const hasLineagePermission: typeof import('../../server/utils/permissions').hasLineagePermission
  const hasPermission: typeof import('../../server/utils/auth-helpers').hasPermission
  const hashPassword: typeof import('../../server/utils/auth-helpers').hashPassword
  const inheritLineage: typeof import('../../server/utils/blocks').inheritLineage
  const isCorsOriginAllowed: typeof import('../../node_modules/h3').isCorsOriginAllowed
  const isError: typeof import('../../node_modules/h3').isError
  const isEvent: typeof import('../../node_modules/h3').isEvent
  const isEventHandler: typeof import('../../node_modules/h3').isEventHandler
  const isMethod: typeof import('../../node_modules/h3').isMethod
  const isPreflightRequest: typeof import('../../node_modules/h3').isPreflightRequest
  const isStream: typeof import('../../node_modules/h3').isStream
  const isValidObjectId: typeof import('../../server/utils/objectid').isValidObjectId
  const isWebResponse: typeof import('../../node_modules/h3').isWebResponse
  const lazyEventHandler: typeof import('../../node_modules/h3').lazyEventHandler
  const logger: typeof import('../../server/utils/logger').default
  const mapLineageQuery: typeof import('../../server/utils/query').mapLineageQuery
  const nitroPlugin: typeof import('../../node_modules/nitropack/dist/runtime/internal/plugin').nitroPlugin
  const parseCookies: typeof import('../../node_modules/h3').parseCookies
  const pluralize: typeof import('../../server/utils/strings').pluralize
  const promisifyNodeListener: typeof import('../../node_modules/h3').promisifyNodeListener
  const proxyRequest: typeof import('../../node_modules/h3').proxyRequest
  const readBody: typeof import('../../node_modules/h3').readBody
  const readFormData: typeof import('../../node_modules/h3').readFormData
  const readMultipartFormData: typeof import('../../node_modules/h3').readMultipartFormData
  const readRawBody: typeof import('../../node_modules/h3').readRawBody
  const readValidatedBody: typeof import('../../node_modules/h3').readValidatedBody
  const removeResponseHeader: typeof import('../../node_modules/h3').removeResponseHeader
  const requireAuth: typeof import('../../server/utils/permissions').requireAuth
  const requireLineagePermission: typeof import('../../server/utils/permissions').requireLineagePermission
  const requirePermission: typeof import('../../server/utils/permissions').requirePermission
  const resolveAuthPermissions: typeof import('../../server/utils/auth-helpers').resolveAuthPermissions
  const runTask: typeof import('../../node_modules/nitropack/dist/runtime/internal/task').runTask
  const sanitizeStatusCode: typeof import('../../node_modules/h3').sanitizeStatusCode
  const sanitizeStatusMessage: typeof import('../../node_modules/h3').sanitizeStatusMessage
  const sealSession: typeof import('../../node_modules/h3').sealSession
  const send: typeof import('../../node_modules/h3').send
  const sendError: typeof import('../../node_modules/h3').sendError
  const sendIterable: typeof import('../../node_modules/h3').sendIterable
  const sendNoContent: typeof import('../../node_modules/h3').sendNoContent
  const sendProxy: typeof import('../../node_modules/h3').sendProxy
  const sendRedirect: typeof import('../../node_modules/h3').sendRedirect
  const sendStream: typeof import('../../node_modules/h3').sendStream
  const sendWebResponse: typeof import('../../node_modules/h3').sendWebResponse
  const serializeForAccess: typeof import('../../server/utils/entity-redaction').serializeForAccess
  const serializeManyForAccess: typeof import('../../server/utils/entity-redaction').serializeManyForAccess
  const serveStatic: typeof import('../../node_modules/h3').serveStatic
  const setCookie: typeof import('../../node_modules/h3').setCookie
  const setCookieLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').setCookieLocale
  const setHeader: typeof import('../../node_modules/h3').setHeader
  const setHeaders: typeof import('../../node_modules/h3').setHeaders
  const setResponseHeader: typeof import('../../node_modules/h3').setResponseHeader
  const setResponseHeaders: typeof import('../../node_modules/h3').setResponseHeaders
  const setResponseStatus: typeof import('../../node_modules/h3').setResponseStatus
  const splitCookiesString: typeof import('../../node_modules/h3').splitCookiesString
  const streamToString: typeof import('../../server/utils/strings').streamToString
  const svgPathToPolyline: typeof import('../../server/utils/dxf-writer').svgPathToPolyline
  const toEventHandler: typeof import('../../node_modules/h3').toEventHandler
  const toFlexibleId: typeof import('../../server/utils/objectid').toFlexibleId
  const toNodeListener: typeof import('../../node_modules/h3').toNodeListener
  const toObjectId: typeof import('../../server/utils/objectid').toObjectId
  const toPlainHandler: typeof import('../../node_modules/h3').toPlainHandler
  const toWebHandler: typeof import('../../node_modules/h3').toWebHandler
  const toWebRequest: typeof import('../../node_modules/h3').toWebRequest
  const track: typeof import('../../server/utils/tracking').track
  const tryCookieLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').tryCookieLocale
  const tryHeaderLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').tryHeaderLocale
  const tryHeaderLocales: typeof import('../../node_modules/@intlify/utils/dist/h3').tryHeaderLocales
  const tryPathLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').tryPathLocale
  const tryQueryLocale: typeof import('../../node_modules/@intlify/utils/dist/h3').tryQueryLocale
  const unsealSession: typeof import('../../node_modules/h3').unsealSession
  const updateSession: typeof import('../../node_modules/h3').updateSession
  const useAppConfig: typeof import('../../node_modules/nitropack/dist/runtime/internal/config').useAppConfig
  const useBase: typeof import('../../node_modules/h3').useBase
  const useEvent: typeof import('../../node_modules/nitropack/dist/runtime/internal/context').useEvent
  const useNitroApp: typeof import('../../node_modules/nitropack/dist/runtime/internal/app').useNitroApp
  const useRuntimeConfig: typeof import('../../node_modules/nitropack/dist/runtime/internal/config').useRuntimeConfig
  const useSession: typeof import('../../node_modules/h3').useSession
  const useStorage: typeof import('../../node_modules/nitropack/dist/runtime/internal/storage').useStorage
  const useTranslation: typeof import('../../node_modules/@intlify/h3').useTranslation
  const verifyAccessToken: typeof import('../../server/utils/auth-helpers').verifyAccessToken
  const verifyPassword: typeof import('../../server/utils/auth-helpers').verifyPassword
  const writeEarlyHints: typeof import('../../node_modules/h3').writeEarlyHints
}
export { useTranslation } from '@intlify/h3';
export { useNitroApp } from 'nitropack/runtime/internal/app';
export { useRuntimeConfig, useAppConfig } from 'nitropack/runtime/internal/config';
export { defineNitroPlugin, nitroPlugin } from 'nitropack/runtime/internal/plugin';
export { defineCachedFunction, defineCachedEventHandler, cachedFunction, cachedEventHandler } from 'nitropack/runtime/internal/cache';
export { useStorage } from 'nitropack/runtime/internal/storage';
export { defineRenderHandler } from 'nitropack/runtime/internal/renderer';
export { defineRouteMeta } from 'nitropack/runtime/internal/meta';
export { getRouteRules } from 'nitropack/runtime/internal/route-rules';
export { useEvent } from 'nitropack/runtime/internal/context';
export { defineTask, runTask } from 'nitropack/runtime/internal/task';
export { defineNitroErrorHandler } from 'nitropack/runtime/internal/error/utils';
export { appendCorsHeaders, appendCorsPreflightHeaders, appendHeader, appendHeaders, appendResponseHeader, appendResponseHeaders, assertMethod, callNodeListener, clearResponseHeaders, clearSession, createApp, createAppEventHandler, createError, createEvent, createEventStream, createRouter, defaultContentType, defineEventHandler, defineLazyEventHandler, defineNodeListener, defineNodeMiddleware, defineRequestMiddleware, defineResponseMiddleware, defineWebSocket, defineWebSocketHandler, deleteCookie, dynamicEventHandler, eventHandler, fetchWithEvent, fromNodeMiddleware, fromPlainHandler, fromWebHandler, getCookie, getHeader, getHeaders, getMethod, getProxyRequestHeaders, getQuery, getRequestFingerprint, getRequestHeader, getRequestHeaders, getRequestHost, getRequestIP, getRequestPath, getRequestProtocol, getRequestURL, getRequestWebStream, getResponseHeader, getResponseHeaders, getResponseStatus, getResponseStatusText, getRouterParam, getRouterParams, getSession, getValidatedQuery, getValidatedRouterParams, handleCacheHeaders, handleCors, isCorsOriginAllowed, isError, isEvent, isEventHandler, isMethod, isPreflightRequest, isStream, isWebResponse, lazyEventHandler, parseCookies, promisifyNodeListener, proxyRequest, readBody, readFormData, readMultipartFormData, readRawBody, readValidatedBody, removeResponseHeader, sanitizeStatusCode, sanitizeStatusMessage, sealSession, send, sendError, sendIterable, sendNoContent, sendProxy, sendRedirect, sendStream, sendWebResponse, serveStatic, setCookie, setHeader, setHeaders, setResponseHeader, setResponseHeaders, setResponseStatus, splitCookiesString, toEventHandler, toNodeListener, toPlainHandler, toWebHandler, toWebRequest, unsealSession, updateSession, useBase, useSession, writeEarlyHints } from 'h3';
export { buildAssetsURL as __buildAssetsURL, publicAssetsURL as __publicAssetsURL } from '/src/node_modules/nuxt/dist/core/runtime/nitro/utils/paths';
export { defineAppConfig } from '/src/node_modules/nuxt/dist/core/runtime/nitro/utils/config';
export { defineI18nLocale, defineI18nConfig } from '/src/node_modules/@nuxtjs/i18n/dist/runtime/composables/shared';
export { defineI18nLocaleDetector } from '/src/node_modules/@nuxtjs/i18n/dist/runtime/composables/server';
export { getCookieLocale, getHeaderLanguage, getHeaderLanguages, getHeaderLocale, getHeaderLocales, getPathLocale, getQueryLocale, setCookieLocale, tryCookieLocale, tryHeaderLocale, tryHeaderLocales, tryPathLocale, tryQueryLocale } from '/src/node_modules/@intlify/utils/dist/h3';
export { hashPassword, verifyPassword, generateAccessToken, verifyAccessToken, resolveAuthPermissions, hasPermission, canAccessEntity, generateSession } from '/src/server/utils/auth-helpers';
export { inheritLineage, createAttachmentWithObjectId, BaseEntity, Identity, Status, Lineage, Specs, createIdentity, createStatus, createSpecs, createData, createAttachment } from '/src/server/utils/blocks';
export { buildNodiGraph } from '/src/server/utils/cassetteGraphBuilder';
export { extractPolygonsFromDXF, extractCurvesFromDXFLayer, extractNestingPolygons } from '/src/server/utils/dxf-extractor';
export { svgPathToPolyline, collectDxfEntities, generateLayeredDxf } from '/src/server/utils/dxf-writer';
export { serializeForAccess, serializeManyForAccess } from '/src/server/utils/entity-redaction';
export { extractDataModels, generateMarkdown, generateRelationshipDiagram } from '/src/server/utils/extract-data-models';
export { default as logger } from '/src/server/utils/logger';
export { getDxfArray } from '/src/server/utils/multipart';
export { toFlexibleId, toObjectId, isValidObjectId } from '/src/server/utils/objectid';
export { requireAuth, hasLineagePermission, requireLineagePermission, requirePermission, checkEntityAccess, getLineageFilter } from '/src/server/utils/permissions';
export { mapLineageQuery } from '/src/server/utils/query';
export { generateRandomString, generateEntityName, streamToString, pluralize } from '/src/server/utils/strings';
export { track } from '/src/server/utils/tracking';