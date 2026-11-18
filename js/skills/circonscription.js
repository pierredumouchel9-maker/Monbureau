'use strict';
/* Skill Circonscription : analyse par cycle (tableau de bord, comparaison, graphiques),
   fiches d'assemblée, préparation des visites. Import depuis le classeur d'analyse (NM-01_Analyse). */
App.circo = (() => {
  const api = App.api;

  /* ---------- Indicateurs (libellés repris du classeur d'analyse) ---------- */
  const IND = [
    {k: 'a', l: 'A', g: 'Effectifs', t: 'Anciens'}, {k: 'ass', l: 'Ass.', g: 'Effectifs', t: 'Assistants'},
    {k: 'procl', l: 'Procl+PP', g: 'Effectifs', t: 'Proclamateurs (pionniers compris)'}, {k: 'ir', l: 'IR', g: 'Effectifs'},
    {k: 'in', l: 'IN', g: 'Effectifs'}, {k: 'totalin', l: 'Total IN', g: 'Effectifs'}, {k: 'nvpro', l: 'Nv.pro', g: 'Effectifs'}, {k: 'redact', l: 'red.act.', g: 'Effectifs'},
    {k: 'eb', l: 'E.B.', g: 'Activité'}, {k: 'pp', l: 'PP', g: 'Activité'}, {k: 'ebpp', l: 'EB PP', g: 'Activité'},
    {k: 'ps', l: 'PS', g: 'Activité'}, {k: 'ebps', l: 'EB PS', g: 'Activité'}, {k: 'pa', l: 'PA', g: 'Activité'},
    {k: 'sem', l: 'SEM.', g: 'Assistance'}, {k: 'we', l: 'WE', g: 'Assistance'}, {k: 'vsem', l: 'Visite SEM.', g: 'Assistance'},
    {k: 'vwe', l: 'Visite WE', g: 'Assistance'}, {k: 'memorial', l: 'Mémorial', g: 'Assistance'},
    {k: 'terr', l: 'Territoires', g: 'Territoires'}, {k: 'nonparc', l: 'Non parcourus', g: 'Territoires'},
    {k: 'renv', l: 'Renv.', g: 'Comité', t: 'Renv. / Exco.'}, {k: 'retr', l: 'Retr.', g: 'Comité'}, {k: 'reint', l: 'Réint.', g: 'Comité'},
    {k: 'reprim', l: 'Réprim.', g: 'Comité', t: 'Réprim. / Blâ.'},
    {k: 'oints', l: 'Oints', g: 'Divers'}, {k: 'bapt', l: 'Bapt.', g: 'Divers'}
  ];
  const GROUPS = [...new Set(IND.map(i => i.g))];
  // Pourcentages affichés sous les totaux : indicateur → dénominateur
  const RATIO = {ir: 'procl', pp: 'procl', ps: 'procl', pa: 'procl', sem: 'procl', we: 'procl', vsem: 'procl', vwe: 'procl', memorial: 'procl', nonparc: 'terr', in: 'procl'};
  // Correspondance des titres de colonnes du classeur
  const HEAD = {'a': 'a', 'ass': 'ass', 'procl pp': 'procl', 'ir': 'ir', 'e b': 'eb', 'pp': 'pp', 'eb pp': 'ebpp', 'ps': 'ps', 'eb ps': 'ebps',
    'nv pro': 'nvpro', 'in': 'in', 'red act': 'redact', 'pa': 'pa', 'renv': 'renv', 'exco': 'renv', 'retr': 'retr', 'reint': 'reint',
    'reprim': 'reprim', 'bla': 'reprim', 'sem': 'sem', 'we': 'we', 'visite sem': 'vsem', 'visite we': 'vwe', 'territoires': 'terr',
    'non parcourus': 'nonparc', 'non parcouru': 'nonparc', 'total in': 'totalin', 'oints': 'oints', 'assistance': 'memorial', 'bapt': 'bapt'};
  const FICHE = [
    {k: 'points', l: 'Points pour la prochaine visite', long: true}, {k: 'routiers', l: 'Routiers'}, {k: 'laveries', l: 'Laveries'},
    {k: 'boites', l: 'Boîtes à livres'}, {k: 'tpl', l: 'TPL'}, {k: 'tps', l: 'TPS'}, {k: 'aumonerie', l: 'Aumônerie'},
    {k: 'numero', l: 'N°'}, {k: 'sdr', l: 'Salle du Royaume', long: true}, {k: 'places', l: 'Places assises', long: true},
    {k: 'communes', l: 'Communes parcourues', long: true}, {k: 'population', l: 'Population'}, {k: 'cca', l: 'CCA'},
    {k: 'remarques', l: 'Remarques', long: true}
  ];

  const hn = s => api.norm(s).replace(/[.@]/g, ' ').replace(/\s+/g, ' ').trim();
  const store = () => api.moduleData('circonscription', {cycles: [], assemblees: [], fiches: {}});
  const n = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  const fmt = v => v === null || v === undefined ? '' : Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
  const pct = (a, b) => (a === null || !b) ? '' : Math.round(a / b * 100) + ' %';
  const isGroup = name => /^groupe\b/i.test(name);
  // Rapprochement des noms d'assemblée (« ST LO » = « SAINT-LÔ »)
  const ckey = s => api.norm(s).replace(/\bst\b/g, 'saint').replace(/\brive\b/g, 'rives').replace(/\s+/g, '');

  function sortedCycles() { return [...store().cycles].sort((a, b) => a.code.localeCompare(b.code)); }
  function prevCycle(c) { const cs = sortedCycles(); const i = cs.findIndex(x => x.id === c.id); return i > 0 ? cs[i - 1] : null; }
  const counted = () => store().assemblees.filter(a => !isGroup(a) || App.circo.state?.groups);
  // Totaux : somme des assemblées renseignées ; t.$n[k] = nombre d'assemblées renseignées
  function totals(c, only) {
    const t = {$n: {}};
    for (const i of IND) {
      let s = null, cnt = 0;
      for (const a of counted()) { if (only && !only(a, i.k)) continue; const v = n(c.valeurs[a]?.[i.k]); if (v !== null) { s = (s || 0) + v; cnt++; } }
      t[i.k] = s; t.$n[i.k] = cnt;
    }
    return t;
  }
  // Écart entre deux cycles calculé seulement sur les assemblées renseignées dans les deux
  function commonDelta(c, p, k) {
    if (!p) return null;
    let a = 0, b = 0, cnt = 0;
    for (const x of counted()) { const v = n(c.valeurs[x]?.[k]), w = n(p.valeurs[x]?.[k]); if (v !== null && w !== null) { a += v; b += w; cnt++; } }
    return cnt ? {d: a - b, cnt} : null;
  }
  function members(asm) { return api.data.persons.filter(p => ckey(p.assemblee) === ckey(asm)); }

  /* ---------- Graphiques SVG ---------- */
  function lineChart(labels, series, {height = 220, title = ''} = {}) {
    const W = 720, H = height + (series.length > 1 ? 18 : 0), L = 48, R = 56, T = series.length > 1 ? 50 : 30, B = 34;
    const all = series.flatMap(s => s.values).filter(v => v !== null);
    if (!all.length) return '<p class="muted small">Pas de données pour ce graphique.</p>';
    let max = Math.max(...all), min = Math.min(0, ...all);
    if (series.length > 1) { const lo = Math.min(...all), hi = Math.max(...all), pad = Math.max(5, (hi - lo) * 0.25); min = Math.max(0, Math.floor((lo - pad) / 10) * 10); max = hi + pad; }
    if (max === min) max = min + 1;
    const step = Math.pow(10, Math.floor(Math.log10(max - min))) * ([1, 2, 5].find(m => (max - min) / (Math.pow(10, Math.floor(Math.log10(max - min))) * m) <= 6) || 10);
    max = Math.ceil(max / step) * step;
    const X = i => labels.length === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (labels.length - 1);
    const Y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
    const colors = ['var(--accent)', '#c2410c', '#15803d', '#7c3aed'];
    let g = '';
    for (let v = min; v <= max + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(v)}</text>`;
    labels.forEach((lb, i) => { g += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${api.esc(lb)}</text>`; });
    const ends = [];
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => v === null ? null : [X(i), Y(v), v]).filter(Boolean);
      if (pts.length > 1) g += `<polyline fill="none" stroke="${colors[si % 4]}" stroke-width="2.25" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>`;
      pts.forEach((p, pi) => {
        g += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${colors[si % 4]}"><title>${api.esc(s.name)} : ${fmt(p[2])}</title></circle>`;
        if (series.length === 1) g += `<text x="${p[0]}" y="${p[1] - 9}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--ink)">${fmt(p[2])}</text>`;
        else if (pi === pts.length - 1) ends.push({x: p[0], y: p[1], v: p[2], c: colors[si % 4]});
      });
    });
    // Plusieurs courbes : valeur finale à droite, étiquettes écartées pour ne pas se chevaucher
    ends.sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => { e.ly = i && e.y - ends[i - 1].ly < 13 ? ends[i - 1].ly + 13 : e.y; });
    ends.forEach(e => { g += `<text x="${e.x + 8}" y="${(e.ly ?? e.y) + 4}" font-size="11.5" font-weight="600" fill="${e.c}">${fmt(e.v)}</text>`; });
    const legend = series.length > 1 ? series.map((s, si) => `<tspan fill="${colors[si % 4]}">● </tspan><tspan fill="var(--ink)">${api.esc(s.name)}   </tspan>`).join('') : '';
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="${api.esc(title)}">
      <text x="${L}" y="16" font-size="13" font-weight="600" fill="var(--ink)">${api.esc(title)}</text>
      ${legend ? `<text x="${L}" y="36" font-size="12">${legend}</text>` : ''}${g}</svg>`;
  }
  function barChart(rows, {title = '', ratio = false} = {}) { // rows: [{label, value, prev}]
    const data = rows.filter(r => r.value !== null);
    if (!data.length) return '<p class="muted small">Pas de données pour ce graphique.</p>';
    const W = 720, rowH = 22, L = 190, R = 70, T = 28, H = T + data.length * rowH + 8;
    const max = Math.max(...data.map(r => Math.max(r.value, r.prev ?? 0))) || 1;
    const X = v => L + (W - L - R) * v / max;
    let g = '';
    data.forEach((r, i) => {
      const y = T + i * rowH;
      g += `<text x="${L - 8}" y="${y + 14}" text-anchor="end" font-size="11.5" fill="var(--ink)">${api.esc(r.label)}</text>
        <rect x="${L}" y="${y + 3}" width="${Math.max(1, X(r.value) - L)}" height="${rowH - 8}" rx="3" fill="var(--accent)" opacity=".85"/>
        ${r.prev !== null && r.prev !== undefined ? `<line x1="${X(r.prev)}" x2="${X(r.prev)}" y1="${y + 1}" y2="${y + rowH - 3}" stroke="var(--ink)" stroke-width="2"/>` : ''}
        <text x="${Math.max(X(r.value), r.prev !== null && r.prev !== undefined ? X(r.prev) : 0) + 6}" y="${y + 14}" font-size="11.5" font-weight="600" fill="var(--ink)">${ratio ? r.value + ' %' : fmt(r.value)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="${api.esc(title)}">
      <text x="0" y="16" font-size="13" font-weight="600" fill="var(--ink)">${api.esc(title)}</text>
      <text x="${W}" y="16" text-anchor="end" font-size="11.5" fill="var(--muted)">trait noir = cycle précédent</text>${g}</svg>`;
  }

  /* ---------- Import du classeur d'analyse ---------- */
  async function importFlow(onDone) {
    const file = await api.pickFile('.xlsx,.xlsm'); if (!file) return;
    let sheets;
    try { sheets = await App.files.readXlsx(file); } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
    const cycles = [], order = [], ccas = {};
    for (const sh of sheets) {
      const m = /analyse\s*(\d{4}\s*[ab])/i.exec(sh.name); if (!m) continue;
      const hi = sh.rows.findIndex(r => hn(r[0]) === 'assemblees'); if (hi < 0) continue;
      const head = sh.rows[hi], cols = {};
      head.forEach((h, i) => { const k = HEAD[hn(h)]; if (k && !(k in cols)) cols[k] = i; });
      const lastNum = Math.max(...Object.values(cols));
      const c = {id: api.uid(), code: m[1].replace(/\s/g, '').toUpperCase(), libelle: String(sh.rows[0]?.[1] || '').trim(), valeurs: {}, notes: {}};
      for (const r of sh.rows.slice(hi + 1)) {
        const name = String(r[0] ?? '').trim();
        if (!name) continue;
        if (/^totaux/i.test(name)) break;
        if (!order.includes(name)) order.push(name);
        const v = {}; for (const [k, i] of Object.entries(cols)) { const x = n(r[i]); if (x !== null) v[k] = x; }
        c.valeurs[name] = v;
        const txt = r.slice(lastNum + 1, lastNum + 3).map(x => String(x ?? '').trim()).filter(x => x && isNaN(Number(x)) && !/\(\d{5,6}\)/.test(x) && x !== 'CCA');
        if (txt.length) c.notes[name] = txt.join(' — ');
      }
      // Tableau annexe « Assemblée (n°) | CCA | CCA »
      for (const r of sh.rows) r.forEach((x, i) => {
        if (String(x).trim() === 'CCA' && i >= 2 && /\(\d{5,6}\)/.test(String(r[i - 2]))) ccas[String(r[i - 2]).replace(/\s*\(.*$/, '').trim()] = String(r[i - 1]).trim();
      });
      cycles.push(c);
    }
    const fichesSheet = sheets.find(s => /^assembl/i.test(s.name.trim()) && hn(s.rows[0]?.[0]).startsWith('assemblees'));
    const fiches = {};
    let codesSkipped = 0;
    if (fichesSheet) {
      const head = fichesSheet.rows[0].map(h => hn(h));
      const col = re => head.findIndex(h => re.test(h));
      const map = {points: col(/^points/), routiers: col(/^routiers/), laveries: col(/^laveries/), boites: col(/^boites/), tpl: col(/^tpl$/), tps: col(/^tps$/),
        aumonerie: col(/^aumonerie/), numero: col(/^n$/), sdr: col(/^sdr$/), places: col(/^sdr places/), communes: col(/^communes/), population: col(/^population/)};
      const infos = col(/^infos utiles/);
      for (const r of fichesSheet.rows.slice(1)) {
        const name = String(r[0] ?? '').trim(); if (!name) continue;
        const f = {}; for (const [k, i] of Object.entries(map)) if (i >= 0 && r[i] !== '' && r[i] !== undefined) f[k] = String(r[i]).trim();
        if (infos >= 0 && String(r[infos] ?? '').trim()) codesSkipped++;
        fiches[name] = f;
      }
    }
    if (!cycles.length && !Object.keys(fiches).length) return api.toast('Aucun onglet « ANALYSE … » ni « Assemblées » trouvé dans ce fichier.', 'error');
    const S = store();
    const exist = new Set(S.cycles.map(c => c.code));
    const ok = await api.modal({title: 'Importer le classeur d’analyse', body: `<div class="stack">
      <p style="margin:0">Fichier : <strong>${api.esc(file.name)}</strong></p>
      <ul style="margin:0">${cycles.map(c => `<li>Cycle <strong>${c.code}</strong> : ${Object.keys(c.valeurs).length} assemblées${exist.has(c.code) ? ' <span class="pill warn">remplacera le cycle existant</span>' : ''}</li>`).join('')}
      ${Object.keys(fiches).length ? `<li>Fiches de ${Object.keys(fiches).length} assemblées (points de visite, témoignage public, Salle du Royaume…)</li>` : ''}</ul>
      ${codesSkipped ? `<div class="notice small">La colonne « Infos utiles » (codes d’alarme, Wi-Fi, Zoom) n’est <strong>pas importée</strong> ici : ces codes ont leur place dans le <strong>Coffre</strong>, chiffré à part.</div>` : ''}</div>`,
      actions: [{label: 'Annuler', value: false}, {label: 'Importer', kind: 'primary', value: true}]});
    if (!ok) return;
    for (const c of cycles) { S.cycles = S.cycles.filter(x => x.code !== c.code); S.cycles.push(c); }
    for (const name of [...order, ...Object.keys(fiches)]) if (!S.assemblees.some(a => ckey(a) === ckey(name))) S.assemblees.push(name);
    for (const [name, cca] of Object.entries(ccas)) { const key = S.assemblees.find(a => ckey(a) === ckey(name)); if (key) (fiches[key] ??= {}).cca ??= cca; }
    for (const [name, f] of Object.entries(fiches)) {
      const key = S.assemblees.find(a => ckey(a) === ckey(name)) || name;
      S.fiches[key] = {...(S.fiches[key] || {}), ...f};
    }
    api.save(); api.toast(`${cycles.length} cycle(s) et ${Object.keys(fiches).length} fiche(s) importés`);
    onDone && onDone();
  }

  /* ---------- Saisie d'un cycle ---------- */
  async function newCycle(onDone) {
    const S = store(), last = sortedCycles().at(-1);
    const guess = last ? (/A$/.test(last.code) ? last.code.slice(0, 4) + 'B' : (Number(last.code.slice(0, 4)) + 1) + 'A') : new Date().getFullYear() + 'A';
    const r = await api.modal({title: 'Nouveau cycle', body: `<form class="form-grid" onsubmit="return false">
      <label class="field"><span>Code (ex. 2027B)</span><input type="text" name="code" value="${guess}"></label>
      <label class="field wide"><span>Libellé</span><input type="text" name="lib" placeholder="Cycle de mars à août…"></label>
      ${last ? `<label class="row small wide"><input type="checkbox" name="copy" checked> Reprendre les anciens, assistants et territoires du cycle ${last.code}</label>` : ''}</form>`,
      actions: [{label: 'Annuler', value: null}, {label: 'Créer', kind: 'primary', onClick: b => {
        const f = api.$('form', b), code = f.code.value.trim().toUpperCase();
        if (!/^\d{4}[AB]$/.test(code)) { api.toast('Code attendu : année + A ou B (ex. 2027B)', 'error'); return false; }
        if (S.cycles.some(c => c.code === code)) { api.toast('Ce cycle existe déjà', 'error'); return false; }
        return {code, lib: f.lib.value.trim(), copy: f.copy?.checked}; }}]});
    if (!r) return;
    const c = {id: api.uid(), code: r.code, libelle: r.lib, valeurs: {}, notes: {}};
    for (const a of S.assemblees) {
      c.valeurs[a] = {};
      if (r.copy && last) for (const k of ['a', 'ass', 'terr']) if (n(last.valeurs[a]?.[k]) !== null) c.valeurs[a][k] = last.valeurs[a][k];
    }
    if (last) for (const p of api.data.persons) { const e = suivi(last)[p.id]; if (e && e.fct === undefined) e.fct = p.fonction || ''; }
    // Déménagements et décès notés au cycle précédent : retirés de l'annuaire, avec une trace dans le cycle
    const partis = last ? api.data.persons.filter(p => DEPARTS.includes(suivi(last)[p.id]?.evt)) : [];
    if (partis.length && await api.modal({title: 'Départs du cycle ' + last.code, actions: [{label: 'Les garder', value: false}, {label: 'Retirer', value: true, kind: 'danger'}], body: `<p>Ces personnes notées « Déménagement » ou « Décédé(e) » au cycle ${last.code} vont être retirées de la liste et de l'annuaire :</p><ul>${partis.map(p => `<li>${api.esc((p.nom || '').toUpperCase() + ' ' + (p.prenom || ''))} — ${api.esc(suivi(last)[p.id].evt)} (${api.esc(p.assemblee || '')})</li>`).join('')}</ul><p class="small muted">Leur trace reste dans le cycle ${last.code}.</p>`})) {
      last.partis ??= [];
      for (const p of partis) {
        last.partis.push({nom: (p.nom || '').toUpperCase(), prenom: p.prenom || '', asm: p.assemblee || '', motif: suivi(last)[p.id].evt, entry: {...suivi(last)[p.id]}});
        (last.mouvements ??= []).push({type: 'retrait', date: new Date().toISOString(), fichier: suivi(last)[p.id].evt, nom: (p.nom || '').toUpperCase(), prenom: p.prenom || '', asm: p.assemblee || ''});
      }
      const ids = new Set(partis.map(p => p.id));
      api.data.persons = api.data.persons.filter(p => !ids.has(p.id));
    }
    S.cycles.push(c); api.save(); api.toast(`Cycle ${c.code} créé${partis.length ? ` · ${partis.length} départ(s) retiré(s)` : ''}`);
    onDone && onDone(c);
  }

  /* ---------- Tableau de bord ---------- */
  function dashboard(el, state) {
    const S = store(), cycles = sortedCycles();
    if (!cycles.length) {
      el.innerHTML = `<div class="page-head"><div><h1>📊 Circonscription</h1><p>Analyse par cycle, fiches d'assemblée et préparation des visites.</p></div></div>
        <div class="card stack" style="max-width:640px"><strong>Commencer</strong>
        <p class="small muted" style="margin:0">Importez votre classeur d'analyse (NM-01_Analyse.xlsx) : les onglets « ANALYSE 2026A, 2026B… » deviennent des cycles, et l'onglet « Assemblées » remplit les fiches.</p>
        <div class="row"><button class="btn primary" id="cImp">Importer le classeur d'analyse</button><button class="btn" id="cNew">Créer un cycle vide</button></div></div>`;
      api.$('#cImp', el).addEventListener('click', () => importFlow(() => dashboard(el, state)));
      api.$('#cNew', el).addEventListener('click', () => { if (!S.assemblees.length) S.assemblees = api.data.congregations.map(c => c.nom); newCycle(() => dashboard(el, state)); });
      return;
    }
    const c = cycles.find(x => x.id === state.cycle) || cycles.at(-1); state.cycle = c.id;
    const prev = prevCycle(c), tot = totals(c), ptot = prev ? totals(prev) : null;
    const inds = IND.filter(i => i.g === state.group);
    const delta = (v, p) => {
      if (v === null || p === null || p === undefined || v === p) return '';
      const d = v - p; return `<span class="small" style="color:${d > 0 ? 'var(--ok)' : 'var(--danger)'};margin-left:3px">${d > 0 ? '+' : ''}${fmt(d)}</span>`;
    };
    const cell = (a, i) => {
      const v = n(c.valeurs[a]?.[i.k]), p = prev ? n(prev.valeurs[a]?.[i.k]) : null;
      if (state.edit) return `<td><input type="number" min="0" step="1" data-a="${api.esc(a)}" data-k="${i.k}" value="${v ?? ''}" style="width:72px;padding:4px 6px"></td>`;
      return `<td style="text-align:right;white-space:nowrap">${fmt(v)}${state.compare ? delta(v, p) : ''}</td>`;
    };
    el.innerHTML = `${header('dashboard')}<div class="page-head"><div><p style="margin:0" class="muted">${api.esc(c.libelle || 'Cycle ' + c.code)}</p></div>
      <div class="row"><select id="cCycle" style="width:auto">${cycles.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>Cycle ${x.code}</option>`).join('')}</select>
        <button class="btn" id="cNew">+ Cycle</button><button class="btn" id="cImp">Importer</button><button class="btn" id="cCsv">Exporter (CSV)</button>
        <button class="btn ${state.edit ? 'primary' : ''}" id="cEdit">${state.edit ? 'Terminer la saisie' : 'Saisir / corriger'}</button></div></div>
      <div class="grid" style="margin-bottom:16px">
        ${[['procl', 'Proclamateurs'], ['pp', 'Pionniers permanents'], ['sem', 'Assistance semaine'], ['bapt', 'Baptêmes']].map(([k, lab]) => `
          <div class="card"><div class="muted small">${lab}</div><div class="stat">${fmt(tot[k]) || '—'}</div>
          <div class="small muted">${tot.$n[k]}/${counted().length} assemblées renseignées${(() => { const cd = commonDelta(c, prev, k); return cd ? `<br>${cd.d >= 0 ? '+' : ''}${fmt(cd.d)} par rapport à ${prev.code} (sur ${cd.cnt} assemblée${cd.cnt > 1 ? 's' : ''} comparable${cd.cnt > 1 ? 's' : ''})` : ''; })()}</div></div>`).join('')}
      </div>
      <div class="tabs">${GROUPS.map(g => `<button data-g="${g}" class="${g === state.group ? 'active' : ''}">${g}</button>`).join('')}
        <label class="row small" style="margin-left:auto;padding:0 8px"><input type="checkbox" id="cGrp" ${state.groups ? 'checked' : ''}> Compter les groupes dans les totaux</label>
        <label class="row small" style="padding:0 8px"><input type="checkbox" id="cCmp" ${state.compare ? 'checked' : ''} ${prev ? '' : 'disabled'}> Écart avec ${prev ? prev.code : 'le cycle précédent'}</label></div>
      <div class="table-wrap"><table class="list"><thead><tr><th>Assemblée</th>${inds.map(i => `<th style="text-align:right" title="${api.esc(i.t || i.l)}">${api.esc(i.l)}</th>`).join('')}<th>Remarques</th></tr></thead><tbody>
        ${S.assemblees.map(a => `<tr><td style="white-space:nowrap">${isGroup(a) ? '<span class="muted">↳ </span>' : ''}<a href="#/circonscription/assemblee/${encodeURIComponent(a)}">${api.esc(a)}</a>${badges(a) ? '<div style="margin-top:2px;white-space:normal">' + badges(a) + '</div>' : ''}</td>${inds.map(i => cell(a, i)).join('')}
          <td class="small muted">${state.edit ? `<input type="text" data-note="${api.esc(a)}" value="${api.esc(c.notes[a] || '')}" style="min-width:200px;padding:4px 6px">` : api.esc(c.notes[a] || '')}</td></tr>`).join('')}
        <tr style="font-weight:700;background:var(--bg)"><td>Total circonscription</td>${inds.map(i => { const cd = state.compare ? commonDelta(c, prev, i.k) : null; const full = tot.$n[i.k] === counted().length;
          return `<td style="text-align:right;white-space:nowrap">${fmt(tot[i.k])}${cd && cd.d ? `<span class="small" style="color:${cd.d > 0 ? 'var(--ok)' : 'var(--danger)'};margin-left:3px">${cd.d > 0 ? '+' : ''}${fmt(cd.d)}</span>` : ''}${tot[i.k] !== null && !full ? `<div class="small muted" style="font-weight:400">${tot.$n[i.k]}/${counted().length}</div>` : ''}</td>`; }).join('')}
          <td class="small muted" style="font-weight:400">${state.groups ? 'groupes compris' : 'hors groupes'} · écarts calculés sur les assemblées renseignées aux deux cycles</td></tr>
        <tr class="small muted"><td>% des proclamateurs / territoires</td>${inds.map(i => `<td style="text-align:right">${RATIO[i.k] ? (() => { let a = 0, b = 0; for (const x of counted()) { const v = n(c.valeurs[x]?.[i.k]), d = n(c.valeurs[x]?.[RATIO[i.k]]); if (v !== null && d) { a += v; b += d; } } return b ? pct(a, b) : ''; })() : ''}</td>`).join('')}<td></td></tr>
        <tr class="small muted"><td>Moyenne par assemblée</td>${inds.map(i => { const vals = S.assemblees.filter(a => !isGroup(a)).map(a => n(c.valeurs[a]?.[i.k])).filter(v => v !== null); return `<td style="text-align:right">${vals.length ? fmt(vals.reduce((s, v) => s + v, 0) / vals.length) : ''}</td>`; }).join('')}<td></td></tr>
      </tbody></table></div>
      <div class="stack" style="margin-top:20px">
        <div class="card stack"><div class="row" style="justify-content:space-between"><strong>Évolution de la circonscription</strong>
          <select id="cEvo" style="width:auto">${IND.map(i => `<option value="${i.k}" ${i.k === state.evo ? 'selected' : ''}>${api.esc(i.t || i.l)}</option>`).join('')}</select></div>
          ${(() => {
            const k = state.evo, lab = IND.find(i => i.k === k).t || IND.find(i => i.k === k).l;
            const common = counted().filter(a => cycles.every(x => n(x.valeurs[a]?.[k]) !== null));
            const series = [{name: 'Total des assemblées renseignées', values: cycles.map(x => totals(x)[k])}];
            if (common.length && common.length < counted().length) series.push({name: `Mêmes ${common.length} assemblées à chaque cycle`, values: cycles.map(x => totals(x, a => common.includes(a))[k])});
            return lineChart(cycles.map(x => `${x.code} (${totals(x).$n[k]}/${counted().length})`), series, {title: `${lab} — par cycle (entre parenthèses : assemblées renseignées)`});
          })()}</div>
        <div class="card stack"><div class="row" style="justify-content:space-between"><strong>Comparaison des assemblées (${c.code})</strong>
          <select id="cBar" style="width:auto">${IND.map(i => `<option value="${i.k}" ${i.k === state.bar ? 'selected' : ''}>${api.esc(i.t || i.l)}</option>`).join('')}
            <option value="%sem" ${state.bar === '%sem' ? 'selected' : ''}>Assistance semaine en % des proclamateurs</option>
            <option value="%pp" ${state.bar === '%pp' ? 'selected' : ''}>Pionniers permanents en % des proclamateurs</option></select></div>
          ${(() => {
            const asm = S.assemblees.filter(a => !isGroup(a));
            if (state.bar.startsWith('%')) {
              const k = state.bar.slice(1), r = (cy, a) => { const v = n(cy?.valeurs[a]?.[k]), d = n(cy?.valeurs[a]?.procl); return v !== null && d ? Math.round(v / d * 100) : null; };
              return barChart(asm.map(a => ({label: a, value: r(c, a), prev: prev ? r(prev, a) : null})).sort((x, y) => (y.value ?? -1) - (x.value ?? -1)), {title: state.bar === '%sem' ? 'Assistance semaine / proclamateurs' : 'PP / proclamateurs', ratio: true});
            }
            return barChart(asm.map(a => ({label: a, value: n(c.valeurs[a]?.[state.bar]), prev: prev ? n(prev.valeurs[a]?.[state.bar]) : null})).sort((x, y) => (y.value ?? -1) - (x.value ?? -1)), {title: IND.find(i => i.k === state.bar).t || IND.find(i => i.k === state.bar).l});
          })()}</div>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn small danger" id="cDel">Supprimer le cycle ${c.code}</button></div>`;
    const redraw = () => dashboard(el, state);
    bindHeader(el);
    api.$('#cCycle', el).addEventListener('change', e => { state.cycle = e.target.value; redraw(); });
    api.$$('[data-g]', el).forEach(b => b.addEventListener('click', () => { state.group = b.dataset.g; redraw(); }));
    api.$('#cCmp', el).addEventListener('change', e => { state.compare = e.target.checked; redraw(); });
    api.$('#cGrp', el).addEventListener('change', e => { state.groups = e.target.checked; redraw(); });
    api.$('#cEvo', el).addEventListener('change', e => { state.evo = e.target.value; redraw(); });
    api.$('#cBar', el).addEventListener('change', e => { state.bar = e.target.value; redraw(); });
    api.$('#cImp', el).addEventListener('click', () => importFlow(redraw));
    api.$('#cNew', el).addEventListener('click', () => newCycle(nc => { state.cycle = nc.id; state.edit = true; redraw(); }));
    api.$('#cEdit', el).addEventListener('click', () => { state.edit = !state.edit; if (!state.edit) api.toast('Saisie enregistrée'); redraw(); });
    api.$('#cCsv', el).addEventListener('click', () => {
      const rows = [['Assemblée', ...IND.map(i => i.t || i.l), 'Remarques']];
      for (const a of S.assemblees) rows.push([a, ...IND.map(i => fmt(n(c.valeurs[a]?.[i.k]))), c.notes[a] || '']);
      rows.push(['Total (hors groupes)', ...IND.map(i => fmt(tot[i.k])), '']);
      const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      api.download(`Analyse circonscription ${c.code}.csv`, new Blob([csv], {type: 'text/csv'}));
    });
    api.$('#cDel', el).addEventListener('click', async () => {
      if (!await api.confirm('Supprimer le cycle', `Supprimer définitivement le cycle ${c.code} et toutes ses valeurs ?`, 'Supprimer', true)) return;
      S.cycles = S.cycles.filter(x => x.id !== c.id); state.cycle = null; api.save(); redraw();
    });
    el.onchange = null;
    if (state.edit) {
      el.onchange = (e => {
        const t = e.target;
        if (t.dataset.k) { const v = t.value === '' ? null : Number(t.value); c.valeurs[t.dataset.a] ??= {}; if (v === null) delete c.valeurs[t.dataset.a][t.dataset.k]; else c.valeurs[t.dataset.a][t.dataset.k] = v; api.save(); }
        if (t.dataset.note !== undefined) { const v = t.value.trim(); if (v) c.notes[t.dataset.note] = v; else delete c.notes[t.dataset.note]; api.save(); }
      });
    }
  }

  /* ---------- Fiche d'assemblée ---------- */
  // Particularités d'une assemblée : référente aumônerie en prison, groupes d'expression étrangère
  // « aumRef » est distinct du champ texte « aumonerie » de la fiche (importé du classeur, souvent « - ») ;
  // tant qu'il n'est pas réglé, on le déduit de la mention « Ass. Référente » dans ce texte
  function particul(name) {
    const f = store().fiches?.[name] || {}, txt = String(f.aumonerie || '');
    const auto = /r[ée]f[ée]rente/i.test(txt);
    const lieuAuto = auto ? (txt.split(/\n/).map(x => x.trim()).find(x => /(centre|maison|prison|p[ée]nitentiaire)/i.test(x)) || '') : '';
    return {aum: f.aumRef ?? auto, lieu: f.aumLieu ?? lieuAuto, groupes: f.groupes || []};
  }
  function badges(name) {
    const x = particul(name), b = [];
    if (x.aum) b.push(`<span class="pill" style="background:#efe3ff;color:#4b2a7a;border-color:#c9b0ec" title="Assemblée référente pour l’aumônerie en prison${x.lieu ? ' : ' + api.esc(x.lieu) : ''}">Aumônerie${x.lieu ? ' · ' + api.esc(x.lieu) : ''}</span>`);
    for (const g of x.groupes) b.push(`<span class="pill" style="background:#e3f4ea;color:#1d5a35;border-color:#a9d5b8" title="Groupe d’expression étrangère">${api.esc(g)}</span>`);
    return b.join(' ');
  }
  function particulCard(name) {
    const x = particul(name);
    return `<div class="card" style="margin-bottom:16px"><strong>Particularités de l’assemblée</strong>
      <div class="row" style="margin-top:10px;gap:16px;align-items:center">
        <label class="row small" style="gap:6px"><input type="checkbox" id="pcAum" ${x.aum ? 'checked' : ''}> Assemblée référente pour l’aumônerie en prison</label>
        <input id="pcLieu" placeholder="Établissement (ex. centre pénitentiaire…)" value="${api.esc(x.lieu)}" style="max-width:300px;${x.aum ? '' : 'display:none'}">
      </div>
      <div style="margin-top:10px"><div class="small muted" style="margin-bottom:4px">Groupes d’expression étrangère</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${x.groupes.map(g => `<span class="pill" style="background:#e3f4ea;color:#1d5a35">${api.esc(g)} <a href="#" data-delgrp="${api.esc(g)}" style="color:#c00;text-decoration:none" title="Retirer">×</a></span>`).join('')}
          <input id="pcGrp" placeholder="Ajouter un groupe (ex. anglais, roumain, LSF…)" style="max-width:260px"><button class="btn" id="pcGrpAdd">Ajouter</button></div></div></div>`;
  }
  function bindParticul(el, name, redraw) {
    const f = () => store().fiches[name] ??= {};
    api.$('#pcAum', el).onchange = e => { f().aumRef = e.target.checked; api.save(); redraw(); };
    api.$('#pcLieu', el).onchange = e => { f().aumLieu = e.target.value.trim(); api.save(); redraw(); };
    const add = () => { const v = api.$('#pcGrp', el).value.trim(); if (!v) return; const g = /^groupe/i.test(v) ? v : 'Groupe ' + v; f().groupes = [...new Set([...(f().groupes || []), g])]; api.save(); redraw(); };
    api.$('#pcGrpAdd', el).onclick = add;
    api.$('#pcGrp', el).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    for (const a of api.$$('[data-delgrp]', el)) a.onclick = e => { e.preventDefault(); f().groupes = (f().groupes || []).filter(g => g !== a.dataset.delgrp); api.save(); redraw(); };
  }

  // Documents joints à une assemblée (une seule version gardée par type ; stockés chiffrés à part, synchronisés un par un)
  const DOC_KINDS = [{k: 'organigramme', l: 'Organigramme'}, {k: 'groupes', l: 'Groupes de prédication'}];
  const DOC_ACCEPT = '.pdf,.xlsx,.xls,.docx,.doc,application/pdf';
  const kSize = b => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko';
  const docIcon = d => /pdf/.test(d.type) || /\.pdf$/i.test(d.name) ? '📕' : /sheet|excel/.test(d.type) || /\.xlsx?$/i.test(d.name) ? '📗' : /word/.test(d.type) || /\.docx?$/i.test(d.name) ? '📘' : '📄';
  function docsCard(name) {
    const row = kd => {
      const d = api.docs.list({asm: name, kind: kd.k}).sort((a, b) => b.date.localeCompare(a.date))[0];
      return `<div class="row" style="gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line, #e5e5e5)">
        <div style="min-width:190px"><strong>${kd.l}</strong></div>
        ${d ? `<div style="flex:1;min-width:0">${docIcon(d)} <span title="${api.esc(d.name)}">${api.esc(d.name)}</span> <span class="small muted">· ${kSize(d.size)} · importé le ${api.dateCourte(d.date)}</span> <span class="small muted" data-docwait="${d.id}"></span></div>
          <button class="btn" data-docopen="${d.id}">Ouvrir</button>${kd.k === 'organigramme' ? `<button class="btn primary" data-docread="${d.id}">Lire les responsabilités</button>` : ''}<button class="btn" data-docadd="${kd.k}">Remplacer</button><button class="btn" data-docdel="${d.id}" title="Retirer ce document">✕</button>`
          : `<div style="flex:1" class="small muted">Aucun document</div><button class="btn" data-docadd="${kd.k}">Ajouter (PDF, Excel, Word)</button>`}
      </div>`;
    };
    return `<div class="card" style="margin-bottom:16px"><strong>Documents de l’assemblée</strong>
      <div style="margin-top:8px">${DOC_KINDS.map(row).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">Seule la dernière version est gardée. Les documents sont chiffrés sur l’appareil et inclus dans les sauvegardes et la synchronisation.</p></div>`;
  }
  // Document importé sur un autre appareil : on tente une synchronisation avant d'abandonner
  async function docBlob(id) {
    let blob = await api.docs.blob(id);
    if (!blob && App.dropbox && await App.dropbox.connected()) { api.toast('Récupération du document depuis Dropbox…'); await App.dropbox.sync({quiet: true}); blob = await api.docs.blob(id); }
    return blob;
  }
  const NOT_HERE = 'Document pas encore dans Dropbox : il a été importé sur un autre appareil. Ouvrez Mon Bureau sur cet appareil-là (Paramètres › Synchroniser maintenant), puis réessayez ici — ou importez de nouveau le fichier ici avec « Remplacer ».';
  function bindDocs(el, name, redraw) {
    for (const b of api.$$('[data-docadd]', el)) b.addEventListener('click', async () => {
      const kind = b.dataset.docadd, file = await api.pickFile(DOC_ACCEPT); if (!file) return;
      if (!/\.(pdf|xlsx?|docx?)$/i.test(file.name)) return api.toast('Choisissez un fichier PDF, Excel ou Word.', 'error');
      if (file.size > 15 * 1048576) return api.toast(`Fichier trop volumineux (${kSize(file.size)}) : 15 Mo au maximum.`, 'error');
      const old = api.docs.list({asm: name, kind});
      await api.docs.add(file, {asm: name, kind});
      for (const d of old) await api.docs.remove(d.id);
      api.toast(`${DOC_KINDS.find(x => x.k === kind).l} enregistré${kind === 'groupes' ? 's' : ''}`); redraw();
      if (kind === 'organigramme' && /\.(pdf|xlsx|docx)$/i.test(file.name)) { const nd = api.docs.list({asm: name, kind})[0]; if (nd) readOrganigramme(name, nd.id, redraw); }
    });
    for (const b of api.$$('[data-docopen]', el)) b.addEventListener('click', () => {
      const d = api.docs.list().find(x => x.id === b.dataset.docopen); if (!d) return;
      const isPdf = /pdf/.test(d.type), win = isPdf ? window.open('about:blank', '_blank') : null;   // ouvert pendant le clic (Safari)
      docBlob(d.id).then(blob => {
        if (!blob) { if (win) win.close(); return api.toast(NOT_HERE, 'error'); }
        if (win) win.location = URL.createObjectURL(blob); else api.download(d.name, blob);
      }).catch(e => { if (win) win.close(); api.toast('Ouverture impossible : ' + e.message, 'error'); });
    });
    for (const b of api.$$('[data-docdel]', el)) b.addEventListener('click', async () => {
      const d = api.docs.list().find(x => x.id === b.dataset.docdel); if (!d) return;
      if (!(await api.confirm('Retirer le document', `Retirer « ${d.name} » de ${name} ?`, 'Retirer', true))) return;
      await api.docs.remove(d.id); redraw();
    });
    for (const b of api.$$('[data-docread]', el)) b.addEventListener('click', () => readOrganigramme(name, b.dataset.docread, redraw));
    for (const s of api.$$('[data-docwait]', el)) api.docs.available(s.dataset.docwait).then(ok => { if (!ok) s.textContent = '· en attente de synchronisation'; });
  }

  // Organigramme : le Comité de service et les services que chacun supervise
  const SUPERVISION = [
    {chef: 'CCA', titre: 'Coordinateur du collège des anciens', services: [['Accueil', 'Préposés à l’accueil'], ['Discours publics', 'Programme des discours publics'], ['Audio/vidéo', 'Équipe audio-vidéo']],
      aussi: 'Présidents du discours public et lecteurs de La Tour de Garde · communications à l’assemblée · audits des comptes'},
    {chef: 'Secrétaire', titre: 'Secrétaire', services: [['Comptes', 'Préposé aux comptes']], aussi: 'Questions liées aux assemblées régionales'},
    {chef: 'Resp. Prédication', titre: 'Responsable de la prédication', services: [['Publications', 'Préposé aux publications'], ['Territoires', 'Préposé aux territoires']], aussi: ''}];
  const AUTRES_RESP = ['TG', 'VCM', 'Conseiller adj.', 'Aumônier', 'CLH', 'Comité de gestion', 'Entretien', 'LDC', 'Télévolontaire'];
  function organi(asm) {
    const mem = members(asm).filter(p => !['Radié', 'Démission'].includes(p.fonction));
    const who = r => ({main: mem.filter(p => (p.resp || []).includes(r)), adj: mem.filter(p => (p.resp || []).includes(r + ' adj.'))});
    const blocks = SUPERVISION.map(b => ({...b, chefs: who(b.chef), svc: b.services.map(([r, l]) => ({r, l, ...who(r)}))}));
    const autres = AUTRES_RESP.map(r => ({r, ...who(r)})).filter(x => x.main.length || x.adj.length);
    const manque = [...blocks.filter(b => !b.chefs.main.length).map(b => b.titre), ...blocks.flatMap(b => b.svc.filter(x => !x.main.length).map(x => x.l))];
    const doublons = [...blocks.filter(b => b.chefs.main.length > 1).map(b => b.titre), ...['TG', 'VCM'].filter(r => who(r).main.length > 1)];
    return {blocks, autres, manque, doublons, any: mem.some(p => (p.resp || []).length)};
  }
  function organiCard(name) {
    const od = api.docs.list({asm: name, kind: 'organigramme'})[0];
    const readBtn = od ? `<div style="margin-top:8px"><button class="btn primary" data-docread="${od.id}">Mettre à jour d’après l’organigramme importé (${api.esc(od.name)})</button></div>` : '';
    const o = organi(name), fn = p => `${api.esc(p.prenom || '')} ${api.esc((p.nom || '').toUpperCase())}`;
    const who = x => [...x.main.map(fn), ...x.adj.map(p => `<span class="muted">${fn(p)} (adj.)</span>`)].join(', ') || '<span style="color:var(--danger,#c00)">à pourvoir</span>';
    if (!o.any) return `<div class="card" style="margin-bottom:16px"><strong>Organigramme — Comité de service</strong>
      <p class="small muted" style="margin:6px 0 0">Aucune responsabilité notée pour cette assemblée. Importez l’organigramme ci-dessus puis « Lire les responsabilités », ou ajoutez-les dans l’étude des proclamateurs.</p>${readBtn}</div>`;
    return `<div class="card" style="margin-bottom:16px"><strong>Organigramme — Comité de service</strong>
      ${o.manque.length ? `<div class="notice warn small" style="margin-top:8px">À pourvoir ou non renseigné : <strong>${o.manque.map(api.esc).join(', ')}</strong></div>` : '<div class="small" style="margin-top:6px;color:#1d5a35">✓ Comité de service et services supervisés tous renseignés</div>'}
      ${o.doublons.length ? `<div class="notice danger small" style="margin-top:6px">Plusieurs frères notés comme : <strong>${o.doublons.map(api.esc).join(', ')}</strong> (vérifiez)</div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:10px">
      ${o.blocks.map(b => `<div style="border:1px solid var(--line,#e2e4e8);border-radius:8px;padding:8px 10px;background:#f7fafd">
        <div class="small muted">${api.esc(b.titre)}</div><div style="font-weight:600;margin-bottom:6px">${who(b.chefs)}</div>
        <div class="small" style="margin-bottom:2px">Supervise :</div>
        <ul class="small" style="margin:0 0 4px 16px;padding:0">${b.svc.map(x => `<li><span class="muted">${api.esc(x.l)} :</span> ${who(x)}</li>`).join('')}</ul>
        ${b.aussi ? `<div class="small muted">Aussi : ${api.esc(b.aussi)}</div>` : ''}</div>`).join('')}
      </div>
      ${o.autres.length ? `<div class="small" style="margin-top:8px"><span class="muted">Autres responsabilités :</span> ${o.autres.map(x => `<strong>${api.esc(x.r)}</strong> ${who(x)}`).join(' · ')}</div>` : ''}${o.manque.length || o.doublons.length ? readBtn : ''}</div>`;
  }

  // Lecture d'un organigramme : propose les responsabilités trouvées, à valider frère par frère
  async function readOrganigramme(name, docId, redraw) {
    const d = api.docs.list().find(x => x.id === docId); if (!d) return;
    let res, freres;
    try {
      const blob = await docBlob(docId); if (!blob) return api.toast(NOT_HERE, 'error');
      if (/\.(xls|doc)$/i.test(d.name)) return api.toast('Ancien format Excel/Word (.xls/.doc) : enregistrez-le en .xlsx ou .docx, ou en PDF.', 'error');
      freres = members(name).filter(p => p.civilite !== 'Sœur');
      if (!freres.length) return api.toast(`Aucun frère de ${name} dans l’annuaire : importez d’abord la liste de l’assemblée.`, 'error');
      res = App.organigramme.parse(await App.files.readLayout(new File([blob], d.name, {type: d.type})), freres);
    } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
    const ROLESET = new Set(App.organigramme.ROLES.flatMap(r => [r, r + ' adj.']));
    const found = new Map(res.result.map(r => [r.pid, r.roles]));
    const fullName = p => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
    const rows = freres.filter(p => found.has(p.id) || (p.resp || []).some(r => ROLESET.has(r)))
      .sort((a, b) => (found.has(b.id) - found.has(a.id)) || String(a.nom).localeCompare(String(b.nom), 'fr'));
    let nNew = 0;
    const html = rows.map(p => {
      const cur = p.resp || [], f = found.get(p.id) || [];
      const add = f.filter(r => !cur.includes(r)), keep = f.filter(r => cur.includes(r));
      // à retirer : absentes de l'organigramme (une « adj. » remplacée par la responsabilité principale part toute seule)
      const gone = cur.filter(r => ROLESET.has(r) && !f.includes(r) && !(r.endsWith(' adj.') && f.includes(r.slice(0, -5))));
      nNew += add.length;
      return `<tr data-pid="${p.id}"><td style="white-space:nowrap"><strong>${api.esc(fullName(p))}</strong>${p.fonction ? `<div class="small muted">${api.esc(p.fonction)}</div>` : ''}</td>
        <td>${add.map(r => `<label class="pill" style="background:#e3f4ea;color:#1d5a35;border-color:#a9d5b8;margin:1px;cursor:pointer"><input type="checkbox" data-add="${api.esc(r)}" checked> ${api.esc(r)}</label>`).join('')}
          ${keep.map(r => `<span class="pill" style="background:#fff;margin:1px" title="Déjà noté">${api.esc(r)} ✓</span>`).join('')}
          ${!f.length ? '<span class="small muted">Absent de l’organigramme</span>' : ''}</td>
        <td>${gone.map(r => `<label class="pill" style="background:#fdecec;color:#8a1f1f;border-color:#f0b4b4;margin:1px;cursor:pointer" title="Cocher pour retirer"><input type="checkbox" data-del="${api.esc(r)}" ${f.includes(r + ' adj.') ? 'checked' : ''}> ${api.esc(r)}${f.includes(r + ' adj.') ? ' (adjoint d’après l’organigramme)' : ''}</label>`).join('')}</td></tr>`;
    }).join('');
    const body = `<p class="small" style="margin-top:0">D’après <strong>${api.esc(d.name)}</strong>. En vert, les responsabilités à ajouter (décochez celles qui sont fausses). En rouge, celles notées dans l’application mais absentes de l’organigramme : cochez-les pour les retirer.</p>
      ${res.warn.length ? `<div class="notice warn small">Plusieurs frères trouvés pour : <strong>${res.warn.map(api.esc).join(', ')}</strong>. Vérifiez avant de valider.</div>` : ''}
      ${rows.length ? `<div class="table-wrap" style="max-height:55vh"><table class="list"><thead><tr><th>Frère</th><th>Dans l’organigramme</th><th>À retirer ?</th></tr></thead><tbody>${html}</tbody></table></div>`
        : '<div class="notice">Aucune responsabilité reconnue. Le document est peut-être scanné (image) ou sa présentation est inhabituelle : envoyez-le pour adapter la lecture.</div>'}
      ${res.unknown.length ? `<p class="small muted">Noms non retrouvés parmi les frères de ${api.esc(name)} : ${res.unknown.map(api.esc).join(', ')}. Vérifiez l’orthographe dans l’annuaire.</p>` : ''}`;
    const ok = await api.modal({title: `Responsabilités — ${name}`, body, wide: true,
      actions: [{label: 'Annuler', value: null}, ...(rows.length ? [{label: 'Valider', kind: 'primary', onClick: bodyEl => {
        let n = 0;
        for (const tr of api.$$('tr[data-pid]', bodyEl)) {
          const p = api.data.persons.find(x => x.id === tr.dataset.pid); if (!p) continue;
          const add = api.$$('input[data-add]:checked', tr).map(i => i.dataset.add), del = new Set(api.$$('input[data-del]:checked', tr).map(i => i.dataset.del));
          if (!add.length && !del.size) continue;
          p.resp = [...(p.resp || []).filter(r => !del.has(r) && !add.some(a => a === r + ' adj.' || r === a + ' adj.')), ...add];
          n += add.length + del.size;
        }
        api.save(); return n;
      }}] : [])]});
    if (ok !== null && ok !== undefined) { api.toast(ok ? `${ok} modification${ok > 1 ? 's' : ''} enregistrée${ok > 1 ? 's' : ''}` : 'Aucune modification'); redraw(); }
  }

  // Trombinoscope d'une assemblée : A4 paysage, 8 × 3 vignettes par page (photo ou initiales, nom, fonction et statut)
  async function trombiPdf(c, asm, rows) {
    const {PDFDocument, StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
    const doc = await PDFDocument.create(); doc.setTitle(`Trombinoscope ${asm} ${c.code}`); doc.setCreator('Mon Bureau');
    const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 841.89, H = 595.28, M = 28, COLS = 8, ROWS = 3, gap = 8, cw = (W - 2 * M - gap * (COLS - 1)) / COLS, top = 72, ch = (H - top - M - 14 - gap * (ROWS - 1)) / ROWS;
    const ink = rgb(.12, .14, .16), mute = rgb(.42, .45, .5), line = rgb(.82, .84, .87), blue = rgb(.12, .25, .4);
    const fct = p => fonctionAt(c, p) ?? p.fonction;
    const rank = r => fct(r.p) === 'Ancien' ? 0 : fct(r.p) === 'Assistant' ? 1 : 2;
    const list = [...rows].sort((a, b) => rank(a) - rank(b) || (a.p.nom || '').localeCompare(b.p.nom || '', 'fr') || (a.p.prenom || '').localeCompare(b.p.prenom || '', 'fr'));
    const fit = (t, f, size, w) => { t = T(t); while (t && f.widthOfTextAtSize(t, size) > w) t = t.slice(0, -2) + '…'; return t; };
    const per = COLS * ROWS, pages = Math.max(1, Math.ceil(list.length / per));
    const nbPhotos = list.filter(r => api.photos.get(r.p.id)).length;
    for (let pg = 0; pg < pages; pg++) {
      const page = doc.addPage([W, H]);
      page.drawText(T(`Trombinoscope — ${asm} — cycle ${c.code}`), {x: M, y: H - M - 14, size: 15, font: B, color: ink});
      page.drawText(T(`${list.length} proclamateurs · ${nbPhotos} photo(s) · page ${pg + 1}/${pages}`), {x: M, y: H - M - 28, size: 8.5, font: R, color: mute});
      page.drawText(T(`Mon Bureau · document confidentiel · imprimé le ${api.dateLongue()}`), {x: M, y: 12, size: 7, font: R, color: mute});
      for (let i = 0; i < per; i++) {
        const r = list[pg * per + i]; if (!r) break;
        const col = i % COLS, row = Math.floor(i / COLS), x = M + col * (cw + gap), yTop = H - top - row * (ch + gap);
        const ph = ch - 34, pw = cw;
        page.drawRectangle({x, y: yTop - ch, width: cw, height: ch, borderColor: line, borderWidth: .7});
        const src = api.photos.get(r.p.id);
        if (src) {
          const img = await doc.embedJpg(Uint8Array.from(atob(src.split(',')[1]), ch2 => ch2.charCodeAt(0)));
          const sc = Math.min(pw / img.width, ph / img.height), w = img.width * sc, h = img.height * sc;
          page.drawImage(img, {x: x + (pw - w) / 2, y: yTop - ph + (ph - h) / 2, width: w, height: h});
        } else {
          page.drawRectangle({x: x + 1, y: yTop - ph, width: pw - 2, height: ph - 1, color: rgb(.93, .94, .96)});
          const ini = T(((r.p.prenom || '')[0] || '') + ((r.p.nom || '')[0] || '')).toUpperCase();
          page.drawText(ini, {x: x + (pw - B.widthOfTextAtSize(ini, 26)) / 2, y: yTop - ph / 2 - 9, size: 26, font: B, color: rgb(.7, .73, .78)});
        }
        const f = fct(r.p), info = [f && !['Radié'].includes(f) ? f : '', ['PP', 'PS', 'PAP', 'PNB', 'IN'].includes(r.e.statut) ? r.e.statut : ''].filter(Boolean).join(' · ');
        page.drawText(fit((r.p.nom || '').toUpperCase(), B, 8.5, cw - 6), {x: x + 3, y: yTop - ph - 11, size: 8.5, font: B, color: f === 'Ancien' || f === 'Assistant' ? blue : ink});
        page.drawText(fit(r.p.prenom || '', R, 8, cw - 6), {x: x + 3, y: yTop - ph - 21, size: 8, font: R, color: ink});
        if (info) page.drawText(fit(info, R, 7, cw - 6), {x: x + 3, y: yTop - ph - 30, size: 7, font: R, color: mute});
      }
    }
    return new Blob([await doc.save()], {type: 'application/pdf'});
  }

  // Bilan imprimable d'une assemblée pour un cycle — une page A4 paysage (la taille du texte s'adapte pour tenir)
  async function bilanPdf(c, asm, statItems, rows, allRows = rows) {
    const {PDFDocument, StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
    const plain = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').trim();
    const nm = p => `${(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
    const fct = p => fonctionAt(c, p) ?? p.fonction;
    const eb = r => Number(r.e.eb) || 0, pa = r => Number(r.e.pa) || 0;

    // Territoires et assistances : valeur du cycle, sinon du dernier cycle renseigné
    const cycUp = sortedCycles().filter(x => x.code <= c.code).reverse();
    const lastVal = k => { for (const x of cycUp) { const v = n(x.valeurs[asm]?.[k]); if (v !== null) return {v, code: x.code}; } return null; };
    const prevOf = (k, code) => { const l = cycUp.filter(x => x.code < code); for (const x of l) { const v = n(x.valeurs[asm]?.[k]); if (v !== null) return {v, code: x.code}; } return null; };
    const extra = [];
    const addExtra = (lab, k, pctOf) => {
      const cur = lastVal(k); if (!cur) return extra.push({lab, v: '—', subs: []});
      const subs = [];
      if (pctOf) { const t = lastVal(pctOf); if (t && t.v) subs.push(`${Math.round(cur.v / t.v * 100)} % des territoires`); }
      if (cur.code !== c.code) subs.push(`chiffre de ${cur.code}`);
      const pr = prevOf(k, cur.code); if (pr) subs.push(`${pr.code} : ${pr.v}`);
      extra.push({lab, v: String(cur.v), subs});
    };
    addExtra('Assistance semaine', 'sem'); addExtra('Assistance week-end', 'we');
    addExtra('Territoires', 'terr'); addExtra('Non parcourus depuis 1 an', 'nonparc', 'terr');
    extra.forEach((x, i) => x.bg = i < 2 ? 'ciel' : 'orange');

    const groups = [
      ['Anciens', rows.filter(r => fct(r.p) === 'Ancien'), true],
      ['Assistants', rows.filter(r => fct(r.p) === 'Assistant'), true],
      ['Pionniers permanents (PP)', rows.filter(r => r.e.statut === 'PP'), false],
      ['Pionniers spéciaux (PS)', rows.filter(r => r.e.statut === 'PS'), false]];
    const objectif = monthsElapsed(c) * HEURES_MOIS;
    const heures = r => { const h = r.e.heures; if (h === null || h === undefined || h === '') return ''; return `${h} h (${Math.round(Number(h) / objectif * 100)} %)`; };
    const activite = r => { const b = [];
      if (['PP', 'PS', 'PAP', 'IN', 'PNB'].includes(r.e.statut)) b.push(r.e.statut); else if (pa(r)) b.push(`PA ${pa(r)}×`);
      if (r.e.statut === 'PP' && heures(r)) b.push(heures(r));
      if (eb(r)) b.push(`${eb(r)} EB`);
      return b; };
    const detail = (r, nomme) => {
      const bits = [];
      // bilan PDF : responsabilités principales seulement (les services comme accueil, comptes, audio/vidéo restent visibles dans le tableau)
      const PDF_RESP = ['CCA', 'Secrétaire', 'Resp. Prédication', 'TG', 'VCM', 'Conseiller adj.', 'Resp. de groupe', 'Aumônier', 'CLH', 'LDC', 'Télévolontaire', 'Comité de gestion'];
      const rp = (r.p.resp || []).filter(x => PDF_RESP.includes(x.replace(/ adj\.$/, '')));
      if (rp.length) bits.push(rp.join(', '));
      if (!nomme && fct(r.p) && !['Radié', 'Démission'].includes(fct(r.p))) bits.push(fct(r.p));
      if (nomme) bits.push(...activite(r));
      else { if (heures(r)) bits.push(heures(r)); if (eb(r)) bits.push(`${eb(r)} EB`); }
      return bits.join(' · ');
    };
    const rowOf = q => rows.find(r => r.p.id === q.id) || {p: q, e: entry(c, q)};
    const jauneOf = r => { const ps = prevStatut(c, r.p), ev = r.e.evt || autoEvt(ps, r.e.statut); return sigList(c, r.p, r.e, ps, ev).some(x => SIG_JAUNE.includes(x)); };
    // Un bloc par frère (avec son épouse sur la 2e ligne du même bloc) ou par pionnier
    const blocksOf = (l, nomme) => l.map((r, bi) => {
      const sp = nomme ? spouseOf(r.p) : null;
      return {name: nm(r.p), d: detail(r, nomme), bi, hi: jauneOf(r), pid: r.p.id, sub: sp ? {name: `Épouse : ${sp.prenom || ''}`, d: activite(rowOf(sp)).join(' · '), pid: sp.id} : null};
    });
    const linesOf = (l, nomme) => l.flatMap((r, bi) => {
      const out = [{name: nm(r.p), d: detail(r, nomme), bi, hi: jauneOf(r), pid: r.p.id}];
      const sp = nomme ? spouseOf(r.p) : null;
      if (sp) { const sr = rowOf(sp); out.push({name: `Épouse : ${sp.prenom || ''}`, d: activite(sr).join(' · '), sub: true, bi, pid: sp.id}); }
      return out;
    });
    // Signalements : lignes surlignées et évolutions depuis le cycle précédent, regroupées par motif
    const ORDRE = ['Proposition ancien', 'Proposition assistant', 'Sous restrictions', 'Blâme', 'Démission', 'Baptême', 'Nouveau PNB', 'Nouveau PP', 'Nouveau PAP', 'Nouveau PS', 'Arrêt PP', 'AE', 'Radié', 'De nouveau actif', 'Nouvelle IN', 'Emménagement', 'Nouveau dans la liste', 'Déménagement', 'Décédé(e)', 'Surligné'];
    const sigGroups = {};
    for (const r of allRows) {
      const ps = prevStatut(c, r.p), ev = r.e.evt || autoEvt(ps, r.e.statut);
      const motifs = [...sigList(c, r.p, r.e, ps, ev), ev].filter(Boolean).map(x => x === 'Sans raison' ? 'Surligné' : (SHORT[x] || x));
      for (const m of new Set(motifs)) (sigGroups[m] ??= []).push(nm(r.p));
    }
    const sigOrder = Object.keys(sigGroups).sort((a, b) => ((ORDRE.indexOf(a) + 1) || 99) - ((ORDRE.indexOf(b) + 1) || 99));
    const ir = rows.filter(r => r.e.ir > 0).sort((a, b) => b.e.ir - a.e.ir || nm(a.p).localeCompare(nm(b.p), 'fr'));

    async function build(k, kc = k, paging = false) {
      const doc = await PDFDocument.create(); doc.setTitle(`Bilan ${asm} ${c.code}`); doc.setCreator('Mon Bureau');
      const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
      const W = 841.89, H = 595.28, M = 26, ink = rgb(.12, .14, .16), mute = rgb(.42, .45, .5), line = rgb(.82, .84, .87), blue = rgb(.12, .25, .4);
      const jaune2 = rgb(1, .91, .4), jaune = rgb(1, .97, .78), ciel = rgb(.86, .93, .99), orange = rgb(1, .92, .82), red = rgb(.78, .1, .1);
      let page = doc.addPage([W, H]), y = H - M, over = false;
      const S = v => v * k, Sc = v => v * kc;   // Sc : bilan chiffré, réduit en premier pour tenir sur une page
      const txt = (t, x, yy, o = {}) => page.drawText(T(t), {x, y: yy, size: o.size || S(9.5), font: o.bold ? B : R, color: o.color || ink});
      const fit = (t, f, size, w) => { t = T(t); while (t && f.widthOfTextAtSize(t, size) > w) t = t.slice(0, -2) + '…'; return t; };
      const footer = () => page.drawText(T(`Mon Bureau · ${asm} · cycle ${c.code} · imprimé le ${api.dateLongue()}`), {x: M, y: 12, size: 7, font: R, color: mute});
      const need = h => { if (y - h < M + 10) { if (paging) { page = doc.addPage([W, H]); y = H - M; footer(); } else over = true; } };
      const section = t => { y -= S(4); txt(t, M, y - S(11), {bold: true, size: S(12), color: blue}); y -= S(16); page.drawLine({start: {x: M, y}, end: {x: W - M, y}, thickness: .7, color: blue}); y -= S(6); };
      footer();

      const x0 = particul(asm), tags = [x0.aum ? `Assemblée référente aumônerie en prison${x0.lieu ? ' (' + x0.lieu + ')' : ''}` : '', ...x0.groupes].filter(Boolean).join(' · ');
      txt(`Bilan du cycle ${c.code} — ${asm}`, M, y - S(15), {bold: true, size: S(16)});
      if (tags) txt(tags, M + B.widthOfTextAtSize(T(`Bilan du cycle ${c.code} — ${asm}`), S(16)) + 14, y - S(14), {size: S(8.5), color: mute});
      y -= S(20);

      // Chiffres : cases sur 2 lignes
      section('Chiffres du bilan');
      const items = [...statItems.map(s => ({lab: s.lab, v: String(s.v), subs: plain(s.sub).split(/\n| · /).map(l => l.trim()).filter(Boolean), red: s.red})), ...extra];
      // 1re ligne : les chiffres principaux (jusqu'à IN) ; 2e ligne : les autres
      const mainN = statItems.findIndex(s => s.lab === 'IN') + 1 || Math.ceil(items.length / 2);
      const rowsIt = [items.slice(0, mainN), items.slice(mainN)].filter(r => r.length);
      const cols = Math.max(...rowsIt.map(r => r.length)), gap = 4, bw = (W - 2 * M - gap * (cols - 1)) / cols;
      const wrap = (t, w, size) => { const out = []; let cur = ''; for (const wd of T(t).split(' ')) { const nx = cur ? cur + ' ' + wd : wd; if (R.widthOfTextAtSize(nx, size) > w && cur) { out.push(cur); cur = wd; } else cur = nx; } if (cur) out.push(cur); return out; };
      for (const it of items) { it.labL = wrap(it.lab, bw - 8, Sc(8)); it.subL = it.subs.flatMap(l => wrap(l, bw - 8, Sc(7.5))); }
      for (const rowIt of rowsIt) {
        const bh = Sc(5) + Sc(9.2) * Math.max(...rowIt.map(s => s.labL.length)) + Sc(18) + Sc(8.6) * Math.max(0, ...rowIt.map(s => s.subL.length)) + Sc(4);
        need(bh + gap);
        rowIt.forEach((s, j) => {
          const bx = M + j * (bw + gap);
          page.drawRectangle({x: bx, y: y - bh, width: bw, height: bh, borderColor: line, borderWidth: .7, color: s.bg === 'ciel' ? ciel : s.bg === 'orange' ? orange : s.red ? jaune : rgb(1, 1, 1)});
          let yy = y - Sc(10);
          s.labL.forEach((l, li) => txt(l, bx + 4, yy - li * Sc(9.2), {size: Sc(8), color: mute}));
          yy -= Sc(9.2) * Math.max(...rowIt.map(x => x.labL.length));   // chiffres alignés sur la même ligne
          txt(s.v, bx + (bw - B.widthOfTextAtSize(T(s.v), Sc(15))) / 2, yy - Sc(10), {bold: true, size: Sc(15), color: s.red ? red : ink}); yy -= Sc(20);
          s.subL.forEach(l => { txt(l, bx + 4, yy, {size: Sc(7.5), color: mute}); yy -= Sc(8.6); });
        });
        y -= bh + gap;
      }

      // Frères nommés et pionniers : 4 colonnes
      section('Frères nommés et pionniers');
      const cw = (W - 2 * M - 3 * 10) / 4, lh = S(11.5), fs = S(9.5), fd = S(8.3);
      groups.forEach(([t, l], gi) => txt(`${t} (${l.length})`, M + gi * (cw + 10), y - S(10), {bold: true, size: S(10)}));
      y -= S(13);
      const cols4 = groups.map(([, l, nomme]) => blocksOf(l, nomme));
      // Photos (trombinoscope) alignées à gauche ; le frère et son épouse partagent le même bloc
      const all = cols4.flat(), withPhoto = all.some(bk => api.photos.get(bk.pid) || (bk.sub && api.photos.get(bk.sub.pid)));
      const twoPh = withPhoto && all.some(bk => bk.sub && api.photos.get(bk.sub.pid));
      const phS = S(24), imgs = {};
      const photoOf = async pid => { const src = api.photos.get(pid); if (!src) return null; return imgs[pid] ??= await doc.embedJpg(Uint8Array.from(atob(src.split(',')[1]), ch => ch.charCodeAt(0))); };
      const hOf = bk => !bk ? 0 : withPhoto ? Math.max(phS, bk.sub ? S(23) : 0) + S(3) : (bk.sub ? S(22) : lh);
      // Chaque colonne se remplit indépendamment (pas de ligne vide quand une colonne a des blocs plus hauts)
      const colH = cols4.map(l => l.reduce((t, bk) => t + hOf(bk), 0)), totH = Math.max(lh, ...colH);
      need(totH);
      const y0 = y;
      for (let gi = 0; gi < cols4.length; gi++) {
        let yc = y0;
        for (const bk of cols4[gi]) {
          const hR = hOf(bk), x0 = M + gi * (cw + 10);
          if (bk.hi) page.drawRectangle({x: x0 - 2, y: yc - hR, width: cw + 4, height: hR, color: jaune2});
          else if (bk.bi % 2 === 0) page.drawRectangle({x: x0 - 2, y: yc - hR, width: cw + 4, height: hR, color: ciel});
          let tx = x0;
          if (withPhoto) {
            const im = await photoOf(bk.pid); if (im) page.drawImage(im, {x: x0, y: yc - phS - S(1.5), width: phS, height: phS});
            if (twoPh) { const im2 = bk.sub ? await photoOf(bk.sub.pid) : null; if (im2) page.drawImage(im2, {x: x0 + phS + S(2), y: yc - phS - S(1.5), width: phS, height: phS}); }
            tx = x0 + (twoPh ? 2 * phS + S(6) : phS + S(4));
          }
          const wmax = cw - (tx - x0);
          const line = (t, d, yb, bold) => { const f1 = bold ? B : R, s1 = bold ? fs : fd; const n1 = fit(t, f1, s1, d ? wmax * .6 : wmax), w1 = f1.widthOfTextAtSize(n1, s1);
            txt(n1, tx, yb, {size: s1, bold, color: bold ? ink : mute}); if (d) txt(fit(d, R, fd, wmax - w1 - 5), tx + w1 + 4, yb, {size: fd, color: mute}); };
          if (bk.sub) { line(bk.name, bk.d, yc - S(10), true); line(bk.sub.name, bk.sub.d, yc - S(20), false); }
          else line(bk.name, bk.d, withPhoto ? yc - hR / 2 - S(3) : yc - S(9), true);
          yc -= hR;
        }
      }
      y = y0 - totH;

      // Irréguliers : colonnes
      section(`Proclamateurs irréguliers (IR) — ${ir.length}`);
      if (!ir.length) { txt('Aucun', M, y - S(9), {color: mute, size: S(9)}); y -= lh; }
      const icol = 5, iw = (W - 2 * M) / icol, per = Math.ceil(ir.length / icol);
      if (!paging) need(per * lh);
      for (let kk = 0; kk < per; kk++) {
        if (paging) need(lh);
        for (let j = 0; j < icol; j++) { const r = ir[j * per + kk]; if (!r) continue; const cx = M + j * iw, tail = `${r.e.ir}×${r.e.statut === 'PNB' ? ' PNB' : ''}`;
          txt(fit(nm(r.p), R, fs, iw - S(52)), cx, y - S(9), {size: fs}); txt(tail, cx + iw - S(48), y - S(9), {size: fd, color: mute}); }
        y -= lh;
      }
      // Signalements
      if (sigOrder.length) {
        section(`Signalements — ${new Set(Object.values(sigGroups).flat()).size} proclamateur(s)`);
        const wmax = W - 2 * M;
        for (const m of sigOrder) {
          const lab = `${m} (${sigGroups[m].length}) : `, lw = B.widthOfTextAtSize(T(lab), fs);
          const words = sigGroups[m].join(', ').split(' '), out = []; let cur = '';
          for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (R.widthOfTextAtSize(T(nx), fs) > wmax - lw && cur) { out.push(cur); cur = w; } else cur = nx; }
          if (cur) out.push(cur);
          need(out.length * lh);
          if (SIG_JAUNE.includes(m)) page.drawRectangle({x: M - 2, y: y - out.length * lh - S(1), width: lw + Math.max(...out.map(l => R.widthOfTextAtSize(T(l), fs))) + 6, height: out.length * lh, color: jaune2});
          txt(lab, M, y - S(9), {bold: true, size: fs, color: m === 'AE' || m === 'Radié' ? rgb(.78, .1, .1) : ink});
          out.forEach((l, i) => { txt(l, M + lw, y - S(9), {size: fs}); y -= lh; });
        }
      }
      return {doc, over};
    }
    let res;
    // Une page si possible sans descendre sous une taille lisible ; sinon le bilan continue sur une 2e page
    // Toujours une seule page : on réduit d'abord le bilan chiffré, puis, si besoin, le reste
    for (const [k, kc] of [[1, .9], [1, .8], [.95, .78], [.9, .76], [.85, .74], [.8, .72], [.76, .7], [.72, .68], [.68, .65], [.64, .62], [.6, .58], [.55, .55], [.5, .5]]) { res = await build(k, kc); if (!res.over) break; }
    if (organi(asm).any) await orgPage(res.doc, c, asm);   // verso : organigramme
    return new Blob([await res.doc.save()], {type: 'application/pdf'});
  }
  // Verso du bilan : organigramme en cases reliées (Collège des anciens → Comité de service → services supervisés)
  async function orgPage(doc, c, asm) {
    const {StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
    const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold), I = await doc.embedFont(StandardFonts.HelveticaOblique);
    const W = 841.89, H = 595.28, M = 30, page = doc.addPage([W, H]);
    const ink = rgb(.1, .1, .12), mute = rgb(.42, .45, .5), red = rgb(.85, .1, .1), white = rgb(1, 1, 1);
    const COL = {vert: rgb(.1, .75, .55), orange: rgb(.93, .49, .19), bleu: rgb(.04, .56, 1), violet: rgb(.47, .36, .68), gris: rgb(.38, .44, .52)};
    const o = organi(asm), nm = p => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
    const Y = t => H - t;   // coordonnées depuis le haut
    const width = (t, f, sz) => f.widthOfTextAtSize(T(t), sz);
    const center = (t, f, sz, cx, top, color) => page.drawText(T(t), {x: cx - width(t, f, sz) / 2, y: Y(top), size: sz, font: f, color});
    const fitT = (t, f, sz, w) => { t = T(t); while (t && f.widthOfTextAtSize(t, sz) > w) t = t.slice(0, -2) + '…'; return t; };
    const wrapT = (t, f, sz, w) => { const out = []; let cur = ''; for (const wd of T(t).split(' ')) { const nx = cur ? cur + ' ' + wd : wd; if (f.widthOfTextAtSize(nx, sz) > w && cur) { out.push(cur); cur = wd; } else cur = nx; } if (cur) out.push(cur); return out; };
    const line = (x1, t1, x2, t2, color) => page.drawLine({start: {x: x1, y: Y(t1)}, end: {x: x2, y: Y(t2)}, thickness: 1.2, color});
    const MAXN = 6, HL = 10.5, NL = 12;
    const peopleOf = x => { const l = [...(!x.main.length && x.adj.length ? [{t: 'à pourvoir', miss: true}] : []), ...x.main.map(p => ({t: nm(p), b: true})), ...x.adj.map(p => ({t: nm(p) + ' (adj.)', b: false}))];
      return l.length > MAXN ? [...l.slice(0, MAXN - 1), {t: `+ ${l.length - MAXN + 1} autres`, b: false}] : l; };
    const measure = (title, w, x, note, body) => { const tl = wrapT(title.toUpperCase(), B, 8.5, w - 8); const pl = body ? [body] : peopleOf(x); const nl = note ? wrapT(note, I, 6.8, w - 8) : [];
      return {tl, pl, nl, th: 7 + tl.length * HL, bh: 5 + Math.max(1, pl.length) * NL + nl.length * 8.5 + 2}; };
    function box(x, top, w, title, color, who, note, body) {
      const m = measure(title, w, who, note, body), cx = x + w / 2;
      page.drawRectangle({x, y: Y(top + m.th), width: w, height: m.th, color});
      m.tl.forEach((l, i) => center(l, B, 8.5, cx, top + 4 + (i + 1) * HL - 2.5, white));
      page.drawRectangle({x, y: Y(top + m.th + m.bh), width: w, height: m.bh, color: white, borderColor: color, borderWidth: 1});
      let yy = top + m.th + 3;
      if (body) { yy += NL; center(fitT(body, R, 8, w - 6), R, 8, cx, yy - 3, mute); }
      else if (!m.pl.length) { yy += NL; center('à pourvoir', I, 8, cx, yy - 3, red); }
      else for (const pp of m.pl) { yy += NL; const f = pp.miss ? I : pp.b ? B : R; center(fitT(pp.t, f, 8, w - 6), f, 8, cx, yy - 3, pp.miss ? red : ink); }
      for (const l of m.nl) { yy += 8.5; center(l, I, 6.8, cx, yy - 1.5, mute); }
      return {cx, top, bottom: top + m.th + m.bh};
    }
    // Titre
    center(`ORGANIGRAMME — ASSEMBLÉE ${asm.toUpperCase()}`, B, 15, W / 2, 38, ink);
    center(`Cycle ${c.code} · d’après les responsabilités notées dans Mon Bureau`, R, 8.5, W / 2, 52, mute);
    if (o.manque.length || o.doublons.length) center(fitT([o.manque.length ? 'À pourvoir ou non renseigné : ' + o.manque.join(', ') : '', o.doublons.length ? 'À vérifier : ' + o.doublons.join(', ') : ''].filter(Boolean).join('   ·   '), R, 8, W - 2 * M), R, 8, W / 2, 65, red);
    // Collège des anciens
    const mem = members(asm), fct = p => fonctionAt(c, p) ?? p.fonction;
    const nA = mem.filter(p => fct(p) === 'Ancien').length, nS = mem.filter(p => fct(p) === 'Assistant').length;
    const head = box(W / 2 - 110, 76, 220, 'Collège des anciens', COL.vert, null, null, `${nA} ancien${nA > 1 ? 's' : ''} · ${nS} assistant${nS > 1 ? 's' : ''}`);
    // Comité de service (3 cases) au-dessus de leurs services (6 colonnes)
    const g = 12, sw = (W - 2 * M - 5 * g) / 6, slotX = i => M + i * (sw + g);
    const colors = [COL.orange, COL.bleu, COL.violet], spans = [[0, 3], [3, 1], [4, 2]];
    const chefTop = head.bottom + 34;
    const chefs = o.blocks.map((b, i) => { const [a, n] = spans[i], gx = slotX(a), gw = n * sw + (n - 1) * g, w = Math.min(gw, n > 1 ? 210 : sw);
      return {b, i, x: gx + (gw - w) / 2, w}; });
    const drawn = chefs.map(ch => box(ch.x, chefTop, ch.w, ch.b.titre, colors[ch.i], ch.b.chefs, ch.b.aussi ? 'Aussi : ' + ch.b.aussi : ''));
    const bar1 = head.bottom + 17;
    line(head.cx, head.bottom, head.cx, bar1, COL.vert); line(drawn[0].cx, bar1, drawn[2].cx, bar1, COL.vert);
    drawn.forEach(d => line(d.cx, bar1, d.cx, chefTop, COL.vert));
    const svcTop = Math.max(...drawn.map(d => d.bottom)) + 34;
    let svcBottom = svcTop;
    chefs.forEach((ch, i) => {
      const [a] = spans[i], d = drawn[i], bar = svcTop - 15;
      const sv = ch.b.svc.map((x, k) => box(slotX(a + k), svcTop, sw, x.l.replace(/^Préposés? (aux?|à l’) ?/i, '').replace(/^Programme des /, ''), colors[i], x));
      svcBottom = Math.max(svcBottom, ...sv.map(v => v.bottom));
      line(d.cx, d.bottom, d.cx, bar, colors[i]);
      if (sv.length > 1) line(sv[0].cx, bar, sv.at(-1).cx, bar, colors[i]);
      sv.forEach(v => { line(v.cx, bar, v.cx, svcTop, colors[i]); if (sv.length === 1) line(d.cx, bar, v.cx, bar, colors[i]); });
    });
    // Autres responsabilités (TG et VCM toujours présents)
    const autres = [...new Set(['TG', 'VCM', ...o.autres.map(x => x.r)])].map(r => ({r, ...(o.autres.find(x => x.r === r) || {main: [], adj: []})}));
    const grp = (() => { const l = mem.filter(p => !['Radié', 'Démission'].includes(p.fonction)); return {main: l.filter(p => (p.resp || []).includes('Resp. de groupe')), adj: l.filter(p => (p.resp || []).includes('Resp. de groupe adj.'))}; })();
    if (grp.main.length || grp.adj.length) autres.push({r: 'Resp. de groupe', ...grp});
    const LBL = {TG: 'Conducteur Tour de Garde', VCM: 'Réunion Vie et ministère', 'Conseiller adj.': 'Conseiller adjoint', 'Comité de gestion': 'Comité de gestion', 'Resp. de groupe': 'Responsables de groupe', LDC: 'LDC', CLH: 'CLH'};
    let top = svcBottom + 30;
    page.drawText(T('AUTRES RESPONSABILITÉS'), {x: M, y: Y(top - 8), size: 8.5, font: B, color: COL.gris}); top += 2;
    for (let i = 0; i < autres.length; i += 6) {
      const row = autres.slice(i, i + 6).map((x, k) => box(slotX(k), top, sw, LBL[x.r] || x.r, COL.gris, x));
      top = Math.max(...row.map(v => v.bottom)) + 12;
    }
    page.drawText(T(`Mon Bureau · ${asm} · cycle ${c.code} · imprimé le ${api.dateLongue()}`), {x: M, y: 12, size: 7, font: R, color: mute});
  }
  function assembleeView(el, name) {
    const S = store(), cycles = sortedCycles();
    const f = S.fiches[name] ??= {};
    const mem = members(name), last = cycles.at(-1);
    const anc = mem.filter(p => p.fonction === 'Ancien').length, ass = mem.filter(p => p.fonction === 'Assistant').length;
    const keyInds = IND.filter(i => ['a', 'ass', 'procl', 'ir', 'eb', 'pp', 'pa', 'sem', 'we', 'vsem', 'vwe', 'memorial', 'terr', 'nonparc', 'bapt'].includes(i.k));
    el.innerHTML = `<div class="page-head"><div><h1>${api.esc(name)} <span style="font-size:14px;vertical-align:middle">${badges(name)}</span></h1><p><a href="#/circonscription">← Tableau de bord</a> · <a href="#/circonscription/proclamateurs/${encodeURIComponent(name)}">Étude des proclamateurs</a></p></div>
      <div class="row"><button class="btn" id="fPdf">Fiche de préparation de visite (PDF)</button><button class="btn primary" id="fSave">Enregistrer la fiche</button></div></div>
      ${particulCard(name)}
      ${docsCard(name)}
      ${organiCard(name)}
      <div class="grid" style="margin-bottom:16px">
        <div class="card"><div class="muted small">Dans l'annuaire</div><div class="stat">${mem.length}</div><div class="small muted">${anc} anciens · ${ass} assistants</div></div>
        ${last ? ['procl', 'pp', 'sem'].map(k => { const v = n(last.valeurs[name]?.[k]); const pv = prevCycle(last) ? n(prevCycle(last).valeurs[name]?.[k]) : null;
          return `<div class="card"><div class="muted small">${IND.find(i => i.k === k).t || IND.find(i => i.k === k).l} (${last.code})</div><div class="stat">${fmt(v) || '—'}</div><div class="small muted">${v !== null && pv !== null ? `${v - pv >= 0 ? '+' : ''}${fmt(v - pv)} par rapport à ${prevCycle(last).code}` : ''}</div></div>`; }).join('') : ''}
      </div>
      <div class="card stack" style="margin-bottom:16px"><strong>Indicateurs par cycle</strong>
        <div class="table-wrap"><table class="list"><thead><tr><th>Cycle</th>${keyInds.map(i => `<th style="text-align:right" title="${api.esc(i.t || i.l)}">${api.esc(i.l)}</th>`).join('')}</tr></thead><tbody>
        ${cycles.map(c => `<tr><td><strong>${c.code}</strong></td>${keyInds.map(i => `<td style="text-align:right">${fmt(n(c.valeurs[name]?.[i.k]))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${keyInds.length + 1}" class="muted">Aucun cycle.</td></tr>`}</tbody></table></div>
        ${cycles.length ? lineChart(cycles.map(c => c.code), [
          {name: 'Proclamateurs', values: cycles.map(c => n(c.valeurs[name]?.procl))}, {name: 'Assistance semaine', values: cycles.map(c => n(c.valeurs[name]?.sem))},
          {name: 'Assistance WE', values: cycles.map(c => n(c.valeurs[name]?.we))}], {title: 'Proclamateurs et assistance'}) : ''}
        ${cycles.some(c => c.notes[name]) ? `<div class="small"><strong>Remarques des cycles :</strong><ul style="margin:4px 0">${cycles.filter(c => c.notes[name]).map(c => `<li>${c.code} : ${api.esc(c.notes[name])}</li>`).join('')}</ul></div>` : ''}
      </div>
      <form class="card stack" id="fForm" onsubmit="return false"><strong>Fiche de l'assemblée</strong>
        <div class="form-grid">${FICHE.map(x => `<label class="field ${x.long ? 'wide' : ''}"><span>${x.l}</span>${x.long ? `<textarea name="${x.k}" rows="${x.k === 'points' ? 5 : 2}">${api.esc(f[x.k] || '')}</textarea>` : `<input type="text" name="${x.k}" value="${api.esc(f[x.k] || '')}">`}</label>`).join('')}</div>
        <p class="small muted" style="margin:0">Les codes (alarme, Wi-Fi, Zoom) se rangent dans le <a href="#/coffre">Coffre</a>.</p></form>`;
    const saveForm = () => { const fm = api.$('#fForm', el); for (const x of FICHE) f[x.k] = fm[x.k].value.trim(); api.save(); };
    api.$('#fSave', el).addEventListener('click', () => { saveForm(); api.toast('Fiche enregistrée'); });
    bindParticul(el, name, () => { saveForm(); assembleeView(el, name); });
    bindDocs(el, name, () => { saveForm(); assembleeView(el, name); });
    api.$('#fPdf', el).addEventListener('click', async () => {
      saveForm();
      const prof = api.data.settings.profil, prev = last ? prevCycle(last) : null;
      const line = i => { const v = last ? n(last.valeurs[name]?.[i.k]) : null, p = prev ? n(prev.valeurs[name]?.[i.k]) : null;
        return v === null ? '' : `<li><b>${api.esc(i.t || i.l)}</b> : ${fmt(v)}${p !== null ? ` (${prev.code} : ${fmt(p)})` : ''}</li>`; };
      const html = `<h2>Préparation de visite — ${api.esc(name)}</h2><p>${api.esc(api.dateLongue())}${prof.nom ? ' · ' + api.esc(prof.prenom + ' ' + prof.nom) : ''}</p>
        <h3>Points pour la visite</h3>${(f.points || '—').split('\n').map(l => `<p>${api.esc(l)}</p>`).join('')}
        ${last ? `<h3>Indicateurs du cycle ${last.code}</h3><ul>${keyInds.map(line).join('')}</ul>` : ''}
        ${last?.notes[name] ? `<p><b>Remarque :</b> ${api.esc(last.notes[name])}</p>` : ''}
        <h3>Annuaire</h3><p>${mem.length} personnes, dont ${anc} anciens et ${ass} assistants.</p>
        ${mem.filter(p => p.fonction).length ? `<ul>${mem.filter(p => p.fonction).sort((a, b) => a.fonction.localeCompare(b.fonction) || a.nom.localeCompare(b.nom)).map(p => `<li>${api.esc(p.fonction)} : ${api.esc(p.prenom + ' ' + p.nom)}${p.telephone ? ' — ' + api.esc(p.telephone) : ''}</li>`).join('')}</ul>` : ''}
        <h3>Témoignage et salle</h3><ul>${FICHE.filter(x => !['points', 'remarques'].includes(x.k) && f[x.k]).map(x => `<li><b>${x.l}</b> : ${api.esc(f[x.k]).replace(/\n/g, ' ; ')}</li>`).join('')}</ul>
        ${f.remarques ? `<h3>Remarques</h3><p>${api.esc(f.remarques)}</p>` : ''}`;
      api.download(App.pdf.fileName(`Préparation visite - ${name}`) + '.pdf', await App.pdf.render(html, {title: `Préparation de visite — ${name}`}), 'application/pdf');
    });
  }


  /* ---------- Étude proclamateur par proclamateur ---------- */
  // « NP » : inscrit dans l'annuaire sans être proclamateur ni PNB (un proclamateur est nécessairement baptisé)
  const STATUTS = [{v: '', l: 'Proclamateur'}, {v: 'PNB', l: 'PNB'}, {v: 'IN', l: 'IN'}, {v: 'PP', l: 'PP'}, {v: 'PAP', l: 'PAP'}, {v: 'PS', l: 'PS'}, {v: 'NP', l: 'Non proclamateur'}];
  const ACTIF = st => st === '' || st === 'PP' || st === 'PAP' || st === 'PS' || st === undefined;   // baptisé et actif
  const EVTS = ['Nouveau dans la liste', 'Emménagement', 'De nouveau actif', 'Devenu inactif', 'Baptisé', 'Nouveau PNB', 'Déménagement', 'Décédé(e)'];
  const DEPARTS = ['Déménagement', 'Décédé(e)'];   // retirés de la liste et de l'annuaire au cycle suivant
  const SHORT = {'Devenu inactif': 'Nouvelle IN', 'Baptisé': 'Baptême'};
  const EVT_STYLE = {'Nouveau dans la liste': 'ok', 'Emménagement': 'ok', 'De nouveau actif': 'ok', 'Baptisé': 'ok', 'Nouveau PNB': 'ok', 'Devenu inactif': 'warn', 'Déménagement': 'warn', 'Décédé(e)': 'warn'};
  // Évolution déduite du statut au cycle précédent
  function autoEvt(prevSt, st) {
    if (prevSt === undefined) return '';
    if (prevSt === 'IN' && ACTIF(st)) return 'De nouveau actif';
    if (ACTIF(prevSt) && st === 'IN') return 'Devenu inactif';
    if (prevSt === 'PNB' && ACTIF(st)) return 'Baptisé';
    if (prevSt === 'NP' && st === 'PNB') return 'Nouveau PNB';
    return '';
  }
  // Ligne à surligner : nouveau PNB, baptême, nouveau PP, nouveau PAP, proposition comme ancien ou assistant
  const SIGNALS = ['Nouveau PNB', 'Baptême', 'Nouveau PP', 'Nouveau PAP', 'Proposition ancien', 'Proposition assistant'];
  const SIG_ONLY = ['Nouveau PP', 'Nouveau PAP', 'Nouveau PS', 'Arrêt PP', 'Proposition ancien', 'Proposition assistant', 'Sous restrictions', 'Blâme', 'Sans raison'];
  const SIG_JAUNE = ['Proposition ancien', 'Proposition assistant', 'Sous restrictions', 'Blâme', 'Démission'];   // surlignés en jaune dans le bilan PDF
  const SIG_LABEL = x => x === 'Sans raison' ? 'Surligner sans raison' : x;
  const hasAE = t => /(^|[^A-Za-zÀ-ÿ])AE([^A-Za-zÀ-ÿ]|$)/.test(t || '');
  // Texte du suivi avec « AE » en gras rouge surligné
  const fmtSuivi = t => api.esc(t || '').replace(/(^|[^A-Za-zÀ-ÿ])AE(?=[^A-Za-zÀ-ÿ]|$)/g, '$1<b style="color:#c00;background:#ffe866;padding:0 2px">AE</b>');
  // Premier cycle (jusqu'à c) où la personne est notée radiée
  function radieDepuis(c, p) {
    let first = '';
    for (const x of sortedCycles()) { if (x.code > c.code) break; const f = fonctionAt(x, p); if (f === 'Radié') { if (!first) first = x.code; } else if (f !== undefined) first = ''; }
    return first;
  }
  // Toutes les raisons de surligner une ligne pour le cycle c
  function sigList(c, p, e, ps, ev) {
    if (e.signal === 'Aucun') return [];
    const out = [];
    if (e.signal) out.push(e.signal);
    const a = autoSignal(ps, e.statut, ev); if (a) out.push(a);
    if (hasAE(suiviOf(c, p, e).txt)) out.push('AE');
    if (radieDepuis(c, p) === c.code) out.push('Radié');
    // Démission d'un ancien ou d'un assistant : signalée le cycle où elle est notée
    { const pc = prevCycle(c), fp = pc ? fonctionAt(pc, p) : undefined; if (fonctionAt(c, p) === 'Démission' && fp !== undefined && fp !== 'Démission') out.push('Démission'); }
    return out.filter((x, i, l) => l.indexOf(x) === i);
  }
  function autoSignal(prevSt, st, evt) {
    // un proclamateur est baptisé : il ne peut pas « redevenir » PNB, seul un non-proclamateur devient PNB
    if (evt === 'Nouveau PNB' || (prevSt === 'NP' && st === 'PNB')) return 'Nouveau PNB';
    if (evt === 'Baptisé') return 'Baptême';
    if (prevSt !== undefined && prevSt !== 'PP' && st === 'PP') return 'Nouveau PP';
    if (prevSt !== undefined && prevSt !== 'PAP' && st === 'PAP') return 'Nouveau PAP';
    if (prevSt !== undefined && prevSt !== 'PS' && st === 'PS') return 'Nouveau PS';
    if (prevSt === 'PP' && st !== undefined && st !== 'PP') return 'Arrêt PP';
    return '';
  }
  // Fonction au moment du cycle : instantané enregistré (fct), sinon la fonction actuelle pour le dernier cycle
  function fonctionAt(c, p) {
    const e = store().suivi?.[c.id]?.[p.id];
    if (e && e.fct !== undefined) return e.fct;
    return sortedCycles().at(-1)?.id === c.id ? (p.fonction || '') : undefined;
  }
  // Dernière fiche enregistrée avant le cycle c (on remonte les cycles : un statut non retouché se prolonge)
  function lastStored(c, p) { for (const x of sortedCycles().filter(y => y.code < c.code).reverse()) { const pe = store().suivi?.[x.id]?.[p.id]; if (pe) return pe; } return null; }
  function prevStatut(c, p) { const pe = lastStored(c, p); return pe ? (pe.statut || '') : undefined; }
  // Couleur de ligne : IN gris, ancien bleu foncé, assistant bleu clair, PP orange
  function rowStyle(p, e, f = p.fonction) {
    if (e.statut === 'IN') return 'background:#e3e3e3;color:#555';
    p = {...p, fonction: f};   // fonction du cycle affiché (un radié n'est plus ancien ni assistant)
    if (p.fonction === 'Ancien') return 'background:#1f3f66;color:#fff';
    if (p.fonction === 'Assistant') return 'background:#d6e6f7;color:#1f2328';
    if (e.statut === 'PP') return 'background:#fbd9b5;color:#1f2328';
    if (e.statut === 'PS') return 'background:#f8cfcf;color:#1f2328';
    return '';
  }
  const HEURES_MOIS = 50;
  const RESPS = ['CCA', 'Secrétaire', 'Resp. Prédication', 'TG', 'VCM', 'Conseiller adj.', 'Resp. de groupe', 'Aumônier', 'CLH', 'LDC', 'Télévolontaire',
    'Comité de gestion', 'Comptes', 'Territoires', 'Publications', 'Discours publics', 'Accueil', 'Audio/vidéo', 'Entretien'];
  const suivi = c => (store().suivi ??= {})[c.id] ??= {};
  // Mois du cycle : A = septembre → février, B = mars → août
  function cycleStart(code) { const y = Number(code.slice(0, 4)); return /A$/.test(code) ? new Date(y - 1, 8, 1) : new Date(y, 2, 1); }
  // Épouse d'un frère nommé : choix enregistré (p.epouse = id, ou 'aucune'), sinon déduction :
  // même nom, même assemblée, même adresse ou même téléphone, pas un frère, écart d'âge raisonnable
  const sameTxt = (a, b) => a && b && api.norm(a) === api.norm(b);
  function spouseCandidates(p) {
    return api.data.persons.filter(q => q.id !== p.id && sameTxt(q.assemblee, p.assemblee) && q.civilite !== 'Frère' && !['Ancien', 'Assistant'].includes(q.fonction) && sameTxt(q.nom, p.nom));
  }
  function spouseOf(p) {
    if (p.epouse === 'aucune') return null;
    if (p.epouse) return api.data.persons.find(q => q.id === p.epouse) || null;
    let l = spouseCandidates(p).filter(q => sameTxt(q.adresse, p.adresse) || sameTxt((q.telephone || '').replace(/\D/g, ''), (p.telephone || '').replace(/\D/g, '')) || !q.adresse || !p.adresse);
    const age = x => x.naissance ? App.annuaire.yearsSince(x.naissance) : null;
    if (age(p) !== null) l = l.filter(q => age(q) === null || Math.abs(age(q) - age(p)) <= 15);
    return l.length === 1 ? l[0] : null;
  }
  // Heures PP : cumul depuis le début de l'année de service (1er septembre), objectif 50 h × mois écoulés.
  // Réglable par cycle (1 à 12 mois), par exemple 12 pour le total d'une année de service complète.
  // PA du tableau du cycle : cycle A = campagne mondiale (septembre), cycle B = période du Mémorial.
  // On affiche celui du cycle et le plus récent de l'autre type.
  // PA de la campagne de septembre et du Mémorial : saisis dans l'onglet Proclamateurs (paCamp / paMem) ;
  // à défaut, la colonne PA du tableau du cycle (cycle A = campagne, cycle B = Mémorial).
  function paCampagne(x, asm, kind) {
    const v = x.valeurs?.[asm] || {};
    if (kind === 'camp') return n(v.paCamp) ?? (/A$/.test(x.code) ? n(v.pa) : null);
    return n(v.paMem) ?? (/B$/.test(x.code) ? n(v.pa) : null);
  }
  function campagnesPA(c, asm) {
    const out = [], cs = sortedCycles().filter(x => x.code <= c.code).reverse();
    for (const [kind, lab] of [['camp', 'Campagne de septembre'], ['mem', 'Mémorial']]) {
      const x = cs.find(y => paCampagne(y, asm, kind) !== null);
      if (x) out.push(`${lab}${x.id === c.id ? '' : ' (' + x.code + ')'} : ${paCampagne(x, asm, kind)}`);
    }
    return out;
  }
  function monthsElapsed(c) {
    if (c.mois) return c.mois;
    const now = new Date(), sy = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const m = (now.getFullYear() - sy) * 12 + now.getMonth() - 8;   // mois terminés depuis septembre
    return Math.max(1, Math.min(12, m));
  }
  function entry(c, p) {
    const S = suivi(c);
    if (!S[p.id]) {
      const pe = lastStored(c, p);
      return {statut: pe ? pe.statut || '' : '', heures: null, eb: null, pa: null, ir: null, $new: true};
    }
    if (S[p.id].evt === 'Réactivé') S[p.id].evt = 'De nouveau actif';   // ancien intitulé
    return S[p.id];
  }
  // Suivi : repris du dernier cycle précédent qui en a un, tant qu'il n'est pas modifié pour ce cycle
  // ('' enregistré = suivi effacé volontairement, il n'est plus repris).
  function suiviOf(c, p, e) {
    if (e && e.suivi !== undefined) return {txt: e.suivi, from: ''};
    for (const x of sortedCycles().filter(y => y.code < c.code).reverse()) {
      const pe = store().suivi?.[x.id]?.[p.id];
      if (pe && pe.suivi !== undefined) return {txt: pe.suivi, from: pe.suivi ? x.code : ''};
    }
    return {txt: '', from: ''};
  }
  function setEntry(c, p, k, v) {
    const S = suivi(c), e = S[p.id] ??= {...entry(c, p)}; delete e.$new;
    if (k === 'suivi') { e.suivi = v; api.save(); return; }
    if (v === '' || v === null || (typeof v === 'number' && isNaN(v))) delete e[k]; else e[k] = v;
    if (k === 'statut' && (v === 'PP' || v === 'PAP' || v === 'PS')) delete e.pa;
    if (k === 'statut' && v !== 'PP') delete e.heures;
    if (k === 'statut' && v === 'NP') { delete e.eb; delete e.pa; delete e.ir; }
    api.save();
  }

  // Notation du classeur : « x2 », « PAx1 », « IRx3 », « 1EB », « 198h », « IN », « PNB », « PAP »…, combinées avec « / »
  function parseCell(raw) {
    const out = {}; if (raw === null || raw === undefined || raw === '') return out;
    for (let t of String(raw).split('/')) {
      t = t.trim(); const u = api.norm(t).replace(/\s+/g, '');
      if (!u) continue; let m;
      if (/^(nvelle|nv|nouvelle?)in$/.test(u)) { out.statut = 'IN'; out.evt = 'Devenu inactif'; }
      else if (/^in$/.test(u)) out.statut = 'IN';
      else if (/^(nvelle|nv|nouvelle?|nouveau)pnb/.test(u)) { out.statut = 'PNB'; out.evt = 'Nouveau PNB'; }
      else if (/pnb/.test(u)) out.statut = 'PNB';
      else if (/bapt/.test(u)) out.evt = 'Baptisé';
      else if (/emmenag|arrivee/.test(u)) out.evt = 'Emménagement';
      else if (/(nvelle|nv|nouvelle?|nouveau)pap/.test(u)) { out.statut = 'PAP'; out.signal = 'Nouveau PAP'; }
      else if (/pap/.test(u)) out.statut = 'PAP';
      else if (/(nvelle|nv|nouvelle?|nouveau)pp/.test(u)) { out.statut = 'PP'; out.signal = 'Nouveau PP'; }
      else if ((m = /^(\d+)h/.exec(u))) out.heures = Number(m[1]);
      else if ((m = /^(\d+)eb$/.exec(u))) out.eb = (out.eb || 0) + Number(m[1]);
      else if ((m = /^irx?(\d+)?$/.exec(u))) out.ir = (out.ir || 0) + Number(m[1] || 1);
      else if ((m = /^(pa)?x(\d+)$/.exec(u)) || (m = /^pa(x)?(\d+)?$/.exec(u))) out.pa = (out.pa || 0) + Number(m[2] || 1);
    }
    return out;
  }

  async function importSuiviFlow(onDone) {
    const S = store();
    if (!S.cycles.length) return api.toast('Importez d’abord les cycles (bouton Importer du tableau de bord).', 'error');
    const file = await api.pickFile('.xlsx,.xlsm'); if (!file) return;
    let sheets; try { sheets = await App.files.readXlsx(file); } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
    const plan = []; // {asm, rows:[{nom, prenom, naissance, bapteme, fonction, cycles:{code: parsed}}]}
    for (const sh of sheets) {
      const asm = S.assemblees.find(a => ckey(a) === ckey(sh.name)); if (!asm || isGroup(asm)) continue;
      const hi = sh.rows.findIndex(r => r.some(c => /nom\s*\/\s*pr/i.test(String(c)))); if (hi < 0) continue;
      const head = sh.rows[hi].map(h => String(h ?? '').trim());
      const ci = lab => head.findIndex(h => h.toLowerCase().startsWith(lab.toLowerCase()));
      const cSuivi = ci('Suivi'), cRq = ci('Rq'), cName = ci('Nom / Pr'), cFct = ci('A/Ass'), cPP = head.findIndex(h => /^pp\b/i.test(h)), cN = ci('Naissance'), cB = ci('Jour bapt');
      const cyc = S.cycles.map(c => ({c, i: head.findIndex(h => h.toUpperCase() === c.code)})).filter(x => x.i >= 0);
      const rows = [];
      for (const r of sh.rows.slice(hi + 1)) {
        const name = String(r[cName] ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+-\s+/g, ' ').trim();
        if (!name || name.split(' ').length < 2 || /^(total|assistance)/i.test(name)) continue;
        const toks = name.split(' '), up = toks.filter(t => t === t.toUpperCase() && /[A-ZÀ-Þ]/.test(t) && t.length > 1);
        const nom = up.length && up.length < toks.length ? up.join(' ') : toks[0], prenom = toks.filter(t => !up.includes(t)).join(' ') || toks.slice(1).join(' ');
        const pp = String(r[cPP] ?? '').trim().toUpperCase();
        const fct = {A: 'Ancien', ASS: 'Assistant'}[String(r[cFct] ?? '').trim().toUpperCase()] || '';
        const cycles = {};
        for (const {c, i} of cyc) {
          const v = parseCell(r[i]);
          if (!v.statut) { if (pp === 'PP') v.statut = 'PP'; else if (pp === 'PS') v.statut = 'PS'; else if (pp === 'PAP') v.statut = 'PAP'; }
          if (['PP', 'PAP', 'PS'].includes(v.statut)) delete v.pa;
          cycles[c.code] = v;
        }
        const txt = [cSuivi, cRq].filter(i => i >= 0).map(i => String(r[i] ?? '').trim()).filter(Boolean).join(' — ');
        if (txt && cyc.length) { const lastCode = cyc.map(x => x.c.code).sort().at(-1); cycles[lastCode].suivi = txt; }
        // Un PNB d'un cycle l'était déjà au cycle d'avant si rien n'y est noté (un baptisé ne redevient pas PNB)
        const codes = cyc.map(x => x.c.code).sort();
        for (let i = codes.length - 1; i > 0; i--) if (cycles[codes[i]]?.statut === 'PNB' && !cycles[codes[i - 1]]?.statut && !cycles[codes[i]].evt) cycles[codes[i - 1]].statut = 'PNB';
        rows.push({nom, prenom, fonction: fct, naissance: App.annuaire.parseDate(r[cN]), bapteme: App.annuaire.parseDate(r[cB]), cycles});
      }
      if (rows.length) plan.push({asm, rows});
    }
    if (!plan.length) return api.toast('Aucun onglet d’assemblée reconnu dans ce fichier.', 'error');
    // Rapprochement avec l'annuaire
    let found = 0, missing = 0;
    for (const g of plan) for (const r of g.rows) {
      r.person = members(g.asm).find(p => api.norm(p.nom + ' ' + p.prenom).split(' ').sort().join(' ') === api.norm(r.nom + ' ' + r.prenom).split(' ').sort().join(' '))
        || api.data.persons.find(p => api.norm(p.nom) === api.norm(r.nom) && api.norm(p.prenom).split(' ')[0] === api.norm(r.prenom).split(' ')[0] && ckey(p.assemblee) === ckey(g.asm));
      r.person ? found++ : missing++;
    }
    const ok = await api.modal({title: 'Importer le suivi des proclamateurs', body: `<div class="stack">
      <p style="margin:0">${plan.length} assemblées, ${found + missing} proclamateurs lus dans <strong>${api.esc(file.name)}</strong> (cycles ${S.cycles.map(c => c.code).join(', ')}).</p>
      <p class="small muted" style="margin:0">Notation reconnue : IN, PNB, PAP, PP, « 198h » (heures), « 1EB », « x2 » ou « PAx2 » (pionnier auxiliaire), « IRx3 ».</p>
      <ul style="margin:0"><li>${found} retrouvés dans l’annuaire</li>${missing ? `<li>${missing} absents de l’annuaire</li>` : ''}</ul>
      ${missing ? `<label class="row small"><input type="checkbox" id="addMissing" checked> Ajouter ces ${missing} proclamateurs à l’annuaire (nom, assemblée, dates, fonction)</label>` : ''}
      <label class="row small"><input type="checkbox" id="setFct" checked> Reporter la fonction (Ancien / Assistant) dans l’annuaire quand elle y manque</label>
      <div class="notice warn small">Les saisies déjà faites dans l’onglet Proclamateurs pour ces cycles seront remplacées par celles du classeur.</div></div>`,
      actions: [{label: 'Annuler', value: null}, {label: 'Importer', kind: 'primary', onClick: b => ({add: api.$('#addMissing', b)?.checked, fct: api.$('#setFct', b).checked})}]});
    if (!ok) return;
    let added = 0;
    for (const g of plan) for (const r of g.rows) {
      if (!r.person) {
        if (!ok.add) continue;
        r.person = {id: api.uid(), civilite: '', prenom: r.prenom, nom: r.nom.toUpperCase(), naissance: r.naissance, bapteme: r.bapteme, fonction: r.fonction, assemblee: g.asm, notes: 'Ajouté depuis le classeur d’analyse'};
        api.data.persons.push(r.person); added++;
      } else if (ok.fct && r.fonction && !r.person.fonction) r.person.fonction = r.fonction;
      for (const c of S.cycles) { const v = r.cycles[c.code]; if (v) suivi(c)[r.person.id] = {...v, fct: r.fonction || r.person.fonction || ''}; }
    }
    api.save(); api.toast(`Suivi importé${added ? ` · ${added} proclamateur(s) ajouté(s) à l’annuaire` : ''}`);
    onDone && onDone();
  }

  function proclamateursView(el, state) {
    const S = store(), cycles = sortedCycles();
    const asms = S.assemblees.filter(a => !isGroup(a));
    if (!cycles.length || !asms.length) {
      el.innerHTML = `${header('proclamateurs')}<div class="notice">Importez d’abord le classeur d’analyse depuis le tableau de bord : il crée les cycles et la liste des assemblées.</div>`;
      bindHeader(el); return;
    }
    if (!api.photos.ready) api.photos.load().then(() => { if (el.isConnected && api.photos.count()) proclamateursView(el, state); });
    const c = cycles.find(x => x.id === state.cycle) || cycles.at(-1); state.cycle = c.id;
    const asm = asms.find(a => a === state.asm) || asms[0]; state.asm = asm;
    const mois = monthsElapsed(c), objectif = mois * HEURES_MOIS;
    const people = members(asm).sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr'));
    const rows = people.map(p => ({p, e: entry(c, p)}));
    const evtOf = r => r.e.evt || autoEvt(prevStatut(c, r.p), r.e.statut);
    const evtCount = ev => rows.filter(r => evtOf(r) === ev).length;
    const sigsOf = r => sigList(c, r.p, r.e, prevStatut(c, r.p), evtOf(r));
    const sigOf = r => sigsOf(r)[0] || '';
    const sigHas = (r, x) => sigsOf(r).includes(x);
    const shown = rows.filter(r => { const {p, e} = r; return (!state.filt || (state.filt === 'Ancien' || state.filt === 'Assistant' ? p.fonction === state.filt : state.filt === 'ACTIF' ? ACTIF(e.statut) : state.filt === 'EVT' ? !!(e.evt || autoEvt(prevStatut(c, p), e.statut)) : state.filt === 'SIG' ? !!sigOf(r) : state.filt === 'S21' ? !e.s21 && !DEPARTS.includes(e.evt) && (ACTIF(e.statut) || e.statut === 'PNB') : e.statut === state.filt)); })
      .filter(({p, e}) => true
      && (!state.q || api.norm(p.nom + ' ' + p.prenom).includes(api.norm(state.q))));
    // un radié reste proclamateur (compté selon son statut) ; un déménagement ou un décès n'est plus compté
    const departs = rows.filter(r => DEPARTS.includes(r.e.evt)), live = rows.filter(r => !DEPARTS.includes(r.e.evt));
    const cnt = st => live.filter(r => r.e.statut === st).length;
    const sum = k => live.reduce((s, r) => s + (Number(r.e[k]) || 0), 0);
    const ppLow = rows.filter(r => r.e.statut === 'PP' && r.e.heures !== null && r.e.heures !== undefined && r.e.heures < objectif).length;
    const statItems = [];
    const stat = (lab, v, sub = '', red = false) => (statItems.push({lab, v, sub, red}), '') + `<div class="card" style="padding:12px 14px"><div class="muted small" style="min-height:2.6em;line-height:1.3">${lab}</div><div class="stat" style="font-size:22px;text-align:center${red ? ';color:#c81a1a' : ''}">${v}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
    el.innerHTML = `${header('proclamateurs')}
      <div class="row" style="margin-bottom:14px">
        <select id="pAsm" style="width:auto;font-weight:600">${asms.map(a => `<option ${a === asm ? 'selected' : ''}>${api.esc(a)}</option>`).join('')}</select>
        <select id="pCyc" style="width:auto">${cycles.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>Cycle ${x.code}</option>`).join('')}</select>
        <label class="row small" title="Mois de l’année de service (depuis le 1er septembre) couverts par les heures PP saisies ; 12 pour une année complète">Mois depuis septembre <input type="number" id="pMois" min="1" max="12" value="${mois}" style="width:64px;padding:4px 6px"></label>
        <label class="row small" title="Nombre de pionniers auxiliaires pendant la campagne de septembre">PA campagne sept. <input type="number" min="0" id="pPaCamp" value="${paCampagne(c, asm, 'camp') ?? ''}" style="width:64px;padding:4px 6px"></label>
        <label class="row small" title="Nombre de pionniers auxiliaires à l’occasion du Mémorial (mars-avril)">PA Mémorial <input type="number" min="0" id="pPaMem" value="${paCampagne(c, asm, 'mem') ?? ''}" style="width:64px;padding:4px 6px"></label>
        ${badges(asm) ? `<span>${badges(asm)}</span>` : ''}
        <span class="small muted">Objectif PP : ${objectif} h (${HEURES_MOIS} h × ${mois} mois)</span>
        <span style="flex:1"></span>
        <button class="btn" id="pImp">Importer le suivi du classeur</button>
        <button class="btn" id="pAdd">+ Proclamateur</button>
        <button class="btn" id="pTrombi" title="Photos et noms des proclamateurs de l’assemblée">Trombinoscope PDF</button>
        <button class="btn" id="pPdf">Bilan PDF (1 page A4 paysage)</button>
        <button class="btn primary" id="pRep">Reporter dans le tableau du cycle</button>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px">
        ${(() => {
          const pc = prevCycle(c);
          const fNow = r => fonctionAt(c, r.p) ?? r.p.fonction ?? '', fPrev = r => pc ? fonctionAt(pc, r.p) : undefined;
          const newF = f => live.filter(r => fNow(r) === f && fPrev(r) !== undefined && fPrev(r) !== f).length;
          const sigCount = x => live.filter(r => sigHas(r, x)).length;
          const nouv = (n, lab) => n ? `<span style="color:var(--ok);font-weight:600">dont ${n} ${lab}</span>` : '';
          const actifs = live.filter(r => ACTIF(r.e.statut)).length;
          const paPers = live.filter(r => r.e.pa > 0 && !['PP', 'PAP', 'PS'].includes(r.e.statut)).length + cnt('PAP');
          const procl = live.filter(r => ACTIF(r.e.statut) || r.e.statut === 'PNB');
          const ages = procl.filter(r => r.p.naissance).map(r => App.annuaire.yearsSince(r.p.naissance)).filter(a => a !== null && a !== undefined && !isNaN(a));
          const s21 = live.filter(r => r.e.s21 && (ACTIF(r.e.statut) || r.e.statut === 'PNB')).length, tot = actifs + cnt('PNB');
          // Chiffre mis en avant : les S-21 validées (seuls les proclamateurs réellement actifs ont une fiche validée) ;
          // le total de la liste reste indiqué dessous. Tant qu'aucune fiche n'est pointée, on affiche le total de la liste.
          const grey = t => `<span style="color:#8a8f98">${t}</span>`;
          return (s21
              ? stat('Proclamateurs (S-21 validées)', s21, [grey(`sur ${tot} proclamateurs dans la liste`), s21 === tot ? '<span style="color:var(--ok);font-weight:600">toutes les fiches ✓</span>' : '', nouv(evtCount('Baptisé'), 'nouveau(x) baptisé(s)')].filter(Boolean).join('<br>'), true)
              : stat('Proclamateurs', tot, [grey('S-21 pas encore pointées'), nouv(evtCount('Baptisé'), 'nouveau(x) baptisé(s)')].filter(Boolean).join('<br>'), true))
            + stat('Âge moyen des proclamateurs', ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) + ' ans' : '—', ages.length < procl.length ? `<span class="muted">sur ${ages.length} date(s) connue(s) / ${procl.length}</span>` : '', true)
            + stat('Anciens', live.filter(r => fNow(r) === 'Ancien').length, nouv(newF('Ancien'), 'nouveau(x)'))
            + stat('Assistants', live.filter(r => fNow(r) === 'Assistant').length, nouv(newF('Assistant'), 'nouveau(x)'))
            + stat('PP', cnt('PP'), [nouv(sigCount('Nouveau PP'), 'nouveau(x)'), ppLow ? `<span style="color:var(--warn)">${ppLow} sous l’objectif</span>` : ''].filter(Boolean).join('<br>'))
            + stat('PS', cnt('PS'), nouv(sigCount('Nouveau PS'), 'nouveau(x)'))
            + stat('PA', paPers, [cnt('PAP') ? `dont ${cnt('PAP')} PAP` : '', ...campagnesPA(c, asm)].filter(Boolean).join('<br>'))
            + stat('PNB', cnt('PNB'), nouv(live.filter(r => sigHas(r, 'Nouveau PNB') || evtOf(r) === 'Nouveau PNB').length, 'nouveau(x)'))
            + stat('Études bibliques', sum('eb'), (() => { const eb = st => live.filter(r => r.e.statut === st).reduce((t, r) => t + (Number(r.e.eb) || 0), 0);
              return ['PP', 'PAP', 'PS'].filter(st => eb(st) || cnt(st)).map(st => `${eb(st)} EB par ${st}`).join('<br>'); })())
            + stat('IR', live.filter(r => r.e.ir > 0).length, sum('ir') > live.filter(r => r.e.ir > 0).length ? `<span class="muted">${sum('ir')} fois au total</span>` : '')
            + stat('IN', cnt('IN'), nouv(evtCount('Devenu inactif'), 'nouveau(x)'));
        })()}
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px">
        ${stat('De nouveau actifs', evtCount('De nouveau actif'))}${departs.length ? stat('Départs (non comptés)', departs.length, [['Déménagement', 'déménagement(s)'], ['Décédé(e)', 'décès']].map(([k, l]) => { const n2 = departs.filter(r => r.e.evt === k).length; return n2 ? `${n2} ${l}` : ''; }).filter(Boolean).join('<br>')) : ''}${stat('Emménagements', evtCount('Emménagement'))}${stat('Nouveaux dans la liste', evtCount('Nouveau dans la liste'))}${stat('À signaler', rows.filter(r => sigOf(r)).length, '<span style="background:#ffe866;padding:0 4px;border-radius:3px">lignes surlignées</span>')}
      </div>
      ${(() => { const mv = (c.mouvements || []).filter(m => ckey(m.asm) === ckey(asm)); if (!mv.length) return '';
        const add = mv.filter(m => m.type === 'ajout'), del = mv.filter(m => m.type === 'retrait');
        return `<details class="card" style="margin-bottom:14px" ${state.openMv ? 'open' : ''}><summary style="cursor:pointer"><strong>Mises à jour de la liste pendant le cycle ${c.code}</strong> : ${add.length} nouveau(x) nom(s), ${del.length} retiré(s)</summary>
          <div class="grid" style="margin-top:10px">${[['Nouveaux dans la liste', add], ['Retirés de la liste', del]].map(([t, l]) => `<div><div class="small muted" style="margin-bottom:4px">${t}</div>${l.map(m => `<div class="small">${api.esc(m.nom)} ${api.esc(m.prenom)} <span class="muted">— ${api.esc(api.dateCourte(m.date).split(' ')[0])}, ${api.esc(m.fichier || '')}</span></div>`).join('') || '<div class="small muted">—</div>'}</div>`).join('')}</div></details>`; })()}
      <div class="row small" style="margin-bottom:10px;gap:14px"><span><span style="display:inline-block;width:12px;height:12px;background:#1f3f66;border-radius:3px;vertical-align:-2px"></span> Ancien</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#d6e6f7;border:1px solid #9bb;border-radius:3px;vertical-align:-2px"></span> Assistant</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#fbd9b5;border-radius:3px;vertical-align:-2px"></span> PP</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#f8cfcf;border-radius:3px;vertical-align:-2px"></span> PS</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#e3e3e3;border-radius:3px;vertical-align:-2px"></span> IN</span>
        <span><span style="display:inline-block;width:5px;height:12px;background:#f59e0b;vertical-align:-2px"></span> trait orange : ancien ou assistant pionnier permanent</span></div>
      <div class="row" style="margin-bottom:10px"><input type="search" id="pQ" placeholder="Rechercher un nom" value="${api.esc(state.q || '')}" style="max-width:260px">
        <select id="pF" style="width:auto"><option value="">Tous</option>${[['ACTIF', 'Actifs'], ['PNB', 'PNB'], ['IN', 'IN'], ['PP', 'PP'], ['PAP', 'PAP'], ['PS', 'PS'], ['NP', 'Non proclamateurs'], ['EVT', 'Avec une évolution'], ['SIG', 'Lignes surlignées'], ['S21', 'S-21 non pointées'], ['Ancien', 'Anciens'], ['Assistant', 'Assistants']].map(([v, l]) => `<option value="${v}" ${state.filt === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="small muted">${shown.length} affiché(s) · <strong>S-21 validées : ${live.filter(r => r.e.s21 && (ACTIF(r.e.statut) || r.e.statut === 'PNB')).length} / ${live.filter(r => ACTIF(r.e.statut) || r.e.statut === 'PNB').length} proclamateurs</strong> · les saisies sont enregistrées automatiquement</span></div>
      <details class="small muted" style="margin-bottom:8px"><summary style="cursor:pointer">Aide sur les statuts, les surlignages et le suivi</summary><p style="margin:6px 0 0">Un proclamateur est nécessairement baptisé : « Non proclamateur » désigne une personne de l’annuaire qui n’est ni proclamateur ni PNB. Une ligne est surlignée en jaune pour un nouveau PNB, un baptême, un nouveau PP, un nouveau PAP ou une proposition comme ancien ou assistant : les quatre premiers cas sont repérés automatiquement (« auto »), les propositions se choisissent dans la colonne « Évolution / à signaler ». La colonne « Suivi » accepte vos notes libres pour le cycle. L’évolution est déduite du statut au cycle précédent (« auto ») ; vous pouvez aussi la choisir vous-même, par exemple « Emménagement » pour un nouveau proclamateur arrivé dans l’assemblée.<br>PNB : proclamateur non baptisé · IN : inactif · PP : pionnier permanent (objectif ${HEURES_MOIS} h/mois) · PAP : pionnier auxiliaire permanent · PS : pionnier spécial · PA : nombre de fois pionnier auxiliaire dans le cycle (sans objet pour les PP et PAP) ; le bilan compte les proclamateurs qui ont été PA, une seule fois chacun · IR : nombre de fois irrégulier.</p></details>
      <div class="table-wrap sticky"><table class="list" id="pTab"><thead><tr><th class="s21" title="Fiche d’activité (S-21) vérifiée pour ce cycle">S-21</th><th>Proclamateur · fonction</th><th>Statut</th><th style="text-align:right">Âge</th><th style="text-align:right;white-space:nowrap" title="Nombre d’années depuis le baptême">Baptême</th><th>Évolution / à signaler</th><th style="width:1%;white-space:nowrap">Heures PP</th><th style="text-align:center">Études bibliques</th><th style="text-align:center">PA</th><th style="text-align:center">IR</th><th style="min-width:220px">Suivi</th></tr></thead><tbody>
      ${shown.map(({p, e}) => {
        const isP = ['PP', 'PAP', 'PS'].includes(e.statut);
        const h = e.heures, ratio = h !== null && h !== undefined ? h / objectif : null;
        const ps = prevStatut(c, p), auto = autoEvt(ps, e.statut), ev = e.evt || auto;
        const isP2 = e.statut === 'NP';
        const aSig = autoSignal(ps, e.statut, ev), sigs = sigList(c, p, e, ps, ev), sig = sigs[0] || '', radie = radieDepuis(c, p);
        return `<tr data-id="${p.id}" style="${DEPARTS.includes(e.evt) ? 'opacity:.55;' : ''}${rowStyle(p, e, fonctionAt(c, p) ?? p.fonction)}${sig ? ';outline:3px solid #f5c400;outline-offset:-3px' : ''}">
          <td class="s21"><input type="checkbox" data-f="s21" title="S-21 vérifiée" ${e.s21 ? 'checked' : ''}></td><td style="${e.statut === 'PP' && p.fonction ? 'box-shadow:inset 6px 0 0 #f59e0b;' : ''}${sig ? 'background:#ffe866;color:#1f2328' : ''}">${api.photos.get(p.id) ? `<img src="${api.photos.get(p.id)}" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:50%;float:left;margin:0 8px 4px 0">` : ''}<strong>${api.esc((p.nom || '').toUpperCase())}</strong> ${api.esc(p.prenom)}${(() => {
            const why = [...sigs, ev].filter(x => x && x !== 'Sans raison').map(x => SHORT[x] || x).filter((x, i, a) => a.indexOf(x) === i);
            if (why.length) return `<div class="small" style="opacity:.85;font-weight:600">${c.code} : ${why.join(' · ')}</div>`;
            if (e.$new && ps === undefined) return '<div class="small" style="opacity:.75">pas encore de suivi</div>';
            if (ps !== undefined && ps !== (e.statut || '')) return `<div class="small" style="opacity:.75">${prevCycle(c).code} : ${ps || 'Proclamateur'}</div>`;
            return '';
          })()}
            <div class="fct-box"><select data-f="fonction" style="width:auto;padding:4px 6px"><option value="">Fonction : —</option><option ${(fonctionAt(c, p) ?? p.fonction) === 'Ancien' ? 'selected' : ''}>Ancien</option><option ${(fonctionAt(c, p) ?? p.fonction) === 'Assistant' ? 'selected' : ''}>Assistant</option><option ${(fonctionAt(c, p) ?? p.fonction) === 'Démission' ? 'selected' : ''}>Démission</option><option ${(fonctionAt(c, p) ?? p.fonction) === 'Radié' ? 'selected' : ''}>Radié</option></select>
            ${['Ancien', 'Assistant'].includes(fonctionAt(c, p) ?? p.fonction) ? (() => { const sp = spouseOf(p), auto = !p.epouse && sp;
              const cands = [...new Set([...spouseCandidates(p), ...people.filter(q => q.id !== p.id && q.civilite === 'Sœur')])];
              return `<div style="margin-top:4px"><select data-f="epouse" title="Épouse" style="width:auto;max-width:190px;padding:2px 4px;font-size:12px">
                <option value="">${auto ? 'Épouse : ' + api.esc(sp.prenom || '') + ' (auto)' : 'Épouse : —'}</option>
                ${cands.map(q => `<option value="${q.id}" ${p.epouse === q.id ? 'selected' : ''}>Épouse : ${api.esc((q.prenom || '') + ' ' + (q.nom || '').toUpperCase())}</option>`).join('')}
                <option value="aucune" ${p.epouse === 'aucune' ? 'selected' : ''}>Pas d’épouse</option></select></div>`; })() : ''}
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px;max-width:190px">${(p.resp || []).map(r => `<span class="pill" style="background:#fff;color:#1f2328;padding:0 6px">${api.esc(r)} <a href="#" data-delresp="${api.esc(r)}" title="Retirer" style="color:#c00;text-decoration:none">×</a></span>`).join('')}
            ${RESPS.some(r => !(p.resp || []).includes(r)) ? `<select data-f="resp" style="width:auto;padding:2px 4px;font-size:12px"><option value="">+ responsabilité</option>${RESPS.filter(r => !(p.resp || []).includes(r)).map(r => `<option>${r}</option>`).join('')}</select>` : ''}</div></div></td>
          <td><select data-f="statut" style="width:auto;padding:4px 6px">${STATUTS.map(s => `<option value="${s.v}" ${e.statut === s.v ? 'selected' : ''}>${s.v === 'NP' ? 'Non procl.' : s.v || 'Proclamateur'}</option>`).join('')}</select></td>
          <td style="text-align:right;white-space:nowrap">${p.naissance ? App.annuaire.yearsSince(p.naissance) + ' ans' : ''}</td>
          <td style="text-align:right;white-space:nowrap">${p.bapteme ? App.annuaire.yearsSince(p.bapteme) + ' ans' : ''}</td>
          <td><select data-f="mix" style="width:auto;max-width:210px;padding:4px 6px">
              <option value="">${[auto, aSig].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i && !(x === 'Baptême' && auto === 'Baptisé')).map(x => x + ' (auto)').join(' · ') || '—'}</option>
              ${e.evt || e.signal ? '<option value="__annuler">↺ Annuler ma modification</option>' : ''}
              <optgroup label="Évolution">${EVTS.map(x => `<option ${!SIG_ONLY.includes(e.signal) && e.signal !== 'Aucun' && e.evt === x ? 'selected' : ''}>${x}</option>`).join('')}</optgroup>
              <optgroup label="À surligner">${SIG_ONLY.map(x => `<option value="${x}" ${e.signal === x ? 'selected' : ''}>${SIG_LABEL(x)}</option>`).join('')}<option value="Aucun" ${e.signal === 'Aucun' ? 'selected' : ''}>Ne pas surligner</option></optgroup></select>
            <div style="margin-top:3px">${ev ? `<span class="pill ${EVT_STYLE[ev]}" style="background:#fff">${ev}</span> ` : ''}${DEPARTS.includes(e.evt) ? '<div class="small" style="opacity:.8;margin-top:2px">sera retiré(e) au cycle suivant</div>' : ''}${sigs.filter(x => !(x === 'Baptême' && ev === 'Baptisé') && x !== ev).map(x => `<span class="pill" style="background:#ffe866;color:${x === 'AE' ? '#c00;font-weight:700' : '#1f2328'};border-color:#e0b800">${x === 'Sans raison' ? 'surligné' : x}</span>`).join(' ')}</div></td>
          <td style="white-space:nowrap">${e.statut === 'PP' ? `<input type="number" min="0" data-f="heures" value="${h ?? ''}" style="width:58px;padding:4px 5px">
            ${ratio !== null ? `<div class="small" style="margin-top:2px"><span class="pill ${ratio >= 1 ? 'ok' : 'warn'}" style="background:#fff;padding:0 6px" title="Moyenne : ${Math.round(h / mois)} h/mois sur ${mois} mois (objectif ${objectif} h)">${Math.round(ratio * 100)} %</span></div>` : ''}` : '<span class="muted small">—</span>'}</td>
          <td style="text-align:center">${isP2 ? '' : `<input type="number" min="0" data-f="eb" value="${e.eb ?? ''}" style="width:64px;padding:4px 6px">`}</td>
          <td style="text-align:center">${isP || isP2 ? '<span class="muted small">—</span>' : `<input type="number" min="0" data-f="pa" value="${e.pa ?? ''}" style="width:64px;padding:4px 6px">`}</td>
          <td style="text-align:center">${isP2 ? '' : `<input type="number" min="0" data-f="ir" value="${e.ir ?? ''}" style="width:64px;padding:4px 6px">`}</td>
          <td style="min-width:220px">${radie ? `<div class="small" style="font-weight:700;color:#c00;margin-bottom:3px">Radié ${radie}</div>` : ''}${(() => { const sv = suiviOf(c, p, e);
              return sv.txt
              ? `<div class="suivi-view small" title="Cliquer pour modifier" style="cursor:text;white-space:pre-wrap;background:#fff;color:#1f2328;border:1px solid var(--line);border-radius:6px;padding:4px 6px">${fmtSuivi(sv.txt)}${sv.from ? `<div class="muted" style="font-size:11px;margin-top:2px">repris de ${sv.from}</div>` : ''}</div><textarea data-f="suivi" rows="2" style="display:none;min-width:220px;padding:4px 6px;resize:vertical;font-size:13px">${api.esc(sv.txt)}</textarea>`
              : `<textarea data-f="suivi" rows="1" style="min-width:220px;padding:4px 6px;resize:vertical;font-size:13px"></textarea>`; })()}</td></tr>`;
      }).join('') || `<tr><td colspan="11" class="muted">Aucun proclamateur ${rows.length ? 'pour ce filtre' : 'rattaché à cette assemblée dans l’annuaire'}.</td></tr>`}
      </tbody></table></div>`;
    bindHeader(el);
    // Redessiner sans perdre sa place : position de défilement (tableau et page) et champ en cours de saisie
    const redraw = () => {
      const w = api.$('.table-wrap.sticky', el), pos = w ? [w.scrollTop, w.scrollLeft] : null;
      const scrollers = [document.scrollingElement, el, el.parentElement].filter(Boolean).map(x => [x, x.scrollTop]);
      const a = document.activeElement, tr = a && a.closest ? a.closest('tr[data-id]') : null;
      const focus = tr && a.dataset.f ? [tr.dataset.id, a.dataset.f] : null;
      proclamateursView(el, state);
      const w2 = api.$('.table-wrap.sticky', el); if (w2 && pos) { w2.scrollTop = pos[0]; w2.scrollLeft = pos[1]; }
      for (const [x, t] of scrollers) x.scrollTop = t;
      if (focus) { const f = el.querySelector(`tr[data-id="${focus[0]}"] [data-f="${focus[1]}"]`); if (f && f.offsetParent) f.focus({preventScroll: true}); }
    };
    api.$('#pAsm', el).addEventListener('change', e => { state.asm = e.target.value; redraw(); });
    api.$('#pCyc', el).addEventListener('change', e => { state.cycle = e.target.value; redraw(); });
    for (const [id, k] of [['#pPaCamp', 'paCamp'], ['#pPaMem', 'paMem']]) api.$(id, el).addEventListener('change', e => {
      const v = e.target.value.trim(), vals = c.valeurs[asm] ??= {};
      if (v === '') delete vals[k]; else vals[k] = Math.max(0, Number(v));
      api.save(); redraw();
    });
    api.$('#pMois', el).addEventListener('change', e => { const v = Number(e.target.value); c.mois = v >= 1 && v <= 12 ? v : undefined; api.save(); redraw(); });
    api.$('#pQ', el).addEventListener('input', e => { state.q = e.target.value; clearTimeout(state.t); state.t = setTimeout(() => { redraw(); const i = api.$('#pQ', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); });
    api.$('#pF', el).addEventListener('change', e => { state.filt = e.target.value; redraw(); });
    api.$('#pImp', el).addEventListener('click', () => importSuiviFlow(redraw));
    api.$('#pAdd', el).addEventListener('click', async () => {
      const r = await App.annuaire.editPerson(); if (!r) return;
      const p = api.data.persons.at(-1); if (p && !p.assemblee) { p.assemblee = asm; api.save(); }
      redraw();
    });
    api.$('#pTab', el).addEventListener('click', e => {
      const d = e.target.closest('[data-delresp]');
      if (d) { e.preventDefault(); const p = api.data.persons.find(x => x.id === d.closest('tr').dataset.id); p.resp = (p.resp || []).filter(r => r !== d.dataset.delresp); api.save(); redraw(); return; }
      const v = e.target.closest('.suivi-view'); if (!v) return;
      const ta = v.nextElementSibling; v.style.display = 'none'; ta.style.display = ''; ta.focus();
      ta.addEventListener('blur', () => redraw(), {once: true});
    });
    api.$('#pTab', el).addEventListener('change', e => {
      const t = e.target, tr = t.closest('tr[data-id]'); if (!tr || !t.dataset.f) return;
      const p = api.data.persons.find(x => x.id === tr.dataset.id);
      if (t.dataset.f === 'fonction') {
        const e = suivi(c)[p.id] ??= {...entry(c, p)}; delete e.$new; e.fct = t.value;
        if (sortedCycles().at(-1)?.id === c.id) p.fonction = t.value;   // l'annuaire suit le dernier cycle
        api.save();
      }
      else if (t.dataset.f === 's21') { setEntry(c, p, 's21', t.checked ? true : ''); redraw(); return; }
      else if (t.dataset.f === 'epouse') { if (t.value) p.epouse = t.value; else delete p.epouse; api.save(); redraw(); return; }
      else if (t.dataset.f === 'resp') { if (t.value) { p.resp = [...(p.resp || []), t.value]; api.save(); } redraw(); return; }
      else if (t.dataset.f === 'mix') {
        const v = t.value, cur = suivi(c)[p.id];
        // annuler : retour au repérage automatique, et au statut d'avant si un « Nouveau PP/PAP/PS » ou « Arrêt PP » l'avait changé
        if (v === '__annuler' || !v) {
          setEntry(c, p, 'evt', ''); setEntry(c, p, 'signal', '');
          if (cur && cur.stAv !== undefined) { const before = cur.stAv; delete cur.stAv; setEntry(c, p, 'statut', before); }
          redraw(); return;
        }
        else if (EVTS.includes(v)) { setEntry(c, p, 'evt', v); setEntry(c, p, 'signal', ''); }
        else {
          setEntry(c, p, 'signal', v); setEntry(c, p, 'evt', '');
          // « Nouveau PP / PAP / PS » change aussi le statut (la case des heures apparaît pour un PP) ; « Arrêt PP » le remet à Proclamateur
          const st = {'Nouveau PP': 'PP', 'Nouveau PAP': 'PAP', 'Nouveau PS': 'PS'}[v] ?? (v === 'Arrêt PP' && entry(c, p).statut === 'PP' ? '' : undefined);
          if (st !== undefined) { const e2 = suivi(c)[p.id]; if (e2.stAv === undefined) e2.stAv = e2.statut || ''; setEntry(c, p, 'statut', st); }
        }
      }
      else setEntry(c, p, t.dataset.f, ['statut', 'evt', 'signal'].includes(t.dataset.f) ? t.value : t.dataset.f === 'suivi' ? t.value.trim() : (t.value === '' ? '' : Math.max(0, Number(t.value))));
      if (['statut', 'heures', 'fonction', 'mix', 'suivi'].includes(t.dataset.f)) redraw();
    });
    api.$('#pTrombi', el).addEventListener('click', async () => {
      try { await api.photos.load(); api.download(App.pdf.fileName(`Trombinoscope ${asm} ${c.code}`) + '.pdf', await trombiPdf(c, asm, rows.filter(r => !DEPARTS.includes(r.e.evt))), 'application/pdf'); }
      catch (err) { console.error(err); api.toast('Erreur lors de la création du PDF : ' + err.message); }
    });
    api.$('#pPdf', el).addEventListener('click', async () => {
      try { await api.photos.load(); api.download(App.pdf.fileName(`Bilan ${asm} ${c.code}`) + '.pdf', await bilanPdf(c, asm, statItems, live, rows), 'application/pdf'); }
      catch (err) { console.error(err); api.toast('Erreur lors de la création du PDF : ' + err.message); }
    });
    api.$('#pRep', el).addEventListener('click', async () => {
      const act = live.filter(r => ACTIF(r.e.statut));
      const vals = [
        ['a', 'Anciens (A)', rows.filter(r => r.p.fonction === 'Ancien').length], ['ass', 'Assistants (Ass.)', rows.filter(r => r.p.fonction === 'Assistant').length],
        ['procl', 'Proclamateurs baptisés actifs, PP compris (Procl+PP)', act.length], ['totalin', 'Inactifs (Total IN)', cnt('IN')], ['pp', 'Pionniers permanents (PP)', cnt('PP')],
        ['eb', 'Études bibliques (E.B.)', sum('eb')], ['ebpp', 'Études bibliques des PP (EB PP)', rows.filter(r => r.e.statut === 'PP').reduce((s, r) => s + (Number(r.e.eb) || 0), 0)],
        ['ir', 'Proclamateurs irréguliers (IR)', live.filter(r => r.e.ir > 0).length], ['pa', 'Pionniers auxiliaires (PA, PAP compris)', live.filter(r => r.e.pa > 0 && !['PP', 'PAP', 'PS'].includes(r.e.statut)).length + cnt('PAP')],
        ['nvpro', 'Nouveaux proclamateurs : baptisés + emménagements (Nv.pro)', evtCount('Baptisé') + evtCount('Emménagement')], ['redact', 'De nouveau actifs (red.act.)', evtCount('De nouveau actif')]];
      const sel = await api.modal({title: `Reporter ${asm} dans le cycle ${c.code}`, body: `<div class="stack"><p class="small muted" style="margin:0">Cochez les valeurs à écrire dans le tableau de bord (les autres ne changent pas).</p>
        <table class="list"><tr><th></th><th>Indicateur</th><th style="text-align:right">Actuel</th><th style="text-align:right">D’après la liste</th></tr>
        ${vals.map(([k, l, v]) => { const cur = n(c.valeurs[asm]?.[k]); return `<tr><td><input type="checkbox" data-k="${k}" ${(cur === null && !['nvpro', 'redact'].includes(k)) || (cur !== null && cur !== v && !['nvpro', 'redact'].includes(k)) ? 'checked' : ''}></td><td>${l}</td><td style="text-align:right">${fmt(cur)}</td><td style="text-align:right"><strong>${v}</strong></td></tr>`; }).join('')}</table></div>`,
        actions: [{label: 'Annuler', value: null}, {label: 'Reporter', kind: 'primary', onClick: b => api.$$('input[data-k]:checked', b).map(i => i.dataset.k)}]});
      if (!sel || !sel.length) return;
      c.valeurs[asm] ??= {};
      for (const [k, , v] of vals) if (sel.includes(k)) c.valeurs[asm][k] = v;
      api.save(); api.toast(`${sel.length} valeur(s) reportée(s) dans le cycle ${c.code}`);
    });
  }


  /* ---------- Comptabilité : résolution pour soutenir l'œuvre mondiale ----------
     Résolution = quote-part × nombre de proclamateurs (total des S-21 validées du cycle ;
     tant qu'aucune S-21 n'est pointée, le nombre de proclamateurs de la liste). */
  const euro = v => (Math.round(v * 100) / 100).toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
  const num = v => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isNaN(x) ? null : x; };
  function proclCount(c, asm) {
    const procl = members(asm).map(p => entry(c, p)).filter(e => !DEPARTS.includes(e.evt) && (ACTIF(e.statut) || e.statut === 'PNB'));
    const s21 = procl.filter(e => e.s21).length;
    return {liste: procl.length, s21, n: s21 || procl.length, source: s21 ? 'S-21' : 'liste'};
  }
  function comptaView(el, state) {
    const S = store(), cycles = sortedCycles(), asms = S.assemblees.filter(a => !isGroup(a));
    if (!cycles.length || !asms.length) { el.innerHTML = `${header('comptabilite')}<div class="notice">Importez d’abord le classeur d’analyse depuis le tableau de bord.</div>`; bindHeader(el); return; }
    const C = S.compta ??= {quote: null, asm: {}};
    const c = cycles.find(x => x.id === state.cycle) || cycles.at(-1); state.cycle = c.id;
    let tN = 0, tR = 0, tS = 0, tV = 0;
    const lines = asms.map(a => {
      const pc = proclCount(c, a), cfg = C.asm[a] || {}, q = num(cfg.quote) ?? num(C.quote), res = q === null ? null : q * pc.n, sm = num(cfg.soldeMax);
      const vot = num(cfg.resolution); tN += pc.n; if (res !== null) tR += res; if (sm !== null) tS += sm; if (vot !== null) tV += vot;
      return `<tr data-asm="${api.esc(a)}"><td><strong>${api.esc(a)}</strong></td>
        <td style="text-align:right"><strong>${pc.n}</strong><div class="small muted">${pc.source === 'S-21' ? `S-21 validées · ${pc.liste} dans la liste` : 'S-21 non pointées : liste'}</div></td>
        <td style="text-align:right"><input data-k="quote" inputmode="decimal" placeholder="${num(C.quote) === null ? '' : String(num(C.quote)).replace('.', ',')}" value="${cfg.quote === undefined ? '' : String(cfg.quote).replace('.', ',')}" style="width:90px;text-align:right;padding:4px 6px"></td>
        <td style="text-align:right">${res === null ? '<span class="muted">—</span>' : euro(res)}</td>
        <td style="text-align:right"><input data-k="resolution" inputmode="decimal" placeholder="${res === null ? '' : Math.round(res)}" value="${cfg.resolution === undefined ? '' : String(cfg.resolution).replace('.', ',')}" style="width:110px;text-align:right;padding:4px 6px;font-weight:700"></td>
        <td style="text-align:right"><input data-k="soldeMax" inputmode="decimal" value="${cfg.soldeMax === undefined ? '' : String(cfg.soldeMax).replace('.', ',')}" style="width:110px;text-align:right;padding:4px 6px"></td></tr>`;
    }).join('');
    el.innerHTML = `${header('comptabilite')}
      <div class="row" style="gap:14px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <select id="kCyc" style="width:auto">${cycles.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>Cycle ${x.code}</option>`).join('')}</select>
        <label class="row small">Quote-part par proclamateur (€) <input id="kQuote" inputmode="decimal" value="${C.quote === null || C.quote === undefined ? '' : String(C.quote).replace('.', ',')}" style="width:90px;text-align:right;padding:4px 6px"></label>
        <span class="small muted">Montant calculé = quote-part × nombre de proclamateurs (total des S-21 validées du cycle) ; la résolution retenue, souvent arrondie, se saisit à côté</span></div>
      <div class="table-wrap"><table class="list"><thead><tr><th>Assemblée</th><th style="text-align:right">Proclamateurs</th><th style="text-align:right">Quote-part (€)</th><th style="text-align:right">Montant calculé de la résolution</th><th style="text-align:right">Résolution pour soutenir l’œuvre mondiale (€)</th><th style="text-align:right">Solde maximal (€)</th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr style="font-weight:700"><td>Total circonscription</td><td style="text-align:right">${tN}</td><td></td><td style="text-align:right">${euro(tR)}</td><td style="text-align:right">${tV ? euro(tV) : ''}</td><td style="text-align:right">${tS ? euro(tS) : ''}</td></tr></tfoot></table></div>
      <p class="small muted" style="margin-top:10px">La quote-part générale s’applique à toutes les assemblées ; saisissez une quote-part dans la ligne d’une assemblée pour la remplacer. Tant qu’aucune S-21 n’est pointée pour une assemblée, le calcul utilise le nombre de proclamateurs de la liste (actifs, PP, PAP, PS et PNB).</p>`;
    bindHeader(el);
    const redraw = () => comptaView(el, state);
    api.$('#kCyc', el).onchange = e => { state.cycle = e.target.value; redraw(); };
    api.$('#kQuote', el).onchange = e => { const v = num(e.target.value); C.quote = v; api.save(); redraw(); };
    for (const inp of api.$$('tbody input[data-k]', el)) inp.onchange = e => {
      const a = e.target.closest('tr').dataset.asm, v = num(e.target.value), cfg = C.asm[a] ??= {};
      if (v === null) delete cfg[e.target.dataset.k]; else cfg[e.target.dataset.k] = v;
      api.save(); redraw();
    };
  }

  // En-tête commun : Tableau de bord | Proclamateurs | Comptabilité
  function header(active) {
    return `<div class="page-head" style="margin-bottom:8px"><div><h1>📊 Circonscription</h1></div></div>
      <div class="tabs" style="margin-bottom:16px"><button data-view="dashboard" class="${active === 'dashboard' ? 'active' : ''}">Tableau de bord</button>
      <button data-view="proclamateurs" class="${active === 'proclamateurs' ? 'active' : ''}">Proclamateurs</button>
      <button data-view="comptabilite" class="${active === 'comptabilite' ? 'active' : ''}">Comptabilité</button></div>`;
  }
  function bindHeader(el) {
    api.$$('[data-view]', el).forEach(b => b.addEventListener('click', () => api.navigate(b.dataset.view === 'dashboard' ? '#/circonscription' : '#/circonscription/' + b.dataset.view)));
  }

  function mount(el, _api, rest) {
    if (rest[0] === 'assemblee' && rest[1]) return assembleeView(el, decodeURIComponent(rest.slice(1).join('/')));
    if (rest[0] === 'comptabilite') { App.circo.cstate ??= {}; return comptaView(el, App.circo.cstate); }
    if (rest[0] === 'proclamateurs') { App.circo.pstate ??= {}; if (rest[1]) App.circo.pstate.asm = decodeURIComponent(rest[1]); return proclamateursView(el, App.circo.pstate); }
    App.circo.state ??= {group: 'Effectifs', compare: true, evo: 'procl', bar: 'procl', edit: false, cycle: null};
    App.circo.state.edit = false;
    dashboard(el, App.circo.state);
  }
  // Appelé par l'annuaire après une mise à jour depuis un fichier : trace dans le dernier cycle
  function noteListChanges(added, removed, fichier) {
    const S = api.data.modules.circonscription; if (!S || !S.cycles?.length) return 0;
    const c = sortedCycles().at(-1), date = new Date().toISOString();
    c.mouvements ??= [];
    for (const p of added) {
      c.mouvements.push({type: 'ajout', date, fichier, nom: (p.nom || '').toUpperCase(), prenom: p.prenom || '', asm: p.assemblee || ''});
      const e = suivi(c)[p.id] ??= {}; if (!e.evt) e.evt = 'Nouveau dans la liste';
    }
    for (const p of removed) c.mouvements.push({type: 'retrait', date, fichier, nom: (p.nom || '').toUpperCase(), prenom: p.prenom || '', asm: p.assemblee || ''});
    return c.code;
  }
  return {mount, IND, importFlow, parseCell, noteListChanges};
})();

App.registerSkill({
  id: 'circonscription', name: 'Circonscription', icon: '📊', order: 12, version: '1.0',
  description: 'Analyse par cycle, comparaisons, graphiques, fiches d’assemblée et préparation des visites.',
  mount: (el, api, rest) => App.circo.mount(el, api, rest)
});
