// The documents plugin's csv editor surface (surface contract 3 — the
// capability mount). Rows edit in a cell table (the host's DataTable
// primitive) and serialize back to CSV text on save; remote saves
// reconcile through the host's record-change bridge (`sync`); `xlsx` is
// a declared vendored dependency. The retired pack editor's persistence
// contract (loadText/saveText) maps onto the mount's payload channel
// (loadDocument/saveDocument over raw text).
import * as XLSX from 'xlsx';

export default function createSurface({ vue, components, locale, sync }) {
  const { h, ref, computed, reactive, watch, onMounted, defineComponent } = vue;
  const t = locale.t;
  const { Column, DataTable, InputText } = components;

  if (!sync) {
    throw new Error('csv-editor requires the contract-3 mount context (sync capability)');
  }

  return defineComponent({
    name: 'CsvTableEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null },
      // 'read' (the opener holds no write grant) renders the table —
      // no editing controls.
      mode: { type: String, default: 'edit' },
      // The editor page chrome channel (SPEC §4): the host header owns
      // the document name and save; the editor binds its document
      // state into it.
      pageChrome: { type: Object, default: null }
    },
    setup(props) {
      const columns = ref([]);
      const rows = ref([]);
      const saving = ref(false);
      const dirty = ref(false);
      const remoteChanged = ref(false);
      const localTitle = ref('');

      const displayName = () => localTitle.value || props.record?.name || props.persistence?.title || '';

      let loading = true;
      watch(rows, () => { if (!loading) dirty.value = true; }, { deep: true });

      // The header's rename channel: the page header owns the draft; the
      // editor applies the committed name through the persistence.
      async function rename(name) {
        if (!name || name === displayName()) return;
        try {
          await props.persistence.rename(props.record, name);
          localTitle.value = name;
        } catch (error) {
          console.error('Failed to rename document:', error?.message || error);
        }
      }

      async function loadRows() {
        try {
          const text = await props.persistence.loadDocument(props.record, { mimeType: 'text/csv', raw: true });
          const sheet = XLSX.read(text || '', { type: 'string' }).Sheets.Sheet1;
          const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          columns.value = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
          rows.value = values.map(row => Object.fromEntries(columns.value.map((column, index) => [column, row[index] ?? ''])));
        } catch (error) {
          console.error('Failed to load table:', error?.message || error);
        } finally {
          loading = false;
        }
      }

      // Remote saves/renames reconcile: clean reloads the rows, dirty
      // raises the header's divergence refresh (the surface's own
      // publications are skipped host-side).
      sync.onRecordChanged(() => {
        if (dirty.value) {
          remoteChanged.value = true;
          return;
        }
        loading = true;
        loadRows();
      });

      onMounted(loadRows);

      // PrimeVue's cell editor binds a working copy and delivers the edit
      // through `cell-edit-complete` ({ data = the table's row object,
      // newValue, field }): applying it here is what makes the edit land
      // in `rows` — unhandled, the table re-renders the original value.
      function applyCellEdit({ data, field, newValue }) {
        if (!data) return;
        data[field] = newValue;
      }

      function reloadFromRemote() {
        remoteChanged.value = false;
        loading = true;
        loadRows();
      }

      async function save() {
        saving.value = true;
        try {
          const stem = String(displayName() || 'document').replace(/\.csv$/i, '');
          const text = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.value, { header: columns.value }));
          await props.persistence.saveDocument(props.record, text, { fileName: `${stem}.csv`, mimeType: 'text/csv' });
          dirty.value = false;
        } catch (error) {
          console.error('Failed to save table:', error?.message || error);
        } finally {
          saving.value = false;
        }
      }

      if (props.mode === 'read') {
        return () => h('div', { class: 'flex h-full min-h-0 flex-1 flex-col p-4' }, [
          h(DataTable, {
            value: rows.value,
            scrollable: true,
            scrollHeight: 'flex',
            size: 'small',
            class: 'min-h-80 flex-1'
          }, () => columns.value.map(column => h(Column, {
            key: column,
            field: column,
            header: column
          })))
        ]);
      }

      // The document chrome hand-off (SPEC §4): the header renders the
      // name, the dirty-marked save, and the divergence refresh from
      // this binding; the surface below is the table alone.
      props.pageChrome?.bind?.(Object.assign(
        reactive({
          name: computed(displayName),
          dirty,
          saving,
          diverged: computed(() => remoteChanged.value && dirty.value)
        }),
        { save, rename, reload: reloadFromRemote }
      ));

      return () => h('div', { class: 'flex h-full min-h-0 flex-1 flex-col p-4' }, [
        h(DataTable, {
          value: rows.value,
          editMode: 'cell',
          scrollable: true,
          scrollHeight: 'flex',
          size: 'small',
          class: 'min-h-80 flex-1',
          onCellEditComplete: applyCellEdit
        }, () => columns.value.map(column => h(Column, {
          key: column,
          field: column,
          header: column
        }, {
          editor: ({ data, field }) => h(InputText, {
            modelValue: data[field],
            size: 'small',
            'onUpdate:modelValue': value => { data[field] = value; }
          })
        })))
      ]);
    }
  });
}
