'use strict';
/* Annuaire commun : chaque personne est enregistrée une seule fois et sert à tous les skills. */
App.annuaire = (() => {
  const api = App.api;
  const FIELDS = [
    {key: 'civilite', label: 'Civilité'}, {key: 'prenom', label: 'Prénom'}, {key: 'nom', label: 'Nom'},
    {key: 'naissance', label: 'Date de naissance'}, {key: 'bapteme', label: 'Date de baptême'}, {key: 'fonction', label: 'Fonction'},
    {key: 'telephone', label: 'Portable'}, {key: 'assemblee', label: 'Assemblée'}, {key: 'email', label: 'Mail'},
    {key: 'adresse', label: 'Adresse'}, {key: 'cp', label: 'Code postal'}, {key: 'ville', label: 'Ville'}, {key: 'notes', label: 'Notes'}
  ];
  const keyOf = p => api.norm(`${p.prenom || ''} ${p.nom || ''}`);
  const fullName = p => [p.prenom, (p.nom || '').toUpperCase()].filter(Boolean).join(' ');
  const emailOk = e => !e || /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(e.trim());
  const FONCTIONS = ['Ancien', 'Assistant'];
  const fct = v => { const n = api.norm(v); if (/^(a|anc|ancien|ancienne?s?)$/.test(n)) return 'Ancien'; if (/^(ass|assist|assistant|assistants|am|sm|assistant ministeriel|serviteur ministeriel)$/.test(n)) return 'Assistant'; return ''; };
  const civ = v => { const n = api.norm(v); if (!n) return ''; if (/^(f|frere|fr|m|monsieur)$/.test(n)) return 'Frère'; if (/^(s|soeur|sr|mme|madame)$/.test(n)) return 'Sœur'; return String(v).trim(); };
  function splitName(full) {
    const toks = String(full || '').trim().split(/\s+/).filter(Boolean);
    const isUp = t => t === t.toUpperCase() && /[A-ZÀ-Þ]/.test(t) && t.replace(/[^A-Za-zÀ-ÿ]/g, '').length > 1;
    const nom = toks.filter(isUp), prenom = toks.filter(t => !isUp(t));
    if (!nom.length && toks.length > 1) return {prenom: toks.slice(0, -1).join(' '), nom: toks.at(-1)};
    return {prenom: prenom.join(' '), nom: nom.join(' ')};
  }
  /* Dates : stockées au format AAAA-MM-JJ. */
  const MOIS = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
  const pad = n => String(n).padStart(2, '0');
  function parseDate(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return '';
    if (typeof v === 'number') { // numéro de série Excel
      if (v < 1 || v > 80000) return '';
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const t = String(v).trim(); let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(t))) { let y = Number(m[3]); if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    if ((m = /^(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})$/i.exec(t))) { const i = MOIS.findIndex(x => x.startsWith(api.norm(m[2]).slice(0, 3))); if (i >= 0) return `${m[3]}-${pad(i + 1)}-${pad(m[1])}`; }
    if (/^\d{4,5}(\.\d+)?$/.test(t)) return parseDate(Number(t));
    return '';
  }
  const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  function yearsSince(iso) {
    if (!iso) return null; const [y, m, d] = iso.split('-').map(Number), now = new Date();
    let a = now.getFullYear() - y; if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--; return a;
  }
  // Même personne : même nom et prénom, et pas deux dates de naissance différentes (homonymes).
  const sameP = (a, b) => keyOf(a) === keyOf(b) && (!a.naissance || !b.naissance || a.naissance === b.naissance);
  function indexOf(list) {
    const m = new Map();
    for (const p of list) { const k = keyOf(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
    return {find: q => (m.get(keyOf(q)) || []).find(x => sameP(x, q)), has: q => !!(m.get(keyOf(q)) || []).find(x => sameP(x, q))};
  }
  const findByName = name => { const k = api.norm(name); return api.data.persons.find(p => keyOf(p) === k || api.norm(`${p.nom} ${p.prenom}`) === k); };
  function ensureCongregation(name) {
    const n = String(name || '').trim(); if (!n) return;
    if (!api.data.congregations.some(c => api.norm(c.nom) === api.norm(n))) api.data.congregations.push({id: api.uid(), nom: n.toUpperCase(), numero: ''});
  }

  /* ---------- Fiche personne ---------- */
  async function editPerson(person) {
    const isNew = !person; const p = person ? {...person} : {id: api.uid(), civilite: '', prenom: '', nom: ''};
    const congs = api.data.congregations.map(c => `<option value="${api.esc(c.nom)}">`).join('');
    const body = `<form class="form-grid" onsubmit="return false">
      <label class="field"><span>Civilité</span><select name="civilite"><option value=""></option>${['Frère', 'Sœur'].map(v => `<option ${p.civilite === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Prénom</span><input type="text" name="prenom" value="${api.esc(p.prenom)}"></label>
      <label class="field"><span>Nom</span><input type="text" name="nom" value="${api.esc(p.nom)}"></label>
      <label class="field"><span>Date de naissance</span><input type="date" name="naissance" value="${api.esc(p.naissance)}" max="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field"><span>Date de baptême</span><input type="date" name="bapteme" value="${api.esc(p.bapteme)}" max="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field"><span>Fonction</span><select name="fonction"><option value=""></option>${FONCTIONS.map(v => `<option ${p.fonction === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Portable</span><input type="tel" name="telephone" value="${api.esc(p.telephone)}"></label>
      <label class="field"><span>Assemblée</span><input type="text" name="assemblee" list="congList" value="${api.esc(p.assemblee)}"><datalist id="congList">${congs}</datalist></label>
      <label class="field"><span>Mail</span><input type="email" name="email" value="${api.esc(p.email)}"></label>
      <label class="field wide"><span>Adresse</span><input type="text" name="adresse" value="${api.esc(p.adresse)}"></label>
      <label class="field"><span>Code postal</span><input type="text" name="cp" value="${api.esc(p.cp)}"></label>
      <label class="field"><span>Ville</span><input type="text" name="ville" value="${api.esc(p.ville)}"></label>
      <label class="field wide"><span>Notes</span><textarea name="notes" rows="2">${api.esc(p.notes)}</textarea></label>
      <div class="notice danger small wide hidden" id="pErr"></div></form>`;
    const actions = [];
    if (!isNew) actions.push({label: 'Supprimer', kind: 'danger', onClick: async () => {
      if (!await api.confirm('Supprimer', `Supprimer ${fullName(p)} de l’annuaire ?`, 'Supprimer', true)) return false;
      api.data.persons = api.data.persons.filter(x => x.id !== p.id); api.save(); api.toast('Personne supprimée'); return 'deleted';
    }});
    actions.push({label: 'Annuler', value: null}, {label: 'Enregistrer', kind: 'primary', onClick: async b => {
      const f = api.$('form', b), err = api.$('#pErr', b);
      for (const k of ['civilite', 'prenom', 'nom', 'naissance', 'bapteme', 'fonction', 'assemblee', 'telephone', 'email', 'adresse', 'cp', 'ville', 'notes']) p[k] = f[k].value.trim();
      if (p.naissance && p.bapteme && p.bapteme < p.naissance) { err.textContent = 'La date de baptême est antérieure à la date de naissance.'; err.classList.remove('hidden'); return false; }
      p.nom = p.nom.toUpperCase();
      if (!p.prenom && !p.nom) { err.textContent = 'Indiquez au moins un prénom ou un nom.'; err.classList.remove('hidden'); return false; }
      if (!emailOk(p.email)) { err.textContent = 'L’adresse mail semble mal formée (vérifiez les points et le @).'; err.classList.remove('hidden'); return false; }
      const dup = api.data.persons.find(x => x.id !== p.id && sameP(x, p));
      if (dup && !await api.confirm('Doublon possible', `${fullName(dup)} existe déjà dans l’annuaire (${dup.assemblee || 'sans assemblée'}). Enregistrer quand même ?`, 'Enregistrer')) return false;
      ensureCongregation(p.assemblee);
      if (isNew) api.data.persons.push(p); else Object.assign(person, p);
      api.save(); api.toast(isNew ? 'Personne ajoutée' : 'Fiche enregistrée'); return 'saved';
    }});
    return api.modal({title: isNew ? 'Nouvelle personne' : fullName(p), body, actions, onMount: b => api.$('[name=prenom]', b).focus()});
  }

  /* ---------- Doublons ---------- */
  async function showDuplicates() {
    const groups = {};
    for (const p of api.data.persons) (groups[keyOf(p)] ??= []).push(p);
    const dups = Object.values(groups).filter(g => g.length > 1 && new Set(g.map(p => p.naissance).filter(Boolean)).size <= 1);
    const render = () => dups.length ? dups.map((g, i) => `<div class="card" style="margin-bottom:10px"><div class="row" style="justify-content:space-between">
        <div>${g.map(p => `<div><strong>${api.esc(fullName(p))}</strong> <span class="small muted">${api.esc([p.assemblee, p.telephone, p.email].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>
        <button class="btn small primary" data-merge="${i}">Fusionner</button></div></div>`).join('')
      : '<p>Aucun doublon détecté (comparaison sans accents ni majuscules).</p>';
    await api.modal({title: `Doublons (${dups.length})`, body: `<div id="dupList">${render()}</div>`, onMount: b => {
      b.addEventListener('click', e => {
        const btn = e.target.closest('[data-merge]'); if (!btn) return;
        const g = dups[btn.dataset.merge];
        const score = p => FIELDS.filter(f => p[f.key]).length;
        const keep = [...g].sort((a, b) => score(b) - score(a))[0];
        for (const p of g) if (p !== keep) for (const f of FIELDS) if (!keep[f.key] && p[f.key]) keep[f.key] = p[f.key];
        api.data.persons = api.data.persons.filter(p => p === keep || !g.includes(p));
        dups.splice(Number(btn.dataset.merge), 1); api.save();
        api.$('#dupList', b).innerHTML = render(); api.toast('Fiches fusionnées');
      });
    }});
  }

  /* ---------- Import Excel / CSV ---------- */
  const GUESS = [
    ['email', /mail|courriel/], ['nom_complet', /nom.*prenom|prenom.*nom|nom complet|participant/], ['prenom', /prenom/],
    ['nom', /^nom$|nom de famille/], ['civilite', /^(f s|f|civilite|frere soeur|titre)$/], ['telephone', /\btel\b|telephone|portable|mobile|gsm/],
    ['fonction', /^(fonction|fct|a ass|attribution|role|privilege)$/], ['assemblee', /assemblee|congregation/], ['naissance', /date de naiss|naissance|ne le/], ['bapteme', /jour bapt|date de bapt|date bapt|bapteme le/], ['bapteme', /bapteme|bapt/], ['cp', /^cp$|code postal/], ['ville', /^ville$|commune|localite/], ['adresse', /adresse/]
  ];
  const TARGETS = [{key: 'nom_complet', label: 'Prénom et nom dans une seule colonne'}, ...FIELDS.filter(f => f.key !== 'notes')];

  async function importFlow(onDone, mode = 'import') {
    const compare = mode === 'compare';
    const file = await api.pickFile('.xlsx,.xlsm,.csv,.pdf'); if (!file) return;
    let sheets;
    try { sheets = await App.files.readTable(file); } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
    sheets = sheets.filter(s => s.rows.some(r => r.some(c => String(c).trim())));
    if (!sheets.length) return api.toast('Le fichier ne contient aucune donnée.', 'error');
    // Ligne des titres = celle des 20 premières qui contient le plus de titres reconnus (pas d'@ ni de longs textes).
    const isTitle = c => { const t = String(c ?? '').trim(); return t && t.length < 40 && !/@|\d{4,}/.test(t) && GUESS.some(([, re]) => re.test(api.norm(t))); };
    const detectHeader = rows => { let best = -1, score = 0; for (let i = 0; i < Math.min(rows.length, 20); i++) { const n = rows[i].filter(isTitle).length; if (n > score) { score = n; best = i; } } return best; };

    const result = await api.modal({title: compare ? 'Mettre à jour l’annuaire depuis un fichier' : 'Importer dans l’annuaire', wide: true, body: `
      ${compare ? '<div class="notice small">Choisissez la feuille et vérifiez les colonnes : l’étape suivante compare le fichier avec l’annuaire et vous laisse valider chaque changement.</div>' : ''}
      <div class="stack"><p class="muted small" style="margin:0">Fichier : ${api.esc(file.name)}</p>
      <div class="form-grid"><label class="field"><span>Feuille</span><select id="impSheet">${sheets.map((s, i) => `<option value="${i}">${api.esc(s.name)} (${s.rows.length} lignes)</option>`).join('')}</select></label>
      <label class="field"><span>Ligne des titres de colonnes (0 = aucune)</span><input type="number" id="impHead" min="0"></label>
      <label class="field"><span>Assemblée à appliquer si elle manque</span><input type="text" id="impCong" list="impCongList" placeholder="(aucune)"><datalist id="impCongList">${api.data.congregations.map(c => `<option value="${api.esc(c.nom)}">`).join('')}</datalist></label></div>
      <div id="impMap" class="form-grid"></div><div id="impPrev"></div></div>`,
      actions: [{label: 'Annuler', value: null}, {label: compare ? 'Comparer…' : 'Importer', kind: 'primary', onClick: b => b._plan ? b._plan : false}],
      onMount: b => {
        const sheetSel = api.$('#impSheet', b), headIn = api.$('#impHead', b);
        const sheet = () => sheets[sheetSel.value];
        const setSheet = () => {
          headIn.value = detectHeader(sheet().rows) + 1;
          const sn = api.norm(sheet().name), known = api.data.congregations.find(c => api.norm(c.nom) === sn);
          api.$('#impCong', b).value = known ? known.nom : (sheets.length > 1 && /^[A-ZÀ-Þ' -]+$/.test(sheet().name.trim()) ? sheet().name.trim() : '');
          buildMap();
        };
        function buildMap() {
          const rows = sheet().rows, h = Math.max(-1, Number(headIn.value) - 1), head = h >= 0 ? rows[h] || [] : [];
          const data = rows.slice(h + 1, h + 61);
          const width = Math.max(...rows.slice(Math.max(h, 0), h + 60).map(r => r.length), 0);
          const letter = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
          const sample = i => data.map(r => String(r[i] ?? '').trim()).find(Boolean) || '';
          const cols = Array.from({length: width}, (_, i) => ({i, title: String(head[i] ?? '').trim(),
            label: String(head[i] ?? '').trim() || `Colonne ${letter(i)}${sample(i) ? ' (' + sample(i).slice(0, 24) + ')' : ''}`}));
          const used = new Set(), guess = {};
          for (const [k, re] of GUESS) { const c = cols.find(c => c.title && !used.has(c.i) && re.test(api.norm(c.title))); if (c && !(k in guess)) { guess[k] = c.i; used.add(c.i); } }
          // Colonnes sans titre reconnu : on regarde leur contenu.
          const vals = i => data.map(r => String(r[i] ?? '').replace(/\u00a0/g, ' ').trim()).filter(Boolean);
          const share = (i, test) => { const v = vals(i); return v.length >= 2 ? v.filter(test).length / v.length : 0; };
          const pick = (k, test, min = 0.6) => { if (k in guess) return; const c = cols.filter(c => !used.has(c.i)).map(c => [c.i, share(c.i, test)]).filter(x => x[1] >= min).sort((a, b) => b[1] - a[1])[0]; if (c) { guess[k] = c[0]; used.add(c[0]); } };
          pick('email', v => /^[^\s@]+@[^\s@]+$/.test(v));
          pick('telephone', v => /^(\+33\s?|0)[1-9]([ .-]?\d{2}){4}$/.test(v));
          if (h < 0) {
          pick('cp', v => /^\d{5}$/.test(v));
          pick('civilite', v => /^(frere|soeur|f|s|fr|sr)\.?$/.test(api.norm(v)));
          if (!('prenom' in guess) && !('nom' in guess)) pick('nom_complet', v => /^\S+(\s\S+)*$/.test(v) && /[a-zà-ÿ]/.test(v) && /(^|\s)[A-ZÀ-Þ'-]{2,}(\s|$)/.test(v) && !/\d|@/.test(v));
          pick('adresse', v => (/^\d+\s*(bis|ter)?,?\s+[a-zà-ÿ]{3,}/i.test(v) && !/^\d+\s*ans?\b/i.test(v)) || /\b(rue|route|chemin|impasse|avenue|allee|place|residence|boulevard|lotissement|hameau|lieu dit)\b/.test(api.norm(v)), 0.5);
          if ('cp' in guess && !('ville' in guess)) for (const i of [guess.cp + 1, guess.cp - 1]) if (i >= 0 && i < width && !used.has(i) && share(i, v => /[a-zA-Z]/.test(v) && !/\d|@/.test(v)) >= 0.6) { guess.ville = i; used.add(i); break; }
          const knownCongs = new Set(api.data.congregations.map(c => api.norm(c.nom)));
          pick('assemblee', v => knownCongs.has(api.norm(v)) || (v === v.toUpperCase() && /^[A-ZÀ-Þ' ’-]{4,}$/.test(v)), 0.7);
          }
          if (guess.nom_complet !== undefined && (guess.prenom !== undefined || guess.nom !== undefined)) delete guess.nom_complet;
          api.$('#impMap', b).innerHTML = TARGETS.map(t => `<label class="field"><span>${t.label}</span><select data-t="${t.key}"><option value="">— ignorer —</option>
            ${cols.map(c => `<option value="${c.i}" ${guess[t.key] === c.i ? 'selected' : ''}>${api.esc(c.label)}</option>`).join('')}</select></label>`).join('');
          preview();
        }
        function preview() {
          const rows = sheet().rows, h = Math.max(-1, Number(headIn.value) - 1);
          const map = {}; api.$$('[data-t]', b).forEach(s => { if (s.value !== '') map[s.dataset.t] = Number(s.value); });
          const people = []; let lastCong = '';
          const headKey = h >= 0 ? api.norm((rows[h] || []).join(' ')) : '';
          for (const r of rows.slice(h + 1)) {
            if (headKey && api.norm(r.join(' ')) === headKey) continue; // titres répétés en haut de chaque page
            const get = k => map[k] === undefined ? '' : String(r[map[k]] ?? '').replace(/\u00a0/g, ' ').trim();
            let prenom = get('prenom'), nom = get('nom');
            if (map.nom_complet !== undefined && !prenom && !nom) ({prenom, nom} = splitName(get('nom_complet')));
            // Une seule colonne « Nom » contenant « Prénom NOM » : on sépare automatiquement.
            else if (map.prenom === undefined && /\s/.test(nom) && /[a-zà-ÿ]/.test(nom)) ({prenom, nom} = splitName(nom));
            if (!prenom && !nom) continue;
            // Lignes de totaux ou de titres (« Total », « Assistance »…) : un seul mot et aucune autre information.
            if ((!prenom || !nom) && !['telephone', 'email', 'adresse', 'naissance', 'bapteme'].some(k => map[k] !== undefined && String(r[map[k]] ?? '').trim())) continue;
            const raw = k => map[k] === undefined ? '' : r[map[k]];
            // Assemblée laissée vide sous une cellule fusionnée : on reprend celle du dessus.
            let cong = get('assemblee'); if (map.assemblee !== undefined) { if (cong) lastCong = cong; else cong = lastCong; }
            people.push({civilite: civ(get('civilite')), prenom, nom: nom.toUpperCase(), naissance: parseDate(raw('naissance')), bapteme: parseDate(raw('bapteme')), fonction: fct(get('fonction')), assemblee: cong || api.$('#impCong', b).value.trim().toUpperCase(), telephone: get('telephone'),
              email: get('email').replace(/,/g, '.').replace(/\s+/g, ''), adresse: get('adresse'), cp: get('cp'), ville: get('ville')});
          }
          // Dédoublonnage dans le fichier lui-même puis contre l'annuaire.
          const unique = [];
          for (const p of people) { const q = unique.find(x => sameP(x, p)); if (q) { for (const f in p) if (!q[f] && p[f]) q[f] = p[f]; } else unique.push(p); }
          const existing = indexOf(api.data.persons);
          const toAdd = unique.filter(p => !existing.has(p)), toMerge = unique.filter(p => existing.has(p));
          const badMail = unique.filter(p => !emailOk(p.email)).length;
          const mapped = new Set(Object.keys(map)); if (map.nom_complet !== undefined) mapped.add('prenom').add('nom');
          if (api.$('#impCong', b).value.trim()) mapped.add('assemblee');
          b._plan = unique.length ? {toAdd, toMerge, existing, unique, mapped} : null;
          api.$('#impPrev', b).innerHTML = `<div class="notice small">${unique.length} personne(s) lue(s) : <strong>${toAdd.length} nouvelle(s)</strong>, ${toMerge.length} déjà présente(s)${compare ? '' : ' (les champs vides seront complétés)'}${people.length > unique.length ? `, ${people.length - unique.length} doublon(s) dans le fichier fusionné(s)` : ''}${badMail ? `, <span style="color:var(--warn)">${badMail} mail(s) à vérifier</span>` : ''}.</div>
            <div class="table-wrap" style="margin-top:10px;max-height:220px"><table class="list"><tr><th>Nom</th><th>Prénom</th><th>Naissance</th><th>Baptême</th><th>Fonction</th><th>Portable</th><th>Mail</th><th>Adresse</th><th>CP</th><th>Ville</th></tr>
            ${unique.slice(0, 8).map(p => `<tr><td>${api.esc(p.nom)}</td><td>${api.esc(p.prenom)}</td><td>${fmtDate(p.naissance)}</td><td>${fmtDate(p.bapteme)}</td><td>${api.esc(p.fonction)}</td><td>${api.esc(p.telephone)}</td><td>${api.esc(p.email)}</td><td>${api.esc(p.adresse)}</td><td>${api.esc(p.cp)}</td><td>${api.esc(p.ville)}</td></tr>`).join('')}</table></div>
            ${unique.length > 8 ? `<p class="small muted">… et ${unique.length - 8} autre(s)</p>` : ''}`;
        }
        sheetSel.addEventListener('change', setSheet); headIn.addEventListener('change', buildMap); api.$('#impCong', b).addEventListener('input', preview);
        b.addEventListener('change', e => { if (e.target.dataset.t) preview(); });
        setSheet();
      }});
    if (!result) return;
    if (compare) { if (await compareFlow(result.unique, result.mapped, file.name) && onDone) onDone(); return; }
    for (const p of result.toAdd) { api.data.persons.push({id: api.uid(), ...p}); ensureCongregation(p.assemblee); }
    for (const p of result.toMerge) { const q = result.existing.find(p); for (const f in p) if (!q[f] && p[f]) q[f] = p[f]; ensureCongregation(p.assemblee); }
    api.save(); api.toast(`${result.toAdd.length} ajout(s), ${result.toMerge.length} fiche(s) complétée(s)`);
    if (onDone) onDone();
  }

  /* ---------- Mise à jour par comparaison ---------- */
  const COMPARED = ['civilite', 'naissance', 'bapteme', 'fonction', 'telephone', 'email', 'adresse', 'cp', 'ville', 'assemblee'];
  const labelOf = k => (FIELDS.find(f => f.key === k) || {label: k}).label;
  const shown = (k, v) => (k === 'naissance' || k === 'bapteme') ? fmtDate(v) : (v || '');
  function same(k, a, b) {
    a = String(a || ''); b = String(b || '');
    if (k === 'telephone') return a.replace(/\D/g, '').replace(/^33/, '0') === b.replace(/\D/g, '').replace(/^33/, '0');
    if (k === 'email') return a.trim().toLowerCase() === b.trim().toLowerCase();
    return api.norm(a) === api.norm(b);
  }

  async function compareFlow(unique, mapped, fileName) {
    const fields = COMPARED.filter(k => mapped.has(k));
    const congs = [...new Set(unique.map(p => api.norm(p.assemblee)).filter(Boolean))];
    const byKey = indexOf(api.data.persons), fileIdx = indexOf(unique);
    const nouveaux = unique.filter(p => !byKey.has(p));
    const modifs = [];
    for (const p of unique) {
      const q = byKey.find(p); if (!q) continue;
      const changes = fields.filter(k => !same(k, q[k], p[k])).map(k => ({k, old: q[k] || '', val: p[k] || '', kind: !q[k] ? 'ajout' : !p[k] ? 'vide' : 'modif'}));
      if (changes.length) modifs.push({person: q, changes});
    }
    const inScope = q => !congs.length || congs.includes(api.norm(q.assemblee));
    const absents = api.data.persons.filter(q => inScope(q) && !fileIdx.has(q));
    const identiques = unique.length - nouveaux.length - modifs.length;
    const scopeTxt = congs.length ? `assemblée${congs.length > 1 ? 's' : ''} ${[...new Set(unique.map(p => p.assemblee).filter(Boolean))].join(', ')}` : 'tout l’annuaire';

    const kindTxt = {ajout: 'complété', modif: 'modifié', vide: 'absent du fichier'};
    const body = `<div class="stack">
      <div class="notice small">Fichier « ${api.esc(fileName)} » comparé avec ${api.esc(scopeTxt)}.
        <strong>${nouveaux.length}</strong> nouvelle(s), <strong>${modifs.length}</strong> fiche(s) modifiée(s), <strong>${absents.length}</strong> absente(s) du fichier, ${identiques} identique(s).
        Cochez ce que vous voulez appliquer.</div>
      ${nouveaux.length ? `<h3 style="margin:8px 0 0;font-size:15px">Nouvelles personnes (${nouveaux.length})</h3>
        <div class="table-wrap"><table class="list"><tr><th></th><th>Nom</th><th>Prénom</th><th>Assemblée</th><th>Naissance</th><th>Portable</th></tr>
        ${nouveaux.map((p, i) => `<tr><td><input type="checkbox" data-new="${i}" checked></td><td><strong>${api.esc(p.nom)}</strong></td><td>${api.esc(p.prenom)}</td><td>${api.esc(p.assemblee)}</td><td>${fmtDate(p.naissance)}</td><td>${api.esc(p.telephone)}</td></tr>`).join('')}</table></div>` : ''}
      ${modifs.length ? `<h3 style="margin:8px 0 0;font-size:15px">Fiches modifiées (${modifs.length})</h3>
        <div class="table-wrap"><table class="list"><tr><th></th><th>Personne</th><th>Champ</th><th>Dans l’annuaire</th><th>Dans le fichier</th></tr>
        ${modifs.map((m, i) => m.changes.map((c, j) => `<tr><td><input type="checkbox" data-mod="${i}.${j}" ${c.kind === 'vide' ? '' : 'checked'}></td>
          <td>${j === 0 ? `<strong>${api.esc((m.person.nom || '').toUpperCase())}</strong> ${api.esc(m.person.prenom)}` : ''}</td>
          <td>${labelOf(c.k)} <span class="pill ${c.kind === 'vide' ? 'warn' : ''}">${kindTxt[c.kind]}</span></td>
          <td class="muted">${api.esc(shown(c.k, c.old)) || '—'}</td><td><strong>${api.esc(shown(c.k, c.val)) || '(vide)'}</strong></td></tr>`).join('')).join('')}</table></div>
        <p class="small muted" style="margin:0">Les champs vides dans le fichier ne sont pas cochés : par défaut, l’information de l’annuaire est conservée.</p>` : ''}
      ${absents.length ? `<h3 style="margin:8px 0 0;font-size:15px">Dans l’annuaire mais absentes du fichier (${absents.length})</h3>
        <p class="small muted" style="margin:0">Elles ont peut-être déménagé ou changé d’assemblée. Cochez seulement celles à supprimer de l’annuaire.</p>
        <div class="table-wrap"><table class="list"><tr><th>Supprimer</th><th>Nom</th><th>Prénom</th><th>Assemblée</th><th>Portable</th></tr>
        ${absents.map((q, i) => `<tr><td><input type="checkbox" data-abs="${i}"></td><td><strong>${api.esc((q.nom || '').toUpperCase())}</strong></td><td>${api.esc(q.prenom)}</td><td>${api.esc(q.assemblee)}</td><td>${api.esc(q.telephone)}</td></tr>`).join('')}</table></div>` : ''}
      ${!nouveaux.length && !modifs.length && !absents.length ? '<p>L’annuaire est déjà à jour par rapport à ce fichier.</p>' : ''}
    </div>`;

    const report = () => {
      const rows = [['Type', 'Nom', 'Prénom', 'Assemblée', 'Champ', 'Dans l’annuaire', 'Dans le fichier']];
      for (const p of nouveaux) rows.push(['Nouvelle personne', p.nom, p.prenom, p.assemblee, '', '', '']);
      for (const m of modifs) for (const c of m.changes) rows.push(['Fiche modifiée', (m.person.nom || '').toUpperCase(), m.person.prenom, m.person.assemblee, labelOf(c.k), shown(c.k, c.old), shown(c.k, c.val)]);
      for (const q of absents) rows.push(['Absente du fichier', (q.nom || '').toUpperCase(), q.prenom, q.assemblee, '', '', '']);
      const csv = '\ufeff' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const d = new Date();
      api.download(`Comparaison annuaire ${d.toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`, new Blob([csv], {type: 'text/csv'}));
    };

    const plan = await api.modal({title: 'Comparaison avec l’annuaire', wide: true, body,
      actions: [{label: 'Télécharger le rapport', onClick: () => { report(); return false; }}, {label: 'Annuler', value: null},
        ...(nouveaux.length || modifs.length || absents.length ? [{label: 'Appliquer les changements cochés', kind: 'primary', onClick: async b => {
          const sel = attr => api.$$(`input[${attr}]:checked`, b).map(i => i.getAttribute(attr));
          const plan = {add: sel('data-new').map(Number), mod: sel('data-mod'), del: sel('data-abs').map(Number)};
          if (plan.del.length && !await api.confirm('Suppressions', `${plan.del.length} personne(s) vont être supprimées de l’annuaire. Pensez à faire une sauvegarde avant. Continuer ?`, 'Continuer', true)) return false;
          return plan; }}] : [])]});
    if (!plan) return false;
    const addedP = [];
    for (const i of plan.add) { const p = {id: api.uid(), ...nouveaux[i]}; api.data.persons.push(p); addedP.push(p); ensureCongregation(p.assemblee); }
    for (const id of plan.mod) { const [i, j] = id.split('.').map(Number); const m = modifs[i], c = m.changes[j]; m.person[c.k] = c.k === 'nom' ? c.val.toUpperCase() : c.val; if (c.k === 'assemblee') ensureCongregation(c.val); }
    const del = new Set(plan.del.map(i => absents[i]));
    if (del.size) api.data.persons = api.data.persons.filter(q => !del.has(q));
    const cyc = App.circo?.noteListChanges ? App.circo.noteListChanges(addedP, [...del], fileName) : 0;
    api.save();
    api.toast(`${plan.add.length} ajout(s), ${plan.mod.length} changement(s), ${del.size} suppression(s)${cyc && (addedP.length || del.size) ? ` · noté dans l’analyse du cycle ${cyc}` : ''}`);
    return true;
  }

  /* ---------- Assemblées ---------- */
  // Suppression : l'assemblée seule, les coordonnées de ses membres, ou l'assemblée avec toutes ses fiches.
  const CONTACT_FIELDS = ['adresse', 'cp', 'ville', 'telephone', 'email'];
  async function deleteCongregationFlow(c) {
    const members = api.data.persons.filter(p => api.norm(p.assemblee) === api.norm(c.nom));
    const n = members.length;
    const choice = await api.modal({title: `Supprimer — ${c.nom}`, body: `
      <div class="stack"><p style="margin:0">${n} personne(s) sont rattachées à cette assemblée. Que voulez-vous supprimer ?</p>
      <label class="row" style="align-items:flex-start"><input type="radio" name="del" value="cong" checked style="margin-top:4px"><span><strong>L’assemblée seulement</strong><br><span class="small muted">Les fiches des personnes sont conservées, avec leur assemblée inscrite.</span></span></label>
      <label class="row" style="align-items:flex-start"><input type="radio" name="del" value="contacts" ${n ? '' : 'disabled'} style="margin-top:4px"><span><strong>Les coordonnées des ${n} personne(s)</strong><br><span class="small muted">Efface l’adresse, le code postal, la ville, le portable et le mail. Les noms, dates, fonction et notes sont conservés. L’assemblée reste.</span></span></label>
      <label class="row" style="align-items:flex-start"><input type="radio" name="del" value="all" ${n ? '' : 'disabled'} style="margin-top:4px"><span><strong>L’assemblée et ses ${n} personne(s)</strong><br><span class="small muted">Supprime toutes les fiches. Utile pour réimporter une liste propre.</span></span></label>
      <div class="notice warn small">Action définitive. Faites une sauvegarde avant si vous avez un doute.</div></div>`,
      actions: [{label: 'Annuler', value: null}, {label: 'Continuer', kind: 'danger', onClick: b => api.$('input[name=del]:checked', b).value}]});
    if (!choice) return false;
    if (choice !== 'cong') {
      const what = choice === 'all' ? `supprimer définitivement les ${n} fiche(s) de ${c.nom}` : `effacer les coordonnées des ${n} personne(s) de ${c.nom}`;
      const ok = await api.modal({title: 'Confirmation', body: `<p>Vous allez ${what}.</p><p>Tapez <strong>${api.esc(c.nom)}</strong> pour confirmer :</p><input type="text" id="cfTxt" autocomplete="off">`,
        actions: [{label: 'Annuler', value: false}, {label: 'Confirmer', kind: 'danger', onClick: b => api.norm(api.$('#cfTxt', b).value) === api.norm(c.nom) ? true : false}],
        onMount: b => api.$('#cfTxt', b).focus()});
      if (!ok) return false;
    }
    if (choice === 'contacts') {
      for (const p of members) for (const f of CONTACT_FIELDS) p[f] = '';
      api.toast(`Coordonnées effacées pour ${n} personne(s)`);
    } else {
      if (choice === 'all') { const ids = new Set(members.map(p => p.id)); api.data.persons = api.data.persons.filter(p => !ids.has(p.id)); }
      api.data.congregations = api.data.congregations.filter(x => x.id !== c.id);
      api.toast(choice === 'all' ? `${c.nom} et ses ${n} fiche(s) supprimées` : `Assemblée ${c.nom} supprimée`);
    }
    api.save(); return true;
  }

  async function editCongregation(c) {
    const isNew = !c; const v = c ? {...c} : {id: api.uid(), nom: '', numero: ''};
    return api.modal({title: isNew ? 'Nouvelle assemblée' : v.nom, body: `<form class="form-grid" onsubmit="return false">
      <label class="field"><span>Nom</span><input type="text" name="nom" value="${api.esc(v.nom)}"></label>
      <label class="field"><span>Numéro</span><input type="text" name="numero" value="${api.esc(v.numero)}"></label></form>`,
      actions: [...(isNew ? [] : [{label: 'Supprimer…', kind: 'danger', onClick: async () => {
        const r = await deleteCongregationFlow(c); return r ? 'ok' : false; }}]),
        {label: 'Annuler', value: null}, {label: 'Enregistrer', kind: 'primary', onClick: b => {
          const f = api.$('form', b); v.nom = f.nom.value.trim().toUpperCase(); v.numero = f.numero.value.trim();
          if (!v.nom) return false;
          if (isNew) api.data.congregations.push(v); else Object.assign(c, v);
          api.save(); return 'ok'; }}],
      onMount: b => api.$('[name=nom]', b).focus()});
  }

  /* ---------- Page ---------- */
  function mount(el) {
    let tab = 'personnes', q = '', filt = '', ffct = '';
    function render() {
      const d = api.data;
      el.innerHTML = `<div class="page-head"><div><h1>Annuaire</h1><p>Chaque personne est enregistrée une seule fois et sert à tous les skills.</p></div>
        <div class="row"><button class="btn" id="aImp">Importer Excel / CSV / PDF</button><button class="btn" id="aCmp">Mettre à jour depuis un fichier</button><button class="btn" id="aDup">Doublons</button>
        <button class="btn primary" id="aAdd">${tab === 'personnes' ? '+ Personne' : '+ Assemblée'}</button></div></div>
        <div class="tabs"><button data-tab="personnes" class="${tab === 'personnes' ? 'active' : ''}">Personnes (${d.persons.length})</button>
        <button data-tab="assemblees" class="${tab === 'assemblees' ? 'active' : ''}">Assemblées (${d.congregations.length})</button></div>
        <div id="aBody"></div>`;
      const body = api.$('#aBody', el);
      if (tab === 'personnes') {
        body.innerHTML = `<div class="row" style="margin-bottom:12px"><input type="search" id="aQ" placeholder="Rechercher (nom, assemblée, mail…)" value="${api.esc(q)}" style="max-width:340px">
          <select id="aF" style="max-width:260px"><option value="">Toutes les assemblées</option>${[...d.congregations].sort((a, b) => a.nom.localeCompare(b.nom)).map(c => `<option ${filt === c.nom ? 'selected' : ''}>${api.esc(c.nom)}</option>`).join('')}</select>
          <select id="aFct" style="max-width:200px"><option value="">Toutes les fonctions</option>${FONCTIONS.map(v => `<option ${ffct === v ? 'selected' : ''}>${v}s</option>`).join('')}<option value="aucune" ${ffct === 'aucune' ? 'selected' : ''}>Sans fonction</option></select>
          <span class="small muted" id="aCount"></span></div>
          <div class="table-wrap"><table class="list"><thead><tr><th>Nom</th><th>Prénom</th><th>Naissance</th><th>Baptême</th><th>Fonction</th><th>Portable</th><th>Mail</th><th>Adresse</th><th>CP</th><th>Ville</th></tr></thead><tbody id="aRows"></tbody></table></div>`;
        const draw = () => {
          const nq = api.norm(q);
          const rows = d.persons.filter(p => (!filt || api.norm(p.assemblee) === api.norm(filt)) && (!ffct || (ffct === 'aucune' ? !p.fonction : p.fonction === ffct)) && (!nq || api.norm(Object.values(p).join(' ')).includes(nq)))
            .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr'));
          const cnt = api.$('#aCount', el); if (cnt) cnt.textContent = `${rows.length} personne(s)`;
          const age = iso => { const n = yearsSince(iso); return iso ? `${fmtDate(iso)}<div class="small muted">${n} an${n > 1 ? 's' : ''}</div>` : ''; };
          api.$('#aRows', el).innerHTML = rows.map(p => `<tr class="click" data-id="${p.id}"><td><strong>${api.esc((p.nom || '').toUpperCase())}</strong>${p.assemblee ? `<div class="small muted">${api.esc(p.assemblee)}</div>` : ''}</td>
            <td>${api.esc(p.prenom)}</td><td>${age(p.naissance)}</td><td>${age(p.bapteme)}</td><td>${p.fonction ? `<span class="pill ${p.fonction === 'Ancien' ? 'ok' : ''}">${api.esc(p.fonction)}</span>` : ''}</td><td style="white-space:nowrap">${api.esc(p.telephone)}</td>
            <td>${p.email ? `<a href="mailto:${api.esc(p.email)}" onclick="event.stopPropagation()">${api.esc(p.email)}</a>` : ''}${emailOk(p.email) ? '' : ' <span class="pill warn">à vérifier</span>'}</td>
            <td>${api.esc(p.adresse)}</td><td>${api.esc(p.cp)}</td><td>${api.esc(p.ville)}</td></tr>`).join('')
            || `<tr><td colspan="10" class="muted">${d.persons.length ? 'Aucun résultat.' : 'L’annuaire est vide. Ajoutez une personne ou importez un fichier Excel.'}</td></tr>`;
        };
        draw();
        api.$('#aQ', el).addEventListener('input', e => { q = e.target.value; draw(); });
        api.$('#aF', el).addEventListener('change', e => { filt = e.target.value; draw(); });
        api.$('#aFct', el).addEventListener('change', e => { ffct = e.target.value === 'aucune' ? 'aucune' : e.target.value.replace(/s$/, ''); draw(); });
        api.$('#aRows', el).addEventListener('click', async e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; if (await editPerson(d.persons.find(p => p.id === tr.dataset.id))) render(); });
      } else {
        const count = n => d.persons.filter(p => api.norm(p.assemblee) === api.norm(n)).length;
        body.innerHTML = `<div class="table-wrap"><table class="list"><thead><tr><th>Assemblée</th><th>Numéro</th><th>Personnes</th></tr></thead><tbody>
          ${[...d.congregations].sort((a, b) => a.nom.localeCompare(b.nom)).map(c => `<tr class="click" data-id="${c.id}"><td><strong>${api.esc(c.nom)}</strong></td><td>${api.esc(c.numero)}</td><td>${count(c.nom)}</td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">Aucune assemblée. Elles sont créées automatiquement quand vous ajoutez des personnes.</td></tr>'}</tbody></table></div>`;
        body.addEventListener('click', async e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; if (await editCongregation(d.congregations.find(c => c.id === tr.dataset.id))) render(); });
      }
      api.$$('[data-tab]', el).forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
      api.$('#aAdd', el).addEventListener('click', async () => { if (await (tab === 'personnes' ? editPerson() : editCongregation())) render(); });
      api.$('#aDup', el).addEventListener('click', async () => { await showDuplicates(); render(); });
      api.$('#aImp', el).addEventListener('click', () => importFlow(render));
      api.$('#aCmp', el).addEventListener('click', () => importFlow(render, 'compare'));
    }
    render();
  }

  return {mount, editPerson, fullName, keyOf, findByName, splitName, ensureCongregation, emailOk, parseDate, fmtDate, yearsSince};
})();

App.registerSkill({
  id: 'annuaire', name: 'Annuaire', icon: '👥', group: 'socle', order: 1,
  description: 'Personnes et assemblées, partagées par tous les skills.',
  mount: el => App.annuaire.mount(el)
});
