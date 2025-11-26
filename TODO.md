### Second-level navigation
If there is a second-level navigation (like tabs), it appears below the menubar navigation as a part of it. It shows the current tab name as clickable text, with a Select icon next to it to choose sibling tabs. For this, you should remove headers from pages that have second-level navigation, as the menubar navigation will serve that purpose.
- [x] Implement second-level navigation below menubar navigation as tab navigation.
- [x] Remove headers from pages with second-level navigation.
- [x] Move "create batch" to actual batch list page.

### Layouts and routing bugs
- [x] Assets and profile pages should use app layout, not blank layout.
- [x] First page after login should be projects list, now despite route is `/projects`, it shows 404 until you refresh.
- [x] After creating a project, it should redirect to that project's page, not stay on projects list.
- [x] After creating a batch, it should redirect to that batch's page.

### Locales and translations
- [x] Impement locale switcher in profile page.
- [x] Add missing translations in various places (check console warnings for missing keys).

### Batch page
- [x] Boolean options in datatable don't work

### Nesting in worker
- [ ] Need to re-develop data structures and nesting logic in worker to support nested cassettes and artifacts properly.
- [ ] Need to update request handling logic to support cassettes and artifacts.
- [ ] Nesting should use cassette layer "UNFOLD_BOUNDARY" and ignore other layers

### Docker setup
- [ ] Find where @vue/core is used and fix it to work in docker environment, now it works only in local dev.
