(function () {
  'use strict';

  var C = window.APP_CONFIG;
  var KEY = C.storageKey || 'org-assessment-v1';
  var KINDS = ['clients', 'team'];
  var NUMERIC = ['number', 'currency', 'percent'];
  var LABELS = { clients: { one: 'client', add: '+ Add client' }, team: { one: 'person', add: '+ Add person' } };

  var state = emptyState();
  var views = { clients: { sort: null, dir: 1, filter: '' }, team: { sort: null, dir: 1, filter: '' } };
  var saveTimer = null;
  var pendingImport = null;

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
  function computedValue(kind, c, row) { return c.compute ? c.compute(row, state[kind]) : null; }

  /* ---------------- persistence ---------------- */
  function emptyState() { return { version: 1, updatedAt: null, answers: {}, clients: [], team: [] }; }

  function normalize(s) {
    s = s || {};
    var out = emptyState();
    out.updatedAt = s.updatedAt || null;
    out.answers = s.answers && typeof s.answers === 'object' ? s.answers : {};
    KINDS.forEach(function (k) {
      out[k] = Array.isArray(s[k]) ? s[k].map(function (r) { return Object.assign({}, r, { id: r.id || uid() }); }) : [];
    });
    return out;
  }

  function save() {
    clearTimeout(saveTimer); saveTimer = null;
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setStatus('Saved ' + new Date(state.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setStatus('Not saved: browser storage unavailable. Export to keep your data.', true);
    }
    refreshDatalists();
  }
  function scheduleSave() { setStatus('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  function setStatus(t, err) { var s = $('#saveStatus'); s.textContent = t; s.classList.toggle('err', !!err); }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    if (raw) {
      try { state = normalize(JSON.parse(raw)); return Promise.resolve(); } catch (e) { /* fall through */ }
    }
    // First visit in this browser: optionally load starter data committed to the repo
    return fetch('data/seed.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) state = normalize(j); })
      .catch(function () { /* opened via file:// or no seed — start empty */ });
  }

  /* ---------------- routing ---------------- */
  function route() {
    var tab = (location.hash || '#questions').slice(1);
    if (['questions', 'clients', 'team'].indexOf(tab) < 0) tab = 'questions';
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + tab; });
    $$('.tabs a').forEach(function (a) { a.classList.toggle('active', a.dataset.tab === tab); });
    // textareas can only be measured once visible
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
        wrap.append(ta);
        card.append(wrap);
      });
      host.append(card);
    });
    updateProgress();
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
        if (x == null) return 1;          // empties always last
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

    var empty = $('#empty-' + kind);
    if (!state[kind].length) {
      empty.textContent = 'Nothing here yet. Click “' + LABELS[kind].add + '” or use Import CSV (Export CSV on an empty table gives you a template).';
      empty.hidden = false;
    } else if (!rows.length) {
      empty.textContent = 'No rows match “' + v.filter + '”.';
      empty.hidden = false;
    } else empty.hidden = true;

    requestAnimationFrame(function () { $$('textarea', tbody).forEach(autosize); });
    renderSummary(kind);
    updateCounts();
  }

  function renderRow(kind, row) {
    var tr = el('tr', { 'data-id': row.id });
    cols(kind).forEach(function (c) {
      tr.append(el('td', { 'data-col': c.key }, editor(kind, c, row)));
    });
    tr.append(el('td', { class: 'actions' }, [
      el('button', { class: 'icon-btn', 'data-action': 'dup-row', title: 'Duplicate row' }, '⧉'),
      el('button', { class: 'icon-btn danger', 'data-action': 'del-row', title: 'Delete row' }, '✕')
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
        if (val !== '' && !opts(c).some(function (o) { return o.value === String(val); })) e.append(el('option', { value: val }, val));
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

  function applyTone(sel, c) {
    var o = opts(c).filter(function (o) { return o.value === sel.value; })[0];
    if (o && o.tone) sel.setAttribute('data-tone', o.tone); else sel.removeAttribute('data-tone');
  }

  function refreshComputed(kind) {
    $$('#table-' + kind + ' [data-computed]').forEach(function (span) {
      var row = findRow(kind, span.closest('tr').dataset.id);
      var c = colByKey(kind, span.dataset.computed);
      if (row && c) span.textContent = fmtComputed(c, computedValue(kind, c, row));
    });
  }

  function findRow(kind, id) { return state[kind].filter(function (r) { return r.id === id; })[0]; }

  function onCellInput(kind, e) {
    var t = e.target, key = t.dataset.key;
    if (!key) return;
    var row = findRow(kind, t.closest('tr').dataset.id);
    var c = colByKey(kind, key);
    if (!row || !c) return;
    var v = t.value;
    if (NUMERIC.indexOf(c.type) >= 0) { var n = num(v); v = n == null ? '' : n; }
    row[key] = v;
    if (c.type === 'select') applyTone(t, c);
    if (t.tagName === 'TEXTAREA') autosize(t);
    refreshComputed(kind);
    renderSummary(kind);
    scheduleSave();
  }

  function addRow(kind) {
    var row = { id: uid() };
    state[kind].push(row);
    views[kind].filter = '';
    $('[data-filter="' + kind + '"]').value = '';
    renderTable(kind);
    scheduleSave();
    var tr = $('#table-' + kind + ' tr[data-id="' + row.id + '"]');
    if (tr) { tr.scrollIntoView({ block: 'nearest' }); var f = $('input,select,textarea', tr); if (f) f.focus(); }
  }

  function deleteRow(kind, id) {
    var row = findRow(kind, id);
    if (!row) return;
    var name = row[cols(kind)[0].key] || 'this ' + LABELS[kind].one;
    if (!confirm('Delete “' + name + '”? This cannot be undone.')) return;
    state[kind] = state[kind].filter(function (r) { return r.id !== id; });
    renderTable(kind);
    save();
  }

  function duplicateRow(kind, id) {
    var i = state[kind].findIndex(function (r) { return r.id === id; });
    if (i < 0) return;
    var copy = Object.assign({}, state[kind][i], { id: uid() });
    var k = cols(kind)[0].key;
    if (copy[k]) copy[k] = copy[k] + ' (copy)';
    state[kind].splice(i + 1, 0, copy);
    renderTable(kind);
    save();
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
    var rev = 0, revWithGm = 0, gmWeighted = 0;
    rows.forEach(function (r) {
      var v = num(r.revenue) || 0, gm = num(r.grossMargin);
      rev += v;
      if (gm != null && v) { revWithGm += v; gmWeighted += v * gm; }
    });
    var top = rows.slice().sort(function (a, b) { return (num(b.revenue) || 0) - (num(a.revenue) || 0); })[0];
    var topShare = rev && top ? (num(top.revenue) || 0) / rev * 100 : null;
    var renewals = rows.filter(function (r) { var d = daysUntil(r.contractEnd); return d != null && d <= 90; });
    var escal = rows.filter(function (r) { return String(r.escalations || '').trim(); }).length;

    host.append(
      card('Active clients', rows.length,
        countBy(rows, 'tier', 'Strategic') + ' strategic · ' + countBy(rows, 'tier', 'Growth') + ' growth · ' + countBy(rows, 'tier', 'Maintain') + ' maintain'),
      card('Total annual revenue', fmtMoney(rev, true)),
      card('Weighted gross margin', revWithGm ? fmtPct(gmWeighted / revWithGm) : '—', 'Weighted by revenue'),
      card('Health', [pill('G ' + countBy(rows, 'health', 'G'), 'good'), pill('A ' + countBy(rows, 'health', 'A'), 'warn'), pill('R ' + countBy(rows, 'health', 'R'), 'bad')]),
      card('Renewals ≤ 90 days', renewals.length, renewals.length ? renewals.map(function (r) { return r.client || '(unnamed)'; }).slice(0, 3).join(', ') + (renewals.length > 3 ? '…' : '') : 'Includes lapsed contracts'),
      card('Largest client share', topShare == null ? '—' : fmtPct(topShare), top && top.client ? top.client : 'Concentration risk'),
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
    if (rows.length < 2) { alert('That CSV has no data rows.'); return; }
    var map = rows[0].map(function (h) {
      var n = normHeader(h);
      return cols(kind).filter(function (c) { return c.type !== 'computed' && (normHeader(c.label) === n || normHeader(c.key) === n); })[0] || null;
    });
    if (!map.some(Boolean)) { alert('None of the CSV column headers matched this table. Use Export CSV to get a template with the expected headers.'); return; }
    var added = 0;
    rows.slice(1).forEach(function (r) {
      var row = { id: uid() };
      map.forEach(function (c, i) { if (c && r[i] != null) row[c.key] = coerce(c, r[i]); });
      state[kind].push(row); added++;
    });
    renderTable(kind);
    save();
    var skipped = rows[0].filter(function (h, i) { return !map[i]; });
    alert('Imported ' + added + ' row(s).' + (skipped.length ? '\nIgnored columns: ' + skipped.join(', ') : ''));
  }

  function exportJSON() {
    download('org-assessment-' + stamp() + '.json', JSON.stringify(state, null, 2), 'application/json');
  }

  function importJSON(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { alert('That file is not valid JSON.'); return; }
    if (!confirm('Replace ALL current data (answers, clients and team) with this backup?')) return;
    state = normalize(parsed);
    save();
    renderAll();
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
    route();
  }

  function bind() {
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', function () { if (saveTimer) save(); });

    // Questions
    $('#questions').addEventListener('input', function (e) {
      var t = e.target;
      if (!t.dataset.qid) return;
      state.answers[t.dataset.qid] = t.value;
      t.closest('.q').classList.toggle('answered', !!t.value.trim());
      updateProgress();
      scheduleSave();
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
        else { v.sort = null; v.dir = 1; }   // third click clears sort
        renderTable(kind);
      });
      $('[data-filter="' + kind + '"]').addEventListener('input', function (e) {
        views[kind].filter = e.target.value;
        renderTable(kind);
      });
    });

    // Buttons with data-action (toolbar + menu)
    document.addEventListener('click', function (e) {
      var menu = $('#dataMenu');
      if (e.target.closest('#dataMenuBtn')) { menu.hidden = !menu.hidden; return; }
      if (!e.target.closest('.menu')) menu.hidden = true;

      var b = e.target.closest('button[data-action]');
      if (!b || b.closest('tbody')) return;
      var kind = b.dataset.kind;
      menu.hidden = true;
      switch (b.dataset.action) {
        case 'add-row': addRow(kind); break;
        case 'export-csv': exportCSV(kind); break;
        case 'import-csv': pickFile(kind, '.csv,text/csv'); break;
        case 'export-json': exportJSON(); break;
        case 'import-json': pickFile('json', '.json,application/json'); break;
        case 'reset':
          if (confirm('Delete ALL answers, clients and team data stored in this browser? Export a backup first if you need it.')) {
            state = emptyState(); save(); renderAll();
          }
          break;
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('#dataMenu').hidden = true; });

    $('#fileInput').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var target = pendingImport;
      file.text().then(function (text) {
        if (target === 'json') importJSON(text); else importCSV(target, text);
      });
    });
  }

  function init() {
    document.title = C.appTitle || document.title;
    $('#appTitle').textContent = C.appTitle || 'Org Assessment';
    load().then(function () {
      renderAll();
      bind();
      setStatus(state.updatedAt ? 'Last saved ' + new Date(state.updatedAt).toLocaleString() : 'Saved locally in this browser');
    });
  }

  init();
})();
