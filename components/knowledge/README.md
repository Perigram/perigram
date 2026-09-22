# COMPONENT: Knowledge Workspace Page

`KnowledgeWorkspacePage.vue` hosts the org-wide OpenKnowledge editor as a
home-workspace tab: a same-origin iframe over the authenticated proxy
(`/api/knowledge/proxy/`). The session cookie carries admission on every
editor request, and OpenKnowledge's relative asset paths resolve against
the proxy prefix. The editor itself — including its websockets for live
collaboration — runs in the `openknowledge` container; anything the HTTP
proxy cannot carry degrades in the iframe exactly as documented in
[the knowledge feature](../../../server/features/knowledge/README.md).

Registration lives in
[`components/generated/workspace-pages.js`](../generated/workspace-pages.js)
(page id `knowledge`), so the tab opens from the sidebar communication
menu and appears in add-tab lists like Chats.

## Related

- [Knowledge feature](../../../server/features/knowledge/README.md)
- [Calls](../calls/README.md) — the workspace-page pattern this follows
