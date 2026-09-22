/**
 * OpenKnowledge's collab client dials the origin it was served from.
 * Editor sessions framed through the app proxy (stale tabs predating the
 * editor-origin fix) reconnect to /collab here; answering 501 directly
 * keeps those retries cheap instead of rendering full SSR error pages
 * that dragged the dev server down.
 */
export default defineEventHandler((event) => {
    setResponseStatus(event, 501);
});
