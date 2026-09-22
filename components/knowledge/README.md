# COMPONENT: Knowledge Workspace Page

`KnowledgeWorkspacePage.vue` hosts the org-wide OpenKnowledge editor as a
home-workspace tab: an iframe over the editor's own published origin
(`runtimeConfig.public.openknowledgeEditorUrl`, default
`http://localhost:4310`). The editor is a websocket-collab app whose
`/collab` socket dials the origin it is served from, so it is never framed
same-origin through the app proxy — that reconnect storm killed the Nuxt
dev server. Admission gates the sidebar entry server-side
([the knowledge feature](../../../server/features/knowledge/README.md));
the authenticated HTTP proxy stays available for programmatic access.

Registration lives in
[`components/generated/workspace-pages.js`](../generated/workspace-pages.js)
(page id `knowledge`), so the tab opens from the sidebar communication
menu and appears in add-tab lists like Chats.

## Related

- [Knowledge feature](../../../server/features/knowledge/README.md)
- [Calls](../calls/README.md) — the workspace-page pattern this follows
