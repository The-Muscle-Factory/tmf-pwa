// Tiny hyperscript helper: h('div', { class: 'x', onclick }, child, ...)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
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

export function toast(msg) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2000);
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
