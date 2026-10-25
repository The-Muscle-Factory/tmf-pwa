// Tiny hyperscript helper: h('div', { class: 'x', onclick }, child, ...)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked') continue; // set after children (e.g. <select> options)
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  if (props?.value != null) el.value = props.value;
  if (props?.checked != null) el.checked = props.checked;
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    return fn(...args);
  };
  return wrapped;
}

// Short message at the top of the screen. With `action`, shows a button
// (e.g. Undo) and stays a little longer.
export function toast(msg, { action } = {}) {
  document.querySelector('.toast')?.remove();
  const el = h(
    'div',
    { class: 'toast' },
    h('span', null, msg),
    action ? h('button', { class: 'toast-action', onclick: () => { hide(); action.run(); } }, action.label) : null
  );
  const hide = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  };
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(hide, action ? 5000 : 2000);
}

// Centered dialog. With `input`, resolves with the typed text (possibly '') or
// null on cancel; otherwise resolves true/false.
export function dialog({ title, message, input, confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const field = input
      ? h('input', { class: 'text dialog-input', type: 'text', placeholder: input.placeholder || '', value: input.value || '', enterkeyhint: 'done',
          onkeydown: (e) => e.key === 'Enter' && close(true) })
      : null;
    const close = (ok) => {
      backdrop.remove();
      resolve(input ? (ok ? field.value.trim() : null) : ok);
    };
    const backdrop = h(
      'div',
      { class: 'dialog-backdrop', onclick: (e) => e.target === backdrop && close(false) },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'dialog-title' }, title),
        message ? h('div', { class: 'dialog-msg' }, message) : null,
        field,
        h(
          'div',
          { class: 'dialog-btns' },
          h('button', { class: 'btn secondary', onclick: () => close(false) }, 'Cancel'),
          h('button', { class: `btn ${danger ? 'danger-fill' : 'primary'}`, onclick: () => close(true) }, confirmLabel)
        )
      )
    );
    document.body.append(backdrop);
    field?.focus();
  });
}

// Bottom panel with arbitrary content. Returns a function that closes it.
export function panel(title, ...content) {
  const close = () => backdrop.remove();
  const backdrop = h(
    'div',
    { class: 'sheet-backdrop', onclick: (e) => e.target === backdrop && close() },
    h(
      'div',
      { class: 'sheet panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, title), h('button', { class: 'btn ghost', onclick: close }, 'Close')),
      h('div', { class: 'panel-body' }, content)
    )
  );
  document.body.append(backdrop);
  return close;
}

// Inline SVG (h() only creates HTML elements).
export function svgIcon(markup, cls = 'icon') {
  const span = h('span', { class: cls, 'aria-hidden': 'true' });
  span.innerHTML = markup;
  return span;
}

// Bottom sheet with a list of choices. Resolves with the chosen value or null.
export function sheet(title, options) {
  return new Promise((resolve) => {
    const close = (val) => {
      backdrop.remove();
      resolve(val);
    };
    const backdrop = h(
      'div',
      { class: 'sheet-backdrop', onclick: (e) => e.target === backdrop && close(null) },
      h(
        'div',
        { class: 'sheet' },
        h('div', { class: 'sheet-title' }, title),
        options.map((o) =>
          h('button', { class: `sheet-btn ${o.danger ? 'danger' : ''}`, onclick: () => close(o.value) }, o.label)
        ),
        h('button', { class: 'sheet-btn cancel', onclick: () => close(null) }, 'Cancel')
      )
    );
    document.body.append(backdrop);
  });
}

// Replace an element's content; accepts nested arrays like h().
export function mount(root, ...children) {
  root.replaceChildren();
  append(root, children);
}
