import { h, toast, sheet, mount } from '../dom.js';
import * as store from '../store.js';
import { todayISO } from '../dates.js';

export async function renderSettings(root, _params, rerender) {
  const settings = await store.getSettings();
  const templates = await store.getTemplates();
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const offlineReady = !!navigator.serviceWorker?.controller && (await caches.keys()).length > 0;

  const update = async (patch) => {
    await store.saveSettings({ ...settings, ...patch });
    rerender();
  };

  const seg = (options, current, onPick) =>
    h('div', { class: 'seg' }, options.map(([val, label]) => h('button', { class: val === current ? 'on' : '', onclick: () => onPick(val) }, label)));

  async function doExport() {
    const data = await store.exportAll();
    const file = new File([JSON.stringify(data, null, 2)], `tmf-backup-${todayISO()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'TMF backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(file), download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        e.target.value = '';
        const mode = await sheet(`Import ${data.days?.length ?? 0} days`, [
          { label: 'Add to my data (keeps everything already logged)', value: 'merge' },
          { label: 'Replace all my data with this file', value: 'replace', danger: true },
        ]);
        if (mode === 'merge') {
          const { added, merged } = await store.mergeImport(data);
          toast(`Imported: ${added} new days, ${merged} updated`);
        } else if (mode === 'replace' && confirm('This deletes everything currently in the app. Continue?')) {
          await store.importAll(data);
          toast('Backup restored');
        } else return;
        rerender();
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    },
  });

  mount(root,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, h('div', null, 'Settings'))),
    h('div', { class: 'group' },
      h('div', { class: 'group-row' }, h('span', null, 'Weight unit'), seg([['kg', 'kg'], ['lbs', 'lbs']], settings.unit, (unit) => update({ unit }))),
      h('div', { class: 'group-row' }, h('span', null, 'Rest timer'),
        seg([[0, 'Off'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00']], settings.restSeconds, (restSeconds) => update({ restSeconds })))
    ),
    h('div', { class: 'group' },
      h('div', { class: 'group-row' }, h('span', null, 'Works offline'),
        h('span', { class: offlineReady ? 'ok' : 'muted' }, offlineReady ? 'Ready ✓' : 'Not yet — open once with internet'))
    ),
    h('h3', { class: 'label' }, 'Templates'),
    h('div', { class: 'group' },
      templates.length
        ? templates.map((t) =>
            h('div', { class: 'group-row' },
              h('div', null, h('div', null, t.name), h('div', { class: 'muted small' }, t.exercises.map((e) => e.name).join(', '))),
              h('button', { class: 'btn ghost danger', onclick: async () => { if (confirm(`Delete template "${t.name}"?`)) { await store.deleteTemplate(t.id); rerender(); } } }, 'Delete')))
        : h('div', { class: 'group-row muted' }, 'Save a workout day as a template from the day screen.')
    ),
    h('h3', { class: 'label' }, 'Backup'),
    h('div', { class: 'group' },
      h('div', { class: 'group-row' }, h('span', null, 'Export all data'), h('button', { class: 'btn secondary', onclick: doExport }, 'Export')),
      h('div', { class: 'group-row' }, h('span', null, 'Import from file'), h('button', { class: 'btn secondary', onclick: () => fileInput.click() }, 'Import')),
      fileInput
    ),
    h('p', { class: 'muted small pad' },
      `Data is stored only on this device${persisted ? ' (persistent storage granted)' : ''}. Export a backup now and then — deleting the app from the Home Screen deletes its data.`)
  );
}
