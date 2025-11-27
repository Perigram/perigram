# UI
- [x] Go througn all components and remove all styles. Replace custom classes with Tailwind classes only where layout is concerned. Colors, borders, fonts etc should be default Primevue without customizations.
- [x] Menubar is sticky on top. Now it scrolls away.
- [x] Replace project[slug].vue obsolete TabMenu with Tabs component (using TabView)
- [x] In all top-level panels in Tabs components, add padding around the content so it doesn't touch the edges. (project, assets, profile, etc)
- [x] Artifacts in project[slug].vue: should be displayed in a grid, not a list.
- [x] In project[slug].vue, change composition of tabs: batches, project data. Remove artifacts tab as artifacts are now part of batches.
- [x] BatchEditor: remove header with status and entries. 
- [x] BatchEditor: move both "add cassette" buttons under the datatable. 
- [x] BatchEditor: put batch sections into accordion panels: one for nesting options (remove layer select, remove space input, add tool select, tool.diameter will define space) one for cassettes datatable, one for artifacts dataview (make it decent).
- [x] Remove headers from all pages, they are redundant with the menubar.


# Routing
- [x] Assets routing is misused. "Parts" shouldn't exist at all. Other routes in assets should be direct children of /assets. (cassettes, pens, tools, templates)


