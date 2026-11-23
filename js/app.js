(function () {
  'use strict';

  /*
   * Two storage modes, one codebase:
   *  - "shared": running inside claude.ai as an Artifact. Data lives in the artifact's
   *    shared database (collections: clients, team, answers) and syncs live between people.
   *  - "local":  anywhere else (GitHub Pages, a local file). Data lives in this browser's
   *    localStorage; data/seed.json is loaded on first visit.
   */

  var C = window.APP_CONFIG;
  var KEY = C.storageKey || 'org-assessment-v1';
  var KINDS = ['clients', 'team'];
  var NUMERIC = ['number', 'currency', 'percent'];
  var LABELS = { clients: { one: 'client', add: '+ Add client' }, team: { one: 'person', add: '+ Add person' } };
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  var inViewer = !!(window.claude && typeof window.claude.use === 'function');
  var FB = C.firebase || {};
  var fbConfigured = !!(FB.config && FB.config.apiKey && FB.config.projectId);
  var mode = 'local';
  var backend = null;                        // 'firebase' | 'artifact' (when mode === 'shared')
  var db = null, userNs = null, downloadsNs = null, meId = null, meName = null, fbAuth = null;
  var readOnly = false, isAdmin = true;

  var state = emptyState();
  var answerMeta = {};                       // qid -> { by, at } (shared mode)
  var views = { clients: { sort: null, dir: 1, filter: '' }, team: { sort: null, dir: 1, filter: '' } };
  var loaded = { clients: false, team: false, answers: false };
  var rendered = { clients: false, team: false };
  var saveTimer = null, pendingImport = null;

  // shared-mode write queue
  var pending = { clients: {}, team: {}, answers: {} };   // fields waiting to be sent
  var sending = { clients: {}, team: {}, answers: {} };   // fields in flight
  var creating = {};                                       // 'kind/id' -> promise of the initial set()
  var retries = {};
  var flushTimer = null, activeWrites = 0;

  /* ---------------- helpers ---------------- */
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    if (children != null) [].concat(children).forEach(function (c) {
      if (c == null) return;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return e;
  }

  function uid() { return 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { x = String(x == null ? '' : x).trim(); if (x && !seen[x.toLowerCase()]) { seen[x.toLowerCase()] = 1; out.push(x); } });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  function cols(kind) { return C.columns[kind]; }
  function colByKey(kind, key) { return cols(kind).filter(function (c) { return c.key === key; })[0]; }
  function opts(c) { return (c.options || []).map(function (o) { return typeof o === 'string' ? { value: o, label: o } : o; }); }
  function daysUntil(iso) { if (!iso) return null; var d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return null; var t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); }
  function byCreated(a, b) { return (a._created || 0) - (b._created || 0) || String(a.id).localeCompare(String(b.id)); }
  function findRow(kind, id) { return state[kind].filter(function (r) { return r.id === id; })[0]; }

  function fmtMoney(n, compact) {
    if (n == null || isNaN(n)) return '—';
    try {
      return new Intl.NumberFormat(C.locale, { style: 'currency', currency: C.currency || 'USD', maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard' }).format(n);
    } catch (e) { return String(Math.round(n)); }
  }
  function fmtPct(n, d) { return n == null || isNaN(n) ? '—' : n.toFixed(d == null ? 1 : d) + '%'; }
  function fmtComputed(c, v) {
    if (c.format === 'percent') return fmtPct(v);
    if (c.format === 'currency') return fmtMoney(v);
    return v == null ? '—' : String(v);
  }
  function fmtWhen(ms) {
    var d = new Date(ms);
    if (isNaN(d)) return '';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function computedValue(kind, c, row) { return c.compute ? c.compute(row, state[kind]) : null; }

  function runLimited(tasks, n) {
    var i = 0;
    function worker() { if (i >= tasks.length) return Promise.resolve(); var t = tasks[i++]; return t().then(worker); }
    var ws = [];
    for (var k = 0; k < Math.min(n, tasks.length); k++) ws.push(worker());
    return Promise.all(ws);
  }

  /* ---------------- UI chrome: banners, toast, confirm dialog ---------------- */
  function buildChrome() {
    $('main').prepend(el('div', { id: 'banners' }));
    document.body.append(el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite', hidden: true }));
    document.body.append(el('div', { id: 'modal', class: 'modal-backdrop', hidden: true }, el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modalTitle' }, [
      el('h2', { id: 'modalTitle' }),
      el('p', { id: 'modalMsg' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', id: 'modalCancel' }, 'Cancel'),
        el('button', { class: 'btn primary', id: 'modalOk' }, 'OK')
      ])
    ])));
  }

  function banner(msg, tone, key) {
    key = key || 'b' + Math.random().toString(36).slice(2, 6);
    var host = $('#banners');
    var old = $('[data-banner="' + key + '"]', host);
    if (old) old.remove();
    if (msg) host.append(el('div', { class: 'banner tone-' + (tone || 'warn'), 'data-banner': key }, msg));
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }

  function askConfirm(title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var m = $('#modal'), ok = $('#modalOk'), cancel = $('#modalCancel');
      $('#modalTitle').textContent = title;
      $('#modalMsg').textContent = message;
      ok.textContent = okLabel || 'OK';
      ok.classList.toggle('danger', !!danger);
      m.hidden = false;
      cancel.focus();
      function done(v) {
        m.hidden = true;
        ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel);
        m.removeEventListener('click', onBackdrop); document.removeEventListener('keydown', onKey, true);
        resolve(v);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      function onBackdrop(e) { if (e.target === m) done(false); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel);
      m.addEventListener('click', onBackdrop); document.addEventListener('keydown', onKey, true);
    });
  }

  function setStatus(t, err) { var s = $('#saveStatus'); s.textContent = t; s.classList.toggle('err', !!err); }

  /* ---------------- state shape ---------------- */
  function emptyState() { return { version: 1, updatedAt: null, answers: {}, clients: [], team: [] }; }

  function normalize(s) {
    s = s || {};
    var out = emptyState();
    out.updatedAt = s.updatedAt || null;
    if (s.answers && typeof s.answers === 'object') {
      Object.keys(s.answers).forEach(function (k) { if (ID_RE.test(k)) out.answers[k] = String(s.answers[k] == null ? '' : s.answers[k]); });
    }
    var t0 = Date.now();
    KINDS.forEach(function (k) {
      out[k] = Array.isArray(s[k]) ? s[k].map(function (r, i) {
        var row = Object.assign({}, r);
        if (!row.id || !ID_RE.test(String(row.id))) row.id = uid();
        if (!row._created) row._created = t0 + i;
        return row;
      }) : [];
    });
    return out;
  }

  /* ---------------- local mode persistence ---------------- */
  function saveLocal() {
    clearTimeout(saveTimer); saveTimer = null;
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setStatus('Saved ' + new Date(state.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · this browser only');
    } catch (e) {
      setStatus('Not saved: browser storage unavailable. Export to keep your data.', true);
    }
    refreshDatalists();
  }
  function scheduleLocalSave() { setStatus('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 400); }

  function loadLocal() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    if (raw) {
      try { state = normalize(JSON.parse(raw)); return Promise.resolve(); } catch (e) { /* fall through */ }
    }
    return fetch('data/seed.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) state = normalize(j); })
      .catch(function () { /* no seed — start empty */ });
  }

  /* ---------------- mutations (both modes) ---------------- */
  function commitField(kind, row, key, value) {
    row[key] = value;
    if (mode === 'local') return scheduleLocalSave();
    var f = {}; f[key] = value;
    queueWrite(kind, row.id, f);
  }

  function commitAnswer(qid, text) {
    state.answers[qid] = text;
    if (mode === 'local') return scheduleLocalSave();
    queueWrite('answers', qid, { text: text });
  }

  // Who/when stamp on every shared write. Firebase has no profile lookup, so it also stores the name.
  function authorMeta() {
    var m = { _by: meId, _at: Date.now() };
    if (backend === 'firebase') m._byName = meName || null;
    return m;
  }

  function errCode(e) {
    return String((e && e.code) || '').replace(/^firestore\//, '').replace(/-/g, '_');
  }

  function docBody(row) {
    var b = Object.assign({}, row);
    delete b.id;
    return Object.assign(b, authorMeta());
  }

  function createRows(kind, rows) {
    var t0 = Date.now();
    rows.forEach(function (r, i) { if (!r._created) r._created = t0 + i; state[kind].push(r); });
    state[kind].sort(byCreated);
    if (mode === 'local') { saveLocal(); return Promise.resolve(); }
    setStatus('Saving…');
    return runLimited(rows.map(function (r) {
      return function () {
        var key = kind + '/' + r.id;
        var p = db.collection(kind).doc(r.id).set(docBody(r));
        creating[key] = p;
        return p.then(function () { delete creating[key]; }, function (e) { delete creating[key]; handleWriteError(e, kind, r.id); });
      };
    }), 5).then(updateSaveStatus);
  }

  function removeRow(kind, id) {
    state[kind] = state[kind].filter(function (r) { return r.id !== id; });
    if (mode === 'local') return saveLocal();
    delete pending[kind][id];
    var before = creating[kind + '/' + id] || Promise.resolve();
    before.then(function () { return db.collection(kind).doc(id).delete(); })
      .catch(function (e) { handleWriteError(e, kind, null); });
  }

  function replaceAll(ns) {
    if (mode === 'local') { state = ns; saveLocal(); renderAll(); return Promise.resolve(); }
    pending = { clients: {}, team: {}, answers: {} };
    setStatus('Replacing shared data…');
    var dels = [];
    KINDS.forEach(function (k) { state[k].forEach(function (r) { dels.push(function () { return db.collection(k).doc(r.id).delete(); }); }); });
    Object.keys(state.answers).forEach(function (q) { dels.push(function () { return db.collection('answers').doc(q).delete(); }); });
    var creates = [];
    KINDS.forEach(function (k) { ns[k].forEach(function (r) { creates.push(function () { return db.collection(k).doc(r.id).set(docBody(r)); }); }); });
    Object.keys(ns.answers).forEach(function (q) {
      if (String(ns.answers[q]).trim()) creates.push(function () { return db.collection('answers').doc(q).set(Object.assign({ text: ns.answers[q] }, authorMeta())); });
    });
    return runLimited(dels, 5)
      .then(function () { return runLimited(creates, 5); })
      .then(function () { toast('Shared data replaced'); }, function (e) { handleWriteError(e); })
      .then(updateSaveStatus);
  }

  /* ---------------- shared mode: write queue ---------------- */
  function queueWrite(kind, id, fields) {
    pending[kind][id] = Object.assign(pending[kind][id] || {}, fields);
    setStatus('Saving…');
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 600);
  }

  function flush() {
    clearTimeout(flushTimer); flushTimer = null;
    ['clients', 'team', 'answers'].forEach(function (kind) {
      Object.keys(pending[kind]).forEach(function (id) { sendDoc(kind, id); });
    });
  }

  // One write at a time per document; later edits wait for the one in flight.
  function sendDoc(kind, id) {
    if (sending[kind][id] || !pending[kind][id]) return;
    var fields = pending[kind][id];
    delete pending[kind][id];
    sending[kind][id] = fields;
    activeWrites++;
    var key = kind + '/' + id;
    var ref = db.collection(kind).doc(id);
    var meta = authorMeta();
    var before = creating[key] || Promise.resolve();
    before.then(function () {
      return kind === 'answers' ? ref.set(Object.assign({}, fields, meta)) : ref.update(Object.assign({}, fields, meta));
    }).then(function () {
      delete retries[key];
    }, function (e) {
      if (errCode(e) === 'unavailable' && (retries[key] || 0) < 3) {
        retries[key] = (retries[key] || 0) + 1;
        pending[kind][id] = Object.assign({}, fields, pending[kind][id] || {});
        setTimeout(flush, 1000 + Math.random() * 1500);
      } else {
        handleWriteError(e, kind, id);
      }
    }).then(function () {
      delete sending[kind][id];
      activeWrites--;
      if (pending[kind][id] && !flushTimer) sendDoc(kind, id);
      updateSaveStatus();
    });
  }

  function hasUnsaved() {
    if (mode === 'local') return !!saveTimer;
    return activeWrites > 0 || ['clients', 'team', 'answers'].some(function (k) { return Object.keys(pending[k]).length > 0; });
  }

  function updateSaveStatus() {
    if (mode !== 'shared' || readOnly) return;
    if (hasUnsaved()) return setStatus('Saving…');
    if (!loaded.clients || !loaded.team || !loaded.answers) return setStatus('Connecting…');
    setStatus('All changes saved · shared');
  }

  function handleWriteError(e, kind, id) {
    var code = errCode(e);
    if (code === 'not_found') return; // updated a row someone else deleted (Firestore)
    if (code === 'invalid_argument' || code === 'transform_error' || code === 'permission_denied' || code === 'unauthenticated') {
      if (kind && kind !== 'answers' && id && !findRow(kind, id)) return; // someone else deleted that row
      setReadOnly(true, backend === 'firebase'
        ? 'Your changes could not be saved because your account does not have write access. Ask the admin to add your email to the Firestore rules.'
        : 'Your changes could not be saved because you have view-only access. Ask the owner to give you Contributor access.');
    } else if (code === 'quota_exceeded') {
      banner('The shared store is full (' + (e.message || 'quota reached') + '). Delete unused rows to make room.', 'bad', 'quota');
    } else if (code === 'revoked') {
      setReadOnly(true, 'Your access to this shared data was withdrawn.');
    } else if (code === 'resource_exhausted') {
      if (backend === 'firebase') { banner('The Firebase free-tier quota is used up for today, so changes are not being saved. Try again tomorrow or upgrade the Firebase plan.', 'bad', 'quota'); updateSaveStatus(); return; }
      banner('Too many changes at once. Wait a few seconds, then make your last edit again.', 'warn', 'rate');
    } else {
      banner('A change could not be saved (' + (code || 'unknown error') + '). Check your connection and make the edit again.', 'warn', 'save');
    }
    updateSaveStatus();
  }

  function setReadOnly(flag, msg) {
    readOnly = flag;
    if (msg) banner(msg, 'bad', 'readonly');
    if (flag) setStatus('View only');
    applyReadOnly();
    updateMenu();
  }

  function applyReadOnly() {
    document.body.classList.toggle('read-only', readOnly);
    $$('main input:not(.search), main select, main textarea').forEach(function (e) { e.disabled = readOnly; });
  }

  function updateMenu() {
    var adminOnly = mode === 'shared' && (!isAdmin || readOnly);
    $$('[data-action="import-json"], [data-action="reset"]').forEach(function (b) { b.hidden = adminOnly; });
    var hr = $('#dataMenu hr'); if (hr) hr.hidden = adminOnly;
    var r = $('[data-action="reset"]');
    if (r) r.textContent = mode === 'shared' ? 'Clear all shared data…' : 'Clear all data…';
  }

  /* ---------------- shared mode: live subscriptions ---------------- */
  function subscribe() {
    var timer = setTimeout(function () {
      if (!(loaded.clients && loaded.team && loaded.answers)) banner('Still connecting to the shared data. What you see may be incomplete or out of date.', 'warn', 'conn');
    }, 10000);
    function markLoaded(k, snap) {
      if (snap.metadata.fromCache) return;
      if (!loaded[k]) {
        loaded[k] = true;
        if (k !== 'answers') renderTableKeepFocus(k);
      }
      if (loaded.clients && loaded.team && loaded.answers) { clearTimeout(timer); banner(null, null, 'conn'); }
      updateSaveStatus();
    }
    function listen(k, apply, attempt) {
      db.collection(k).onSnapshot(function (snap) { apply(snap); markLoaded(k, snap); }, function (e) {
        clearTimeout(timer);
        var code = errCode(e);
        if (code === 'revoked') return setReadOnly(true, 'Your access to this shared data was withdrawn.');
        if (code === 'permission_denied' || code === 'unauthenticated') {
          banner(null, null, 'conn');
          return setReadOnly(true, 'Your account (' + (meName || 'this account') + ') does not have access to this assessment. Ask the admin to add your email, or sign out and use another account.');
        }
        if (code === 'unavailable' && attempt < 2) return setTimeout(function () { listen(k, apply, attempt + 1); }, 3000);
        banner('Lost the live connection to the shared data. Reopen the page to reconnect.', 'bad', 'conn');
      });
    }
    KINDS.forEach(function (k) { listen(k, function (snap) { applyRows(k, snap); }, 0); });
    listen('answers', applyAnswers, 0);
  }

  function applyRows(kind, snap) {
    var before = {};
    state[kind].forEach(function (r) { before[r.id] = r; });
    var seen = {};
    var rows = snap.docs.map(function (d) {
      seen[d.id] = 1;
      var r = Object.assign({}, d.data(), sending[kind][d.id] || {}, pending[kind][d.id] || {});
      r.id = d.id;
      return r;
    });
    // keep rows this view just created that the store hasn't echoed yet
    state[kind].forEach(function (r) { if (!seen[r.id] && creating[kind + '/' + r.id]) rows.push(r); });
    rows.sort(byCreated);
    var structural = rows.length !== state[kind].length || rows.some(function (r) { return !before[r.id]; });
    state[kind] = rows;
    if (structural || !rendered[kind]) renderTableKeepFocus(kind);
    else {
      snap.docChanges().forEach(function (c) { if (c.type === 'modified') patchRow(kind, c.doc.id); });
      refreshComputed(kind);
      renderSummary(kind);
    }
    refreshDatalists();
  }

  function applyAnswers(snap) {
    var ids = {};
    snap.docs.forEach(function (d) {
      ids[d.id] = 1;
      var data = d.data() || {};
      var local = pending.answers[d.id] || sending.answers[d.id];
      state.answers[d.id] = local ? local.text : String(data.text == null ? '' : data.text);
      answerMeta[d.id] = { by: data._by || null, at: data._at || null, name: data._byName || '' };
    });
    Object.keys(state.answers).forEach(function (k) {
      if (!ids[k] && !pending.answers[k] && !sending.answers[k]) { delete state.answers[k]; delete answerMeta[k]; }
    });
    $$('#questions textarea[data-qid]').forEach(function (ta) {
      var v = state.answers[ta.dataset.qid] || '';
      if (ta !== document.activeElement && ta.value !== v) ta.value = v;
      ta.closest('.q').classList.toggle('answered', !!ta.value.trim());
    });
    updateProgress();
    renderAnswerMeta();
  }

  function renderAnswerMeta() {
    if (mode !== 'shared') return;
    var ids = uniq(Object.keys(answerMeta).map(function (k) { return answerMeta[k].by; }));
    var resolve = backend === 'artifact' && userNs && ids.length ? userNs.profiles(ids) : Promise.resolve({});
    resolve.then(function (ps) {
      $$('#questions [data-meta-for]').forEach(function (p) {
        var m = answerMeta[p.dataset.metaFor];
        if (!m || !m.at || !(state.answers[p.dataset.metaFor] || '').trim()) { p.textContent = ''; return; }
        var who = m.by && m.by === meId ? 'you'
          : backend === 'firebase' ? (m.name || 'someone')
          : m.by && ps[m.by] ? (ps[m.by].name || 'someone') : 'someone';
        p.textContent = 'Last edited by ' + who + ' · ' + fmtWhen(m.at);
      });
    });
  }

  /* ---------------- routing ---------------- */
  function route() {
    var tab = (location.hash || '#questions').slice(1);
    if (['questions', 'clients', 'team'].indexOf(tab) < 0) tab = 'questions';
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + tab; });
    $$('.tabs a').forEach(function (a) { a.classList.toggle('active', a.dataset.tab === tab); });
    requestAnimationFrame(function () { $$('#view-' + tab + ' .grid textarea').forEach(autosize); });
  }

  function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

  /* ---------------- questions ---------------- */
  function renderQuestions() {
    var host = $('#questions');
    host.innerHTML = '';
    var sections = [], byName = {};
    C.questions.forEach(function (q) {
      var name = q.section || 'Questions';
      if (!byName[name]) { byName[name] = { name: name, items: [] }; sections.push(byName[name]); }
      byName[name].items.push(q);
    });
    var n = 0;
    sections.forEach(function (sec) {
      var card = el('section', { class: 'q-section' }, el('h2', null, sec.name));
      sec.items.forEach(function (q) {
        n++;
        var id = 'q_' + q.id;
        var val = state.answers[q.id] || '';
        var wrap = el('div', { class: 'q' + (val.trim() ? ' answered' : '') }, [
          el('label', { for: id, class: 'q-label' }, [el('span', { class: 'q-num' }, n), el('span', null, q.text)]),
          q.hint ? el('p', { class: 'q-hint' }, q.hint) : null
        ]);
        var ta = el('textarea', { id: id, rows: 3, 'data-qid': q.id, placeholder: 'Your notes…' });
        ta.value = val;
        wrap.append(ta, el('p', { class: 'q-meta', 'data-meta-for': q.id }));
        card.append(wrap);
      });
      host.append(card);
    });
    updateProgress();
    renderAnswerMeta();
  }

  function updateProgress() {
    var total = C.questions.length;
    var done = C.questions.filter(function (q) { return (state.answers[q.id] || '').trim(); }).length;
    $('#progressFill').style.width = (total ? done / total * 100 : 0) + '%';
    $('#progressText').textContent = done + ' of ' + total + ' answered';
  }

  /* ---------------- tables ---------------- */
  function sortVal(kind, c, r) {
    var x = c.type === 'computed' ? computedValue(kind, c, r) : r[c.key];
    if (x === '' || x == null) return null;
    if (c.type === 'select') {
      var i = opts(c).map(function (o) { return o.value; }).indexOf(x);
      return i < 0 ? String(x) : i;
    }
    return x;
  }

  function visibleRows(kind) {
    var v = views[kind];
    var rows = state[kind].slice();
    var f = v.filter.trim().toLowerCase();
    if (f) {
      rows = rows.filter(function (r) {
        return cols(kind).some(function (c) {
          if (c.type === 'computed') return false;
          var x = r[c.key];
          if (c.type === 'select') { var o = opts(c).filter(function (o) { return o.value === x; })[0]; if (o) x = o.value + ' ' + o.label; }
          return x != null && String(x).toLowerCase().indexOf(f) >= 0;
        });
      });
    }
    if (v.sort) {
      var c = colByKey(kind, v.sort);
      rows.sort(function (a, b) {
        var x = sortVal(kind, c, a), y = sortVal(kind, c, b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        var d = (typeof x === 'number' && typeof y === 'number') ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
        return d * v.dir;
      });
    }
    return rows;
  }

  function renderTable(kind) {
    var table = $('#table-' + kind);
    var v = views[kind];
    var thead = table.tHead, tbody = table.tBodies[0];

    var hr = el('tr');
    cols(kind).forEach(function (c) {
      hr.append(el('th', {
        'data-key': c.key,
        class: (v.sort === c.key ? 'sorted ' : '') + (c.help ? 'has-help' : ''),
        style: 'min-width:' + (c.width || 140) + 'px;max-width:' + (c.width || 140) + 'px',
        title: c.help || 'Sort by ' + c.label
      }, [c.label, el('span', { class: 'sort' }, v.sort === c.key ? (v.dir > 0 ? '▲' : '▼') : '')]));
    });
    hr.append(el('th', { class: 'actions' }, ''));
    thead.innerHTML = '';
    thead.append(hr);

    var rows = visibleRows(kind);
    tbody.innerHTML = '';
    rows.forEach(function (row) { tbody.append(renderRow(kind, row)); });
    rendered[kind] = true;

    var empty = $('#empty-' + kind);
    if (mode === 'shared' && !loaded[kind] && !state[kind].length) {
      empty.textContent = 'Loading shared data…';
      empty.hidden = false;
    } else if (!state[kind].length) {
      empty.textContent = readOnly ? 'No ' + kind + ' have been added yet.'
        : 'Nothing here yet. Click “' + LABELS[kind].add + '” or use Import CSV. Export CSV on an empty table gives you a template.';
      empty.hidden = false;
    } else if (!rows.length) {
      empty.textContent = 'No rows match “' + v.filter + '”.';
      empty.hidden = false;
    } else empty.hidden = true;

    requestAnimationFrame(function () { $$('textarea', tbody).forEach(autosize); });
    renderSummary(kind);
    updateCounts();
    applyReadOnly();
  }

  function renderTableKeepFocus(kind) {
    var a = document.activeElement, info = null;
    if (a && a.closest && a.closest('#table-' + kind + ' tbody') && a.dataset.key) {
      info = { id: a.closest('tr').dataset.id, key: a.dataset.key, s: null, e: null };
      try { info.s = a.selectionStart; info.e = a.selectionEnd; } catch (err) { /* not a text field */ }
    }
    renderTable(kind);
    if (info) {
      var f = $('#table-' + kind + ' tr[data-id="' + info.id + '"] [data-key="' + info.key + '"]');
      if (f) { f.focus(); try { if (info.s != null) f.setSelectionRange(info.s, info.e); } catch (err) { /* ignore */ } }
    }
  }

  function renderRow(kind, row) {
    var tr = el('tr', { 'data-id': row.id });
    cols(kind).forEach(function (c) {
      tr.append(el('td', { 'data-col': c.key }, editor(kind, c, row)));
    });
    tr.append(el('td', { class: 'actions' }, [
      el('button', { class: 'icon-btn', 'data-action': 'dup-row', title: 'Duplicate row', 'aria-label': 'Duplicate row' }, '⧉'),
      el('button', { class: 'icon-btn danger', 'data-action': 'del-row', title: 'Delete row', 'aria-label': 'Delete row' }, '✕')
    ]));
    return tr;
  }

  function editor(kind, c, row) {
    var val = row[c.key] == null ? '' : row[c.key];
    var base = { 'data-key': c.key, 'aria-label': c.label, placeholder: c.placeholder || null };
    var e;
    switch (c.type) {
      case 'computed':
        return el('span', { class: 'computed', 'data-computed': c.key }, fmtComputed(c, computedValue(kind, c, row)));
      case 'select':
        e = el('select', base, el('option', { value: '' }, '—'));
        opts(c).forEach(function (o) { e.append(el('option', { value: o.value }, o.label)); });
        ensureOption(e, val);
        e.value = val;
        applyTone(e, c);
        return e;
      case 'textarea':
        e = el('textarea', Object.assign({ rows: 1 }, base));
        e.value = val;
        return e;
      case 'number': case 'currency': case 'percent':
        e = el('input', Object.assign({ type: 'number', step: c.step || 'any', min: c.min, max: c.max }, base));
        if (c.type === 'currency' && !c.placeholder) e.placeholder = C.currency || '';
        if (c.type === 'percent' && !c.placeholder) e.placeholder = '%';
        e.value = val;
        return e;
      case 'date':
        e = el('input', Object.assign({ type: 'date' }, base));
        e.value = val;
        return e;
      default:
        e = el('input', Object.assign({ type: 'text', list: c.suggest || null, autocomplete: 'off' }, base));
        e.value = val;
        return e;
    }
  }

  function ensureOption(sel, val) {
    if (val === '' || val == null) return;
    var exists = Array.prototype.some.call(sel.options, function (o) { return o.value === String(val); });
    if (!exists) sel.append(el('option', { value: val }, val));
  }

  function applyTone(sel, c) {
    var o = opts(c).filter(function (o) { return o.value === sel.value; })[0];
    if (o && o.tone) sel.setAttribute('data-tone', o.tone); else sel.removeAttribute('data-tone');
  }

  // Update one row's cells in place after someone else's edit, leaving the focused cell alone.
  function patchRow(kind, id) {
    var tr = $('#table-' + kind + ' tbody tr[data-id="' + id + '"]');
    var row = findRow(kind, id);
    if (!tr || !row) return;
    cols(kind).forEach(function (c) {
      if (c.type === 'computed') return;
      var f = $('[data-key="' + c.key + '"]', tr);
      if (!f || f === document.activeElement) return;
      var v = row[c.key] == null ? '' : String(row[c.key]);
      if (f.value === v) return;
      if (c.type === 'select') { ensureOption(f, v); f.value = v; applyTone(f, c); }
      else { f.value = v; if (f.tagName === 'TEXTAREA') autosize(f); }
    });
  }

  function refreshComputed(kind) {
    $$('#table-' + kind + ' [data-computed]').forEach(function (span) {
      var row = findRow(kind, span.closest('tr').dataset.id);
      var c = colByKey(kind, span.dataset.computed);
      if (row && c) span.textContent = fmtComputed(c, computedValue(kind, c, row));
    });
  }

  function onCellInput(kind, e) {
    if (readOnly) return;
    var t = e.target, key = t.dataset.key;
    if (!key) return;
    var row = findRow(kind, t.closest('tr').dataset.id);
    var c = colByKey(kind, key);
    if (!row || !c) return;
    var v = t.value;
    if (NUMERIC.indexOf(c.type) >= 0) { var n = num(v); v = n == null ? '' : n; }
    if (c.type === 'select') applyTone(t, c);
    if (t.tagName === 'TEXTAREA') autosize(t);
    commitField(kind, row, key, v);
    refreshComputed(kind);
    renderSummary(kind);
  }

  function addRow(kind) {
    if (readOnly) return;
    var row = { id: uid() };
    views[kind].filter = '';
    $('[data-filter="' + kind + '"]').value = '';
    createRows(kind, [row]);
    renderTable(kind);
    var tr = $('#table-' + kind + ' tr[data-id="' + row.id + '"]');
    if (tr) { tr.scrollIntoView({ block: 'nearest' }); var f = $('input,select,textarea', tr); if (f) f.focus(); }
  }

  function deleteRow(kind, id) {
    var row = findRow(kind, id);
    if (!row || readOnly) return;
    var name = row[cols(kind)[0].key] || 'this ' + LABELS[kind].one;
    askConfirm('Delete ' + LABELS[kind].one + '?', '“' + name + '” will be removed' + (mode === 'shared' ? ' for everyone' : '') + '. This cannot be undone.', 'Delete', true)
      .then(function (ok) {
        if (!ok) return;
        removeRow(kind, id);
        renderTable(kind);
        toast('Deleted ' + name);
      });
  }

  function duplicateRow(kind, id) {
    var src = findRow(kind, id);
    if (!src || readOnly) return;
    var copy = Object.assign({}, src, { id: uid(), _created: (src._created || Date.now()) + 0.5 });
    delete copy._by; delete copy._at;
    var k = cols(kind)[0].key;
    if (copy[k]) copy[k] = copy[k] + ' (copy)';
    createRows(kind, [copy]);
    renderTable(kind);
  }

  function updateCounts() {
    KINDS.forEach(function (k) { $('#count-' + k).textContent = state[k].length || ''; });
  }

  /* ---------------- summaries ---------------- */
  function card(label, value, sub) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-label' }, label),
      el('div', { class: 'card-value' }, value),
      sub ? el('div', { class: 'card-sub' }, sub) : null
    ]);
  }
  function pill(text, tone) { return el('span', { class: 'pill tone-' + tone }, text); }
  function countBy(rows, key, val) { return rows.filter(function (r) { return r[key] === val; }).length; }

  function renderSummary(kind) {
    var host = $('#summary-' + kind);
    host.innerHTML = '';
    var rows = state[kind];
    if (!rows.length) return;
    if (kind === 'clients') summaryClients(host, rows); else summaryTeam(host, rows);
  }

  function summaryClients(host, rows) {
    var gms = rows.map(function (r) { return num(r.grossMargin); }).filter(function (x) { return x != null; });
    var avgGm = gms.length ? gms.reduce(function (a, b) { return a + b; }, 0) / gms.length : null;
    var renewals = rows.filter(function (r) { var d = daysUntil(r.contractEnd); return d != null && d <= 90; });
    var escal = rows.filter(function (r) { return String(r.escalations || '').trim(); }).length;

    host.append(
      card('Active clients', rows.length,
        countBy(rows, 'tier', 'Strategic') + ' strategic · ' + countBy(rows, 'tier', 'Growth') + ' growth · ' + countBy(rows, 'tier', 'Maintain') + ' maintain'),
      card('Avg gross margin', fmtPct(avgGm), gms.length + ' of ' + rows.length + ' clients reported'),
      card('Health', [pill('G ' + countBy(rows, 'health', 'G'), 'good'), pill('A ' + countBy(rows, 'health', 'A'), 'warn'), pill('R ' + countBy(rows, 'health', 'R'), 'bad')]),
      card('Renewals ≤ 90 days', renewals.length, renewals.length ? renewals.map(function (r) { return r.client || '(unnamed)'; }).slice(0, 3).join(', ') + (renewals.length > 3 ? '…' : '') : 'Includes lapsed contracts'),
      card('With open escalations', escal)
    );
  }

  function summaryTeam(host, rows) {
    var billable = countBy(rows, 'billable', 'Yes'), partial = countBy(rows, 'billable', 'Partial');
    var allocs = rows.map(function (r) { return num(r.allocation); }).filter(function (x) { return x != null; });
    var avgAlloc = allocs.length ? allocs.reduce(function (a, b) { return a + b; }, 0) / allocs.length : null;
    var ai = rows.map(function (r) { return num(r.aiFluency); }).filter(function (x) { return x != null; });
    var avgAi = ai.length ? ai.reduce(function (a, b) { return a + b; }, 0) / ai.length : null;
    var cost = rows.reduce(function (s, r) { return s + (num(r.costRate) || 0); }, 0);
    var rolling = rows.filter(function (r) { var d = daysUntil(r.rollOff); return d != null && d >= 0 && d <= 30; });
    var high = rows.filter(function (r) { return r.flightRisk === 'H'; });

    host.append(
      card('Headcount', rows.length, uniq(rows.map(function (r) { return r.location; })).length + ' locations'),
      card('Billable', billable + (partial ? ' + ' + partial : ''), (rows.length ? Math.round(billable / rows.length * 100) : 0) + '% fully billable' + (partial ? ', ' + partial + ' partial' : '')),
      card('Avg allocation', fmtPct(avgAlloc, 0)),
      card('Rolling off ≤ 30 days', rolling.length, rolling.map(function (r) { return r.name; }).filter(Boolean).slice(0, 3).join(', ') || null),
      card('High flight risk', high.length ? pill(high.length, 'bad') : 0, high.map(function (r) { return r.name; }).filter(Boolean).slice(0, 3).join(', ') || null),
      card('Avg AI fluency', avgAi == null ? '—' : avgAi.toFixed(1) + ' / 5'),
      card('Monthly cost', fmtMoney(cost, true), fmtMoney(cost * 12, true) + ' annualised')
    );
  }

  /* ---------------- datalists (autocomplete) ---------------- */
  function refreshDatalists() {
    var projects = [];
    state.clients.forEach(function (r) {
      String(r.projects || '').split(/[,;\n]/).forEach(function (p) { projects.push(p); });
    });
    var lists = {
      'dl-people': state.team.map(function (r) { return r.name; }),
      'dl-locations': state.team.map(function (r) { return r.location; }),
      'dl-roles': state.team.map(function (r) { return r.role; }),
      'dl-skills': state.team.map(function (r) { return r.primarySkill; }),
      'dl-projects': projects.concat(state.team.map(function (r) { return r.currentProject; })).concat(['Bench', 'Internal'])
    };
    var host = $('#datalists');
    host.innerHTML = '';
    Object.keys(lists).forEach(function (id) {
      var dl = el('datalist', { id: id });
      uniq(lists[id]).forEach(function (v) { dl.append(el('option', { value: v })); });
      host.append(dl);
    });
  }

  /* ---------------- import / export ---------------- */
  function download(name, text, type) {
    if (inViewer) {
      if (!downloadsNs) { toast('Saving files is not available in this view.'); return; }
      downloadsNs.save({ filename: name, data: text })
        .then(function () { toast('Saved ' + name); })
        .catch(function (e) {
          if (e && e.code === 'declined') return;
          toast(e && e.code === 'rate_limited' ? 'A save prompt is already open.' : 'Could not save the file (' + ((e && e.code) || 'error') + ').');
        });
      return;
    }
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function stamp() { return new Date().toISOString().slice(0, 10); }

  function csvEsc(v) { var s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  function exportCSV(kind) {
    var cs = cols(kind);
    var lines = [cs.map(function (c) { return csvEsc(c.label); }).join(',')];
    state[kind].forEach(function (r) {
      lines.push(cs.map(function (c) {
        var x = c.type === 'computed' ? computedValue(kind, c, r) : r[c.key];
        if (c.type === 'computed' && typeof x === 'number') x = Math.round(x * 10) / 10;
        return csvEsc(x);
      }).join(','));
    });
    download(kind + '-' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (ch !== '\r') f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
  }

  function normHeader(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function coerce(c, raw) {
    var s = String(raw).trim();
    if (!s) return '';
    if (NUMERIC.indexOf(c.type) >= 0) {
      var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
      return isFinite(n) ? n : '';
    }
    if (c.type === 'date') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      var d = new Date(s);
      if (isNaN(d)) return s;
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    if (c.type === 'select') {
      var low = s.toLowerCase();
      var o = opts(c).filter(function (o) { return o.value.toLowerCase() === low || o.label.toLowerCase() === low; })[0];
      if (!o) o = opts(c).filter(function (o) { return o.label.toLowerCase().indexOf(low) === 0 || low.indexOf(o.value.toLowerCase()) === 0; })[0];
      return o ? o.value : s;
    }
    return s;
  }

  function importCSV(kind, text) {
    var rows = parseCSV(text);
    if (rows.length < 2) { toast('That CSV has no data rows.'); return; }
    var map = rows[0].map(function (h) {
      var n = normHeader(h);
      return cols(kind).filter(function (c) { return c.type !== 'computed' && (normHeader(c.label) === n || normHeader(c.key) === n); })[0] || null;
    });
    if (!map.some(Boolean)) { toast('None of the CSV headers match this table. Use Export CSV to get a template with the expected headers.', 6000); return; }
    var newRows = rows.slice(1).map(function (r) {
      var row = { id: uid() };
      map.forEach(function (c, i) { if (c && r[i] != null) row[c.key] = coerce(c, r[i]); });
      return row;
    });
    createRows(kind, newRows).then(function () { renderTableKeepFocus(kind); });
    renderTable(kind);
    var skipped = rows[0].filter(function (h, i) { return !map[i] && String(h).trim(); });
    toast('Imported ' + newRows.length + ' row(s).' + (skipped.length ? ' Ignored columns: ' + skipped.join(', ') : ''), 6000);
  }

  function exportJSON() {
    var out = { version: 1, exportedAt: new Date().toISOString(), answers: state.answers, clients: state.clients, team: state.team };
    download('org-assessment-' + stamp() + '.json', JSON.stringify(out, null, 2), 'application/json');
  }

  function importJSON(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { toast('That file is not valid JSON.'); return; }
    var ns = normalize(parsed);
    askConfirm('Replace all data?',
      'This replaces every answer, client and team row' + (mode === 'shared' ? ' for everyone' : '') + ' with the backup (' + ns.clients.length + ' clients, ' + ns.team.length + ' people). Export a backup first if you might need the current data.',
      'Replace', true)
      .then(function (ok) { if (ok) replaceAll(ns); });
  }

  function pickFile(kind, accept) {
    pendingImport = kind;
    var fi = $('#fileInput');
    fi.accept = accept;
    fi.value = '';
    fi.click();
  }

  /* ---------------- wiring ---------------- */
  function renderAll() {
    renderQuestions();
    KINDS.forEach(renderTable);
    refreshDatalists();
    applyReadOnly();
    route();
  }

  function bind() {
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', function () { if (mode === 'local' && saveTimer) saveLocal(); if (mode === 'shared') flush(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'shared') flush(); });

    $('#questions').addEventListener('input', function (e) {
      var t = e.target;
      if (!t.dataset.qid || readOnly) return;
      t.closest('.q').classList.toggle('answered', !!t.value.trim());
      commitAnswer(t.dataset.qid, t.value);
      updateProgress();
    });

    KINDS.forEach(function (kind) {
      var table = $('#table-' + kind);
      table.tBodies[0].addEventListener('input', function (e) { onCellInput(kind, e); });
      table.tBodies[0].addEventListener('click', function (e) {
        var b = e.target.closest('button[data-action]');
        if (!b) return;
        var id = b.closest('tr').dataset.id;
        if (b.dataset.action === 'del-row') deleteRow(kind, id);
        if (b.dataset.action === 'dup-row') duplicateRow(kind, id);
      });
      table.tHead.addEventListener('click', function (e) {
        var th = e.target.closest('th[data-key]');
        if (!th) return;
        var v = views[kind], key = th.dataset.key;
        if (v.sort !== key) { v.sort = key; v.dir = 1; }
        else if (v.dir === 1) v.dir = -1;
        else { v.sort = null; v.dir = 1; }
        renderTable(kind);
      });
      $('[data-filter="' + kind + '"]').addEventListener('input', function (e) {
        views[kind].filter = e.target.value;
        renderTable(kind);
      });
    });

    document.addEventListener('click', function (e) {
      var menu = $('#dataMenu');
      if (e.target.closest('#dataMenuBtn')) { menu.hidden = !menu.hidden; return; }
      if (!e.target.closest('.menu')) menu.hidden = true;

      var b = e.target.closest('button[data-action]');
      if (!b || b.closest('tbody') || b.closest('.modal')) return;
      var kind = b.dataset.kind;
      menu.hidden = true;
      switch (b.dataset.action) {
        case 'add-row': addRow(kind); break;
        case 'export-csv': exportCSV(kind); break;
        case 'import-csv': if (!readOnly) pickFile(kind, '.csv,text/csv'); break;
        case 'export-json': exportJSON(); break;
        case 'import-json': pickFile('json', '.json,application/json'); break;
        case 'reset':
          askConfirm('Clear all data?',
            mode === 'shared' ? 'This deletes every answer, client and team row for everyone using this assessment. Export a backup first if you might need it.'
              : 'This deletes all answers, clients and team data stored in this browser. Export a backup first if you might need it.',
            'Clear everything', true)
            .then(function (ok) { if (ok) replaceAll(emptyState()); });
          break;
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('#dataMenu').hidden = true; });

    $('#fileInput').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var target = pendingImport;
      var reader = new FileReader();
      reader.onload = function () { if (target === 'json') importJSON(String(reader.result)); else importCSV(target, String(reader.result)); };
      reader.onerror = function () { toast('Could not read that file.'); };
      reader.readAsText(file);
    });
  }

  function setIntro(text) { var p = $('#questionsIntro'); if (p) p.textContent = text; }

  function startLocal(notice) {
    mode = 'local';
    loaded = { clients: true, team: true, answers: true };
    if (notice) banner(notice, 'warn', 'mode');
    setIntro('Answers save automatically in this browser only. Use Data → Export to back them up or share them.');
    return loadLocal().then(function () {
      renderAll();
      updateMenu();
      setStatus(state.updatedAt ? 'Last saved ' + new Date(state.updatedAt).toLocaleString() + ' · this browser only' : 'Saved in this browser only');
    });
  }

  /* ---------------- Firebase backend (GitHub Pages) ---------------- */

  // Wraps Firestore (compat SDK) in the same small surface the shared-mode code uses.
  function firestoreAdapter(fs) {
    return {
      collection: function (name) {
        var c = fs.collection(name);
        return {
          doc: function (id) {
            var d = c.doc(id);
            return {
              set: function (x) { return d.set(x); },
              update: function (x) { return d.update(x); },
              delete: function () { return d.delete(); }
            };
          },
          onSnapshot: function (next, err) { return c.onSnapshot({ includeMetadataChanges: true }, next, err); }
        };
      }
    };
  }

  function showSignIn(message) {
    var gate = $('#signin');
    if (!gate) {
      gate = el('div', { id: 'signin', class: 'modal-backdrop signin' }, el('div', { class: 'modal' }, [
        el('h2', null, 'Sign in to continue'),
        el('p', { id: 'signinMsg' }),
        el('div', { class: 'modal-actions' }, el('button', { class: 'btn primary', id: 'signinBtn' }, 'Sign in with Google'))
      ]));
      document.body.append(gate);
      $('#signinBtn').addEventListener('click', signIn);
    }
    $('#signinMsg').textContent = message || 'This assessment holds confidential client and team data. Sign in with your work Google account to view and edit it.';
    gate.hidden = false;
  }

  function signIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    fbAuth.signInWithPopup(provider).catch(function (e) {
      var code = String(e && e.code || '');
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return fbAuth.signInWithRedirect(provider);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/unauthorized-domain') return showSignIn('Sign-in is not enabled for ' + location.hostname + '. The admin needs to add it under Firebase → Authentication → Settings → Authorized domains.');
      showSignIn('Sign-in failed (' + (code || 'unknown error') + '). Try again.');
    });
  }

  function showUserChip(email) {
    var host = $('.topbar-actions');
    var chip = $('#userChip');
    if (!chip) {
      chip = el('div', { id: 'userChip', class: 'user-chip' }, [
        el('span', { id: 'userEmail' }),
        el('button', { class: 'btn', id: 'signOutBtn' }, 'Sign out')
      ]);
      host.insertBefore(chip, $('.menu', host));
      $('#signOutBtn').addEventListener('click', function () {
        flush();
        fbAuth.signOut().then(function () { location.reload(); });
      });
    }
    $('#userEmail').textContent = email;
  }

  function startFirebase() {
    mode = 'shared';
    backend = 'firebase';
    isAdmin = false;
    updateMenu();
    setStatus('Signing in…');
    setIntro('Everyone signed in to this assessment sees and edits the same answers. Changes save automatically.');
    renderAll();
    try {
      if (!firebase.apps.length) firebase.initializeApp(FB.config);
      fbAuth = firebase.auth();
      db = firestoreAdapter(firebase.firestore());
    } catch (e) {
      return startLocal('Could not start Firebase (' + (e && e.message || 'configuration error') + '). Check the firebase settings in js/config.js. Anything you type stays in this browser only.');
    }
    fbAuth.getRedirectResult().catch(function (e) { showSignIn('Sign-in failed (' + ((e && e.code) || 'unknown error') + '). Try again.'); });
    var started = false;
    fbAuth.onAuthStateChanged(function (u) {
      if (!u) { setStatus('Signed out'); showSignIn(); return; }
      var gate = $('#signin'); if (gate) gate.hidden = true;
      if (started) return;
      started = true;
      meId = u.uid;
      meName = u.displayName || u.email || '';
      var email = String(u.email || '').toLowerCase();
      isAdmin = (FB.admins || []).some(function (a) { return String(a).toLowerCase() === email; });
      showUserChip(u.email || meName);
      setStatus('Connecting…');
      updateMenu();
      subscribe();
    });
  }

  /* ---------------- claude.ai Artifact backend ---------------- */
  function startShared() {
    mode = 'shared';
    backend = 'artifact';
    setStatus('Connecting…');
    setIntro('Everyone with access to this page sees and edits the same answers. Changes save automatically.');
    renderAll();
    Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('downloads')]).then(function (r) {
      db = r[0]; userNs = r[1]; downloadsNs = r[2];
      if (!db) return startLocal('Shared data is not available in this view (you may be signed out, or lack access). Anything you type stays in this browser only.');
      var facts = userNs ? Promise.all([userNs.id(), userNs.can('data.write'), userNs.canEdit()]) : Promise.resolve([null, null, false]);
      return facts.then(function (u) {
        meId = u[0];
        isAdmin = !!u[2];
        if (u[1] === false) setReadOnly(true, 'You have view-only access. Ask the owner to give you Contributor access to add or edit data.');
        updateMenu();
        subscribe();
      });
    }).catch(function () {
      startLocal('Could not connect to the shared data. Anything you type stays in this browser only.');
    });
  }

  function init() {
    document.title = C.appTitle || document.title;
    $('#appTitle').textContent = C.appTitle || 'Org Assessment';
    buildChrome();
    bind();
    if (inViewer) startShared();
    else if (fbConfigured && window.firebase) startFirebase();
    else if (fbConfigured) startLocal('Could not load Firebase (check your internet connection or ad blocker). Anything you type stays in this browser only.');
    else startLocal();
  }

  init();
})();
