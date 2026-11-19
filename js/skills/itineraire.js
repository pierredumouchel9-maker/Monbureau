'use strict';
/* Champs de fusion « Semaine spéciale » (S-302, lettre au CCA) : fournis par l'itinéraire. */
App.fields.register('visite', 'Semaine spéciale', [
  {key: 'v_assemblee', label: 'Assemblée visitée'}, {key: 'v_coordinateur', label: 'Coordinateur (CCA)'},
  {key: 'v_semaine', label: 'Dates de la semaine spéciale'}, {key: 'v_debut', label: 'Début (mardi)'}, {key: 'v_fin', label: 'Fin (dimanche)'}, {key: 'v_epouse', label: 'Prénom de mon épouse'}
], ({visite: v}) => v ? {v_assemblee: v.assemblee, v_coordinateur: v.coordinateur, v_semaine: v.semaine, v_debut: v.debut, v_fin: v.fin, v_epouse: App.api.data?.settings?.profil?.epouse || ''} : {});
/* Itinéraire : planning des semaines de l'année de service (visites, vacances, assemblées, semaines PP, formations…),
   avec suivi des formulaires (S-302, jw.org, courrier) et des tâches. Les dates se calculent semaine par semaine
   à partir du premier mardi : déplacer une ligne déplace la visite, les dates suivent. */
App.registerSkill({
  id: 'itineraire', name: 'Itinéraire', icon: '🗓️', group: 'metier', order: 12, version: '1.0',
  description: 'Itinéraire de l’année de service, cycle après cycle : visites, vacances, assemblées, formulaires.',
  mount(el, api) {
    const store = () => api.moduleData('itineraire', {annees: []});
    const circ = () => api.moduleData('circonscription', {cycles: [], assemblees: [], fiches: {}});
    const ckey = s => api.norm(s).replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte').replace(/[^a-z0-9]/g, '');
    const asmNames = () => { const m = new Map(); for (const a of [...(circ().assemblees || []), ...api.data.persons.map(p => p.assemblee).filter(Boolean)]) if (!/^groupe\b/i.test(a) && !m.has(ckey(a))) m.set(ckey(a), a); return [...m.values()].sort((a, b) => a.localeCompare(b, 'fr')); };
    const TYPES = {
      visite: {l: 'Visite', bg: '#ffffff'}, src: {l: 'Visite SRC', bg: '#d9d9d9'}, vacances: {l: 'Vacances', bg: '#c8f7c5'}, repos: {l: 'Repos', bg: '#c8f7c5'},
      ac: {l: 'Assemblée de circ.', bg: '#fff3a3'}, ar: {l: 'Assemblée régionale', bg: '#fff3a3'}, memorial: {l: 'Mémorial', bg: '#fff3a3'},
      pp: {l: 'Semaine PP', bg: '#dbeafe'}, formation: {l: 'Formation / école', bg: '#dbeafe'}, autre: {l: 'Autre', bg: '#f1f2f4'}};
    const SPECIALS = ['VACANCES', 'SEMAINE DE REPOS', 'AC-RF', 'AC-RC', 'MÉMORIAL', 'Semaine PP', 'ASSEMBLÉE RÉGIONALE', 'EMR Anciens', 'EMR Assistants', 'SEMAINE PRÉPARATION ESP', 'ESP'];
    // Assemblée reconnue dans un libellé (« COUTANCES * (Pas de repas vendredi midi) 31 min. » → COUTANCES)
    function asmOf(label) {
      const head = String(label || '').split(/\s[*(]|\s-\s|\s\d+\s*min|\s\?\?/)[0].trim(), k = ckey(head); if (!k) return '';
      const names = asmNames();
      const exact = names.find(a => ckey(a) === k); if (exact) return exact;
      const near = names.filter(a => { const b = ckey(a); return Math.min(b.length, k.length) >= 4 && (b.startsWith(k) || k.startsWith(b)); });   // « VILLEDIEU » = « VILLEDIEU LES POÊLES », « COUTANCE » = « COUTANCES »
      return near.length === 1 ? near[0] : '';
    }
    function typeOf(label) {
      const t = api.norm(label);
      if (/vacances/.test(t)) return 'vacances';
      if (/repos/.test(t)) return 'repos';
      if (/^ac\b|^ac-|assemblee de circonscription/.test(t)) return 'ac';
      if (/assemblee regionale|^ar\b/.test(t)) return 'ar';
      if (/memorial/.test(t)) return 'memorial';
      if (/semaine pp|\bpp\b/.test(t)) return 'pp';
      if (/\bemr\b|\besp\b|\btps\b|formation|preparation|ecole/.test(t)) return 'formation';
      if (asmOf(label)) return /\bsrc\b|suppl[ée]ant/.test(t) ? 'src' : 'visite';
      return t ? 'autre' : 'autre';
    }
    const isV = t => t === 'visite' || t === 'src';   // visite assurée par moi ou par le suppléant (SRC)
    // Dates
    const D = iso => new Date(iso + 'T00:00');
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
    const firstTuesday = y => { const d = new Date(y, 8, 1); while (d.getDay() !== 2) d.setDate(d.getDate() + 1); return d; };
    const dd = d => d.toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});
    /* Vacances scolaires officielles : API ouverte du ministère de l'Éducation nationale (data.education.gouv.fr, jeu « fr-en-calendrier-scolaire »).
       Une semaine est marquée si au moins un jour du mardi au vendredi tombe pendant les vacances d'une zone. */
    const API_VAC = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
    const localDay = s => { const d = new Date(s); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    async function fetchVacances(y) {   // année de service sept. y → août y+1
      const years = [`${y - 1}-${y}`, `${y}-${y + 1}`], out = [];
      for (const an of years) {
        let offset = 0;
        for (;;) {
          const q = new URLSearchParams({where: `annee_scolaire="${an}" and (zones="Zone A" or zones="Zone B" or zones="Zone C")`, limit: '100', offset: String(offset), select: 'description,start_date,end_date,zones,population'});
          const r = await fetch(`${API_VAC}?${q}`); if (!r.ok) throw new Error('site de l’Éducation nationale : ' + r.status);
          const j = await r.json(); for (const x of j.results || []) if (!/enseignant/i.test(x.population || '') && x.start_date && x.end_date) out.push(x);
          offset += 100; if (offset >= (j.total_count || 0)) break;
        }
      }
      // une période par zone et par vacances (les académies d'une même zone ont les mêmes dates)
      const per = {};
      for (const x of out) { const k = x.zones + '|' + x.description + '|' + x.start_date.slice(0, 7);
        let s0 = localDay(x.start_date); if (s0.getDay() === 5) s0 = add(s0, 1);   // départ « après la classe » du vendredi
        const e0 = localDay(x.end_date); const p = per[k] ??= {zone: x.zones.replace('Zone ', ''), nom: x.description, s: s0, e: e0};
        if (s0 < p.s) p.s = s0; if (e0 > p.e) p.e = e0; }
      return Object.values(per);
    }
    const zonesLabel = z => { z = [...new Set(z)].sort(); return !z.length ? '' : z.length === 1 ? `Zone ${z[0]}` : z.length === 3 ? 'Zone A, B et C' : `Zones ${z[0]} et ${z[1]}`; };
    function applyVacances(A, per) {
      let n = 0;
      A.semaines.forEach((r, i) => { const w = weekOf(A, i), days = [0, 1, 2, 3].map(k => add(w.s, k));   // mardi → vendredi
        const hit = per.filter(p => days.some(d => d >= p.s && d < p.e));
        r.zone = zonesLabel(hit.map(p => p.zone)); r.vacNom = [...new Set(hit.map(p => p.nom))].join(', '); if (r.zone) n++; });
      return n;
    }
    async function majVacances(A, quiet) {
      try {
        const per = await fetchVacances(D(A.debut).getFullYear());
        if (!per.length) { if (!quiet) api.toast('Le calendrier officiel de cette année n’est pas encore publié.', 'error'); return false; }
        const n = applyVacances(A, per); A.vacMaj = new Date().toISOString(); api.save();
        api.toast(`Vacances scolaires officielles renseignées : ${n} semaine${n > 1 ? 's' : ''} concernée${n > 1 ? 's' : ''}`); return true;
      } catch (e) { api.toast('Vacances non renseignées : impossible de joindre data.education.gouv.fr (hors connexion ?). Réessayez avec le bouton « Vacances scolaires ».', 'error'); return false; }
    }
    const weekOf = (A, i) => { const s = add(D(A.debut), 7 * i); return {s, e: add(s, 5), n: isoWeek(s)}; };
    const halfOf = d => (d.getMonth() >= 8 || d.getMonth() <= 1) ? 'A' : 'B';   // A : septembre → février ; B : mars → août
    const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    let state = {id: null};

    function current() { const L = store().annees; if (!L.length) return null; return L.find(a => a.id === state.id) || L.find(a => { const s = D(a.debut), e = add(s, 7 * a.semaines.length); return today() >= add(s, -1) && today() < e; }) || L.at(-1); }

    function render() {
      const L = store().annees.sort((a, b) => a.debut.localeCompare(b.debut)), A = current();
      el.innerHTML = `<div class="page-head"><div><h1>🗓️ Itinéraire</h1><p>Planning de l’année de service, semaine par semaine. Déplacez une ligne avec ↑ ↓ : les dates suivent.</p></div>
        <div class="row" style="flex-wrap:wrap"><button class="btn" id="iImp">Importer un fichier Excel</button><button class="btn" id="iLet" title="Reprendre la lettre au CCA de Publipostage.xlsm">Importer ma lettre au CCA</button><button class="btn" id="iS302" title="Formulaire S-302 officiel (PDF à remplir)">${s302Doc() ? 'S-302 officiel ✓' : 'Importer le S-302 officiel'}</button>${A ? '<button class="btn" id="iLot">S-302 en lot</button>' : ''}<button class="btn primary" id="iNew">Nouvelle année de service</button>${A ? '<button class="btn" id="iPdf">PDF</button>' : ''}</div></div>
        ${L.length ? `<div class="row" style="gap:6px;margin-bottom:12px;flex-wrap:wrap">${L.map(a => `<button class="btn${a === A ? ' primary' : ''}" data-year="${a.id}">${api.esc(a.titre)}</button>`).join('')}</div>` : ''}
        ${A ? yearView(A) : `<div class="card"><p>Aucun itinéraire. Importez votre fichier Excel (une feuille par année, comme « 2027 A et B ») ou créez une nouvelle année de service.</p></div>`}`;
      api.$('#iImp', el).onclick = importXlsx;
      api.$('#iLet', el).onclick = importLettre;
      api.$('#iS302', el).onclick = importS302Form;
      if (api.$('#iLot', el)) api.$('#iLot', el).onclick = () => lotS302(A);
      api.$('#iNew', el).onclick = newYear;
      for (const b of api.$$('[data-year]', el)) b.onclick = () => { state.id = b.dataset.year; render(); };
      if (A) bindYear(A);
    }

    function nowBanner(A) {
      const t = today(); const i = A.semaines.findIndex((_, k) => { const w = weekOf(A, k); return t >= add(w.s, -1) && t <= w.e; });
      if (i < 0) return '';
      const w = weekOf(A, i), r = A.semaines[i], nx = A.semaines[i + 1], wn = weekOf(A, i + 1);
      return `<div class="card" style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap"><div><div class="small muted">Cette semaine (sem. ${w.n}, du ${dd(w.s)} au ${dd(w.e)})</div><strong style="font-size:1.1rem">${api.esc(r.libelle || '—')}</strong></div>
        ${nx ? `<div><div class="small muted">Semaine prochaine (sem. ${wn.n}, du ${dd(wn.s)} au ${dd(wn.e)})</div><strong style="font-size:1.1rem">${api.esc(nx.libelle || '—')}</strong>${nx.asm && !(nx.s302 && nx.jw && nx.cour) ? ' <span class="pill warn">formulaires à faire</span>' : ''}</div>` : ''}</div>`;
    }

    function controle(A) {
      const names = asmNames(), vis = {};
      A.semaines.forEach((r, i) => { if (isV(r.type) && r.asm) (vis[r.asm] ??= []).push({i, w: weekOf(A, i)}); });
      const rows = names.map(a => { const v = vis[a] || [], va = v.filter(x => halfOf(x.w.s) === 'A'), vb = v.filter(x => halfOf(x.w.s) === 'B');
        const gap = v.length >= 2 ? Math.round((v[1].w.s - v[0].w.s) / 604800000) : null;
        const ok = va.length === 1 && vb.length === 1;
        const cell = l => l.length ? l.map(x => `sem. ${x.w.n} (${dd(x.w.s)})`).join(', ') : '<span style="color:var(--danger,#c00)">aucune</span>';
        return {a, ok, html: `<tr${ok ? '' : ' style="background:#fff4f4"'}><td><strong>${api.esc(a)}</strong></td><td>${cell(va)}</td><td>${cell(vb)}</td><td style="text-align:right">${gap !== null ? gap + ' sem.' : ''}</td></tr>`}; });
      const bad = rows.filter(r => !r.ok).length, other = Object.keys(vis).filter(a => !names.includes(a));
      return `<details class="card" style="margin-bottom:12px" ${bad ? 'open' : ''}><summary style="cursor:pointer"><strong>Contrôle des visites</strong> — ${bad ? `<span style="color:var(--danger,#c00)">${bad} assemblée${bad > 1 ? 's' : ''} sans exactement une visite en A et une en B</span>` : '<span style="color:#1d5a35">✓ chaque assemblée a une visite en A (sept.–févr.) et une en B (mars–août)</span>'}</summary>
        <div class="table-wrap" style="margin-top:8px"><table class="list"><thead><tr><th>Assemblée</th><th>Visite A</th><th>Visite B</th><th style="text-align:right">Écart</th></tr></thead><tbody>${rows.map(r => r.html).join('')}</tbody></table></div>
        ${other.length ? `<p class="small muted">Libellés non rattachés à une assemblée de la liste : ${other.map(api.esc).join(', ')}</p>` : ''}</details>`;
    }

    function yearView(A) {
      const names = asmNames(), t = today();
      return `${nowBanner(A)}${controle(A)}
        <div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><strong>${api.esc(A.titre)}</strong>
          <div class="row small" style="gap:8px;flex-wrap:wrap"><label>Premier mardi : <input type="date" id="iDeb" value="${A.debut}"></label>${['A', 'B'].map(h => `<button class="btn" data-cyc="${h}" title="Lettre au CCA utilisée pour toutes les assemblées du cycle">✉︎ Lettre du cycle ${api.esc(cycleName(A, h))}${A.lettres?.[h] ? ' ✓' : ''}</button>`).join('')}<button class="btn" id="iVac" title="Dates officielles de l’Éducation nationale">Vacances scolaires${A.vacMaj ? ' ✓' : ''}</button><button class="btn" id="iAddEnd">+ Semaine à la fin</button><button class="btn" id="iDelY">Supprimer l’année</button></div></div>
          <datalist id="iList">${[...names, ...SPECIALS].map(n => `<option value="${api.esc(n)}">`).join('')}</datalist>
          <div class="table-wrap" style="max-height:70vh;margin-top:8px"><table class="list" style="font-size:.9rem"><thead><tr><th>Sem.</th><th>Du – au</th><th style="min-width:260px">Itinéraire</th><th>Type</th><th style="min-width:180px">Remarques</th><th>Vacances</th><th title="S-302">S-302</th><th title="jw.org">jw.org</th><th title="Courrier">Cour.</th><th style="min-width:200px">Tâche</th><th></th></tr></thead><tbody>
          ${A.semaines.map((r, i) => { const w = weekOf(A, i), now = t >= add(w.s, -1) && t <= w.e, bg = TYPES[r.type]?.bg || '#fff';
            return `<tr data-i="${i}" style="background:${bg};${now ? 'outline:2px solid var(--accent,#2f6fd6);' : ''}">
              <td><strong>${w.n}</strong></td><td class="small" style="white-space:nowrap">${dd(w.s)} – ${dd(w.e)}</td>
              <td><input list="iList" data-f="libelle" value="${api.esc(r.libelle)}" style="width:100%;font-weight:${isV(r.type) ? 600 : 400}">${isV(r.type) && !r.asm ? '<div class="small" style="color:var(--danger,#c00)">assemblée non reconnue</div>' : ''}</td>
              <td><select data-f="type" style="min-width:140px">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${r.type === k ? ' selected' : ''}>${v.l}</option>`).join('')}</select></td>
              <td><input data-f="note" value="${api.esc(r.note || '')}" style="width:100%"></td>
              <td><input data-f="zone" value="${api.esc(r.zone || '')}" title="${api.esc(r.vacNom || '')}" style="width:110px"></td>
              ${['s302', 'jw', 'cour'].map(k => `<td style="text-align:center;white-space:nowrap"><input type="checkbox" data-c="${k}"${r[k] ? ' checked' : ''}>${k !== 'jw' && isV(r.type) ? `<button class="btn" data-doc="${k}" title="${k === 's302' ? 'Préparer le S-302' : 'Préparer la lettre au CCA'}" style="padding:2px 6px;margin-left:3px">📄</button>${k === 'cour' && r.logement === false ? '<div class="small muted">sans logement</div>' : ''}` : ''}</td>`).join('')}
              <td><div style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap"><input type="checkbox" data-c="fait"${r.fait ? ' checked' : ''} title="Fait"${r.tache ? '' : ' style="visibility:hidden"'}><input data-f="tache" value="${api.esc(r.tache || '')}" style="flex:1;min-width:160px;${r.fait ? 'text-decoration:line-through;opacity:.6' : ''}"></div></td>
              <td style="white-space:nowrap"><button class="btn" data-mv="-1" title="Monter">↑</button><button class="btn" data-mv="1" title="Descendre">↓</button><button class="btn" data-ins title="Insérer une semaine avant">＋</button><button class="btn" data-del title="Supprimer la semaine">✕</button></td></tr>`; }).join('')}
          </tbody></table></div>
          <p class="small muted" style="margin:8px 0 0">Couleurs : <span style="background:#d9d9d9;padding:0 4px">visite SRC</span> <span style="background:#c8f7c5;padding:0 4px">vacances / repos</span> <span style="background:#fff3a3;padding:0 4px">assemblées, Mémorial</span> <span style="background:#dbeafe;padding:0 4px">semaines PP, formations</span>. A = septembre à février, B = mars à août.</p></div>`;
    }

    function bindYear(A) {
      const keep = () => { const w = api.$('.table-wrap[style*="70vh"]', el); return w ? w.scrollTop : 0; };
      const redraw = () => { const s = keep(); api.save(); render(); const w = api.$('.table-wrap[style*="70vh"]', el); if (w) w.scrollTop = s; };
      api.$('#iDeb', el).onchange = e => { if (e.target.value) { A.debut = e.target.value; redraw(); } };
      api.$('#iAddEnd', el).onclick = () => { A.semaines.push(blank()); redraw(); };
      for (const b of api.$$('[data-cyc]', el)) b.onclick = () => editCycleLetter(A, b.dataset.cyc);
      api.$('#iVac', el).onclick = async () => { if (A.semaines.some(r => r.zone) && !(await api.confirm('Vacances scolaires', 'La colonne « Vacances » sera remplacée par les dates officielles de l’Éducation nationale (data.education.gouv.fr).', 'Mettre à jour'))) return; if (await majVacances(A)) redraw(); };
      api.$('#iDelY', el).onclick = async () => { if (!(await api.confirm('Supprimer l’année', `Supprimer l’itinéraire « ${A.titre} » ?`, 'Supprimer', true))) return; store().annees.splice(store().annees.indexOf(A), 1); state.id = null; api.save(); render(); };
      if (api.$('#iPdf', el)) api.$('#iPdf', el).onclick = async () => { try { api.download(`Itinéraire ${A.titre}.pdf`, await pdf(A)); } catch (e) { api.toast('PDF impossible : ' + e.message, 'error'); } };
      for (const tr of api.$$('tr[data-i]', el)) {
        const r = A.semaines[+tr.dataset.i];
        for (const inp of api.$$('[data-f]', tr)) inp.onchange = () => {
          const f = inp.dataset.f; r[f] = inp.value.trim();
          if (f === 'libelle') { r.asm = asmOf(r.libelle); r.type = typeOf(r.libelle); const m = /(\d+)\s*min/.exec(r.libelle); if (m && !r.note) r.note = m[0]; }
          if (f === 'type' && isV(r.type)) r.asm = asmOf(r.libelle);
          redraw();
        };
        for (const c of api.$$('[data-c]', tr)) c.onchange = () => { r[c.dataset.c] = c.checked; redraw(); };
        for (const b of api.$$('[data-mv]', tr)) b.onclick = () => { const i = +tr.dataset.i, j = i + Number(b.dataset.mv); if (j < 0 || j >= A.semaines.length) return; [A.semaines[i], A.semaines[j]] = [A.semaines[j], A.semaines[i]]; redraw(); };
        api.$('[data-ins]', tr).onclick = () => { A.semaines.splice(+tr.dataset.i, 0, blank()); redraw(); };
        for (const b of api.$$('[data-doc]', tr)) b.onclick = () => b.dataset.doc === 's302' && s302Doc() ? s302Flow(A, +tr.dataset.i) : docFlow(A, +tr.dataset.i, b.dataset.doc);
        api.$('[data-del]', tr).onclick = async () => { if (r.libelle && !(await api.confirm('Supprimer la semaine', `Supprimer « ${r.libelle} » ? Les semaines suivantes remontent d’une semaine.`, 'Supprimer', true))) return; A.semaines.splice(+tr.dataset.i, 1); redraw(); };
      }
    }
    const blank = () => ({libelle: '', type: 'autre', asm: '', note: '', zone: '', vacNom: '', s302: false, jw: false, cour: false, tache: '', fait: false});

    // Import du fichier Excel de travail : une feuille par année (A = n° de semaine, E = itinéraire, F = 1re date, H = vacances, I = remarques, B/C/D = formulaires, J/K = tâche)
    async function importXlsx() {
      const file = await api.pickFile('.xlsx,.xlsm'); if (!file) return;
      let sheets; try { sheets = await App.files.readXlsx(file); } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
      const found = [];
      for (const sh of sheets) {
        const rows = sh.rows, h = rows.findIndex(r => /^semaine$/i.test(String(r[0] || '').trim())); if (h < 0) continue;
        const col = re => rows[h].findIndex(v => re.test(String(v || '')));
        const cE = Math.max(0, col(/assembl/i)), cF = col(/date/i), cH = col(/A, B ou C|vacances/i), cI = col(/^RC|Rq|remarq/i);
        const title = (rows.slice(0, h).flat().find(v => /itin/i.test(String(v))) || sh.name).toString().replace(/^itin[ée]raire\s*(nm-\d+)?\s*/i, '').trim() || sh.name;
        const sem = []; let first = null;
        for (let i = h + 1; i < rows.length; i++) {
          const r = rows[i]; if (!/^\d{1,2}$/.test(String(r[0] ?? '').trim())) { if (sem.length) break; continue; }
          if (first === null && typeof r[cF] === 'number') first = r[cF];
          const lib = String(r[cE] || '').replace(/\s+/g, ' ').trim(), on = v => String(v ?? '').trim() !== '';
          const note = [String(r[cI] || '').trim(), (/(\d+)\s*min\.?/.exec(lib) || [])[0], /pas de repas vendredi midi/i.test(lib) ? 'Pas de repas vendredi midi' : ''].filter(Boolean).join(' · ');
          sem.push({libelle: lib, type: typeOf(lib), asm: asmOf(lib), note, zone: cH >= 0 ? String(r[cH] || '').trim() : '', s302: on(r[1]), jw: on(r[2]), cour: on(r[3]), tache: String(r[10] || '').trim(), fait: on(r[9]) && String(r[9]).trim() !== '>'});
          if (String(r[9] || '').trim() === '>') sem.at(-1).note = [sem.at(-1).note, String(r[10] || '').trim()].filter(Boolean).join(' · '), sem.at(-1).tache = '';
        }
        if (!sem.length) continue;
        const d0 = first ? new Date(Math.round((first - 25569) * 86400000)) : null;
        const debut = d0 ? iso(new Date(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate())) : iso(firstTuesday(new Date().getFullYear()));
        found.push({titre: title, debut, semaines: sem});
      }
      if (!found.length) return api.toast('Aucune feuille d’itinéraire reconnue (colonne « Semaine » introuvable).', 'error');
      const L = store().annees, rep = found.filter(f => L.some(a => a.titre === f.titre));
      if (rep.length && !(await api.confirm('Remplacer', `Ces années existent déjà et seront remplacées : ${rep.map(f => f.titre).join(', ')}.`, 'Remplacer'))) return;
      for (const f of found) { const old = L.findIndex(a => a.titre === f.titre); const y = {id: api.uid(), ...f}; if (old >= 0) L.splice(old, 1, y); else L.push(y); state.id = y.id; }
      api.save(); render();
      const unk = found.flatMap(f => f.semaines.filter(s => isV(s.type) && !s.asm)).length;
      api.toast(`${found.length} année${found.length > 1 ? 's' : ''} importée${found.length > 1 ? 's' : ''} (${found.map(f => f.titre + ' : ' + f.semaines.length + ' semaines').join(' ; ')})${unk ? ` · ${unk} libellé(s) à vérifier` : ''}`);
    }

    // Nouvelle année : reprend l'ordre de la dernière année (à ajuster), dates recalculées, cases décochées
    async function newYear() {
      const L = store().annees.sort((a, b) => a.debut.localeCompare(b.debut)), last = L.at(-1);
      const y = last ? D(last.debut).getFullYear() + 1 : (today().getMonth() >= 8 ? today().getFullYear() : today().getFullYear() - 1);
      const debut = firstTuesday(y), nWeeks = Math.round((firstTuesday(y + 1) - debut) / 604800000);
      const titre = `${y + 1} A et B`;
      if (L.some(a => a.titre === titre)) return api.toast(`L’année ${titre} existe déjà.`, 'error');
      const semaines = Array.from({length: nWeeks}, (_, i) => { const s = last?.semaines[i]; return s ? {...blank(), libelle: s.libelle, type: s.type, asm: s.asm, note: s.note, tache: s.tache} : blank(); });
      const A = {id: api.uid(), titre, debut: iso(debut), semaines}; L.push(A); state.id = A.id; api.save(); render();
      api.toast(`${titre} créée${last ? ' à partir de ' + last.titre + ' : ajustez l’ordre et les dates spéciales' : ''}. Recherche des vacances scolaires…`);
      if (await majVacances(A, false)) render();
    }

    /* ---------- S-302 et lettre au CCA (« Cour. ») ---------- */
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const p2 = n => String(n).padStart(2, '0');
    const semaineTexte = (a, b) => a.getFullYear() !== b.getFullYear() ? `${p2(a.getDate())} ${MOIS[a.getMonth()]} ${a.getFullYear()} au ${p2(b.getDate())} ${MOIS[b.getMonth()]} ${b.getFullYear()}`
      : a.getMonth() !== b.getMonth() ? `${p2(a.getDate())} ${MOIS[a.getMonth()]} au ${p2(b.getDate())} ${MOIS[b.getMonth()]} ${b.getFullYear()}` : `${p2(a.getDate())} au ${p2(b.getDate())} ${MOIS[b.getMonth()]} ${b.getFullYear()}`;
    const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    function ccaOf(asm) {
      const p = api.data.persons.find(x => ckey(x.assemblee || '') === ckey(asm) && (x.resp || []).includes('CCA'));
      return p ? `frère ${p.prenom || ''} ${titleCase(p.nom)}`.replace(/\s+/g, ' ').trim() : '';
    }
    const visiteCtx = (r, w) => ({assemblee: r.asm || r.libelle, coordinateur: r.cca || ccaOf(r.asm) || 'frère …', semaine: semaineTexte(w.s, w.e), debut: w.s.toLocaleDateString('fr-FR'), fin: w.e.toLocaleDateString('fr-FR')});
    const TPL = {
      s302: {name: 'S-302 — Annonce de la visite', body: `<h2 style="text-align:center">ANNONCE DE LA VISITE DU RESPONSABLE DE CIRCONSCRIPTION</h2><p><br></p><p>Chers frères et sœurs,</p>
<p style="text-align:justify">Veuillez noter les dates de la prochaine visite du responsable de circonscription. Une fois l’assemblée locale informée, cette note sera mise au tableau d’affichage.</p><p><br></p>
<p>Assemblée locale : <b>{{v_assemblee}}</b></p><p>Responsable de circonscription : <b>{{exp_prenom}} {{exp_nom}}</b></p><p>Date de la visite : <b>{{v_semaine}}</b></p><p><br></p>
<p style="text-align:right">Votre frère,</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p><p><br></p><p>S-302-F</p>`},
      cour: {name: 'Lettre au CCA — semaine spéciale', body: `<p style="text-align:center"><b>{{exp_entete}}</b></p><p style="text-align:center">{{exp_prenom}} {{exp_nom}} ({{exp_fonction}}) – {{exp_telephone}} – {{exp_email}}</p><p><br></p>
<p style="text-align:right">Le {{date_jour}}</p><p><b>Objet : semaine spéciale dans l’assemblée de {{v_assemblee}}</b></p><p><br></p><p>Cher {{v_coordinateur}},</p>
<p style="text-align:justify">C’est avec beaucoup de plaisir que nous vous retrouverons lors de la semaine spéciale qui aura lieu du :</p><p style="text-align:center"><b>{{v_semaine}}</b></p>
<h3>1. Réunions pour la prédication</h3><ul><li>Mercredi : …</li><li>Jeudi : …</li><li>Vendredi : …</li><li>Samedi : …</li><li>Dimanche : …</li></ul>
<h3>2. Programme de prédication</h3><p>…</p><h3>3. Visites pastorales</h3><p>…</p><h3>4. Programme des réunions</h3><p>…</p><h3>5. Logement</h3><p>…</p><h3>6. Repas</h3><p>…</p><h3>7. Examen des dossiers</h3><p>…</p>
<p><br></p><p>Ton compagnon de service,</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p><p style="text-align:right">{{exp_fonction}}</p>`}};
    function ensureTpl(kind) {
      let t = api.data.templates.find(x => x.role === 'itin-' + kind);
      if (!t) { t = {id: api.uid(), role: 'itin-' + kind, name: TPL[kind].name, category: 'Semaine spéciale', body: TPL[kind].body, updated: new Date().toISOString()}; api.data.templates.push(t); api.save(); }
      return t;
    }
    // Reprend la lettre au CCA du classeur Publipostage.xlsm (onglet « Lettre_CCA ») comme modèle modifiable
    async function importLettre() {
      const file = await api.pickFile('.html,.htm,.xlsm,.xlsx'); if (!file) return;
      if (/\.html?$/i.test(file.name)) {   // modèle prêt à l'emploi (mise en forme exacte : couleurs, surlignage, signature…)
        const html = (await file.text()).replace(/<!--[\s\S]*?-->/g, '').trim();
        if (!/<p|<div/i.test(html)) return api.toast('Ce fichier ne contient pas de lettre.', 'error');
        const t = ensureTpl('cour'); t.body = html; t.updated = new Date().toISOString(); api.save();
        return api.toast('Lettre au CCA enregistrée : modifiable dans Modèles › « Lettre au CCA — semaine spéciale ».');
      }
      let sheets; try { sheets = await App.files.readXlsx(file); } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
      const sh = sheets.find(x => /lettre/i.test(x.name)); if (!sh) return api.toast('Onglet « Lettre_CCA » introuvable dans ce classeur.', 'error');
      const F = t => api.esc(String(t)).replace(/«\s*Coordinateur\s*»/gi, '{{v_coordinateur}}').replace(/«\s*SEMAINE_SPECIALE\s*»/gi, '{{v_semaine}}').replace(/«\s*ASSEMBLEES?\s*»/gi, '{{v_assemblee}}').replace(/\n/g, '<br>');
      const out = []; let ul = [], notes = [];
      const flush = () => { if (ul.length) out.push(`<ul>${ul.map(x => `<li>${x}</li>`).join('')}</ul>`); for (const n of notes) out.push(`<p><i>${n}</i></p>`); ul = []; notes = []; };
      sh.rows.forEach((row, ri) => {
        const cells = row.map(v => typeof v === 'string' ? v.trim() : v).filter(v => v !== '' && v !== null && v !== undefined);
        if (!cells.length) { flush(); return; }
        const a = String(row[0] ?? '').trim(), txt = cells.filter(v => typeof v === 'string');
        if (/^⚫|^●|^•/.test(a)) {   // puce : colonnes B-C ; une remarque placée plus à droite devient une note sous la liste
          const main = row.slice(1, 4).filter(v => String(v ?? '').trim()).map(String), rest = row.slice(4).filter(v => typeof v === 'string' && v.trim());
          ul.push(F(main.join(' '))); notes.push(...rest.map(F)); return; }
        flush();
        if (txt.length === 1 && txt[0] === 'Le') return out.push('<p style="text-align:right">Le {{date_jour}}</p>');
        if (/^\d+\.\s/.test(a)) return out.push(`<h3>${F(txt.join(' '))}</h3>`);
        if (ri < 2) return out.push(`<p style="text-align:center"><b>${F(txt.join(' '))}</b></p>`);
        if (!String(row[0] ?? '').trim() && String(row[2] ?? '').trim() && txt.length === 1) return out.push(`<p style="text-align:right">${F(txt[0])}</p>`);
        out.push(`<p style="text-align:justify">${F(txt.join(' '))}</p>`);
      });
      flush();
      if (!out.length) return api.toast('Lettre vide.', 'error');
      const t = ensureTpl('cour'); t.body = out.join('\n'); t.updated = new Date().toISOString(); api.save();
      api.toast('Lettre au CCA reprise du classeur : modifiable dans Modèles › « Lettre au CCA — semaine spéciale ».');
    }
    /* S-302 officiel : le PDF du formulaire (importé une fois par l'utilisateur, gardé chiffré) est rempli champ par champ, au format d'origine. */
    const s302Doc = () => api.docs.list({kind: 's302form'}).sort((a, b) => b.date.localeCompare(a.date))[0];
    async function importS302Form() {
      const file = await api.pickFile('.pdf,application/pdf'); if (!file) return;
      try { const d = await window.PDFLib.PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {ignoreEncryption: true}); if (d.getForm().getFields().filter(f => f.constructor.name === 'PDFTextField' || f.setText).length < 3) throw new Error('ce PDF n’a pas les champs du S-302'); }
      catch (e) { return api.toast('Formulaire non reconnu : ' + e.message, 'error'); }
      const old = api.docs.list({kind: 's302form'}); await api.docs.add(file, {kind: 's302form', asm: ''}); for (const d of old) await api.docs.remove(d.id);
      api.toast('Formulaire S-302 officiel enregistré : il sera rempli automatiquement.'); render();
    }
    const s302Values = (r, w) => { const pr = api.data.settings.profil || {}, rc = [pr.prenom, (pr.nom || '').toUpperCase()].filter(Boolean).join(' ');
      return {asm: r.asm || r.libelle, rc, date: semaineTexte(w.s, w.e), sig: rc, ...(r.docs?.s302f || {})}; };
    async function fillS302(v) {
      const d = s302Doc(); const blob = d && await api.docs.blob(d.id); if (!blob) throw new Error('formulaire S-302 pas encore reçu sur cet appareil (synchronisez)');
      const {PDFDocument, StandardFonts, PDFName, rgb} = window.PDFLib, doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {ignoreEncryption: true});
      const helv = await doc.embedFont(StandardFonts.Helvetica), page = doc.getPage(0);
      const fields = doc.getForm().getFields().filter(f => typeof f.setText === 'function')
        .map(f => ({w: f.acroField.getWidgets()[0]})).map(x => ({r: x.w.getRectangle(), center: x.w.dict.get(PDFName.of('Q'))?.toString() === '1'}))
        .sort((a, b) => b.r.y - a.r.y);   // de haut en bas : assemblée, responsable, date, signature
      // Le texte est écrit sur les pointillés du formulaire, puis les champs sont retirés (document final, non modifiable)
      [v.asm, v.rc, v.date, v.sig].forEach((t, k) => { const x = fields[k]; if (!x) return; const txt = App.pdf.clean(String(t || '')); if (!txt) return;
        let sz = k === 3 ? 12 : 10; while (sz > 6 && helv.widthOfTextAtSize(txt, sz) > x.r.width - 6) sz -= .5;
        const tw = helv.widthOfTextAtSize(txt, sz), tx = x.center || k === 3 ? x.r.x + (x.r.width - tw) / 2 : x.r.x + 3;
        page.drawText(txt, {x: tx, y: x.r.y + (x.r.height - sz) / 2 + 1.5, size: sz, font: helv, color: rgb(0, 0, 0)}); });
      page.node.delete(PDFName.of('Annots')); doc.catalog.delete(PDFName.of('AcroForm'));
      return doc.save();
    }
    async function s302Flow(A, i) {
      const r = A.semaines[i], w = weekOf(A, i), v = s302Values(r, w);
      const fileName = App.pdf.fileName(`S-302 ${v.asm} ${w.s.toLocaleDateString('fr-FR').replace(/\//g, '-')}`) + '.pdf';
      const body = `<p class="small muted" style="margin-top:0">Formulaire S-302 officiel, rempli au format d’origine. Modifiez un champ si besoin (pour cette visite).</p>
        <label class="field"><span>Assemblée locale</span><input id="fA" value="${api.esc(v.asm)}"></label>
        <label class="field"><span>Responsable de circonscription</span><input id="fR" value="${api.esc(v.rc)}"></label>
        <label class="field"><span>Date de la visite</span><input id="fD" value="${api.esc(v.date)}"></label>
        <label class="field"><span>Signature (sous « Votre frère, »)</span><input id="fS" value="${api.esc(v.sig)}"></label>`;
      const read = el => ({asm: api.$('#fA', el).value, rc: api.$('#fR', el).value, date: api.$('#fD', el).value, sig: api.$('#fS', el).value});
      const keep = el => { const x = read(el), base = s302Values({...r, docs: {}}, w), diff = Object.fromEntries(Object.entries(x).filter(([k, val]) => val !== base[k]));
        (r.docs ??= {}).s302f = diff; api.save(); return x; };
      const blobOf = async el => new Blob([await fillS302(keep(el))], {type: 'application/pdf'});
      await api.modal({title: `S-302 — ${v.asm}`, body, actions: [
        {label: 'Fermer', value: null, onClick: el => { keep(el); }},
        {label: 'PDF', onClick: async el => { try { api.download(fileName, await blobOf(el)); } catch (e) { api.toast(e.message, 'error'); } return false; }},
        {label: 'Envoyer par mail…', onClick: async el => { let blob; try { blob = await blobOf(el); } catch (e) { api.toast(e.message, 'error'); return false; }
          const x = read(el); await App.mailer.open({asm: r.asm, blob, fileName, defaults: ['CCA', 'Secrétaire'], subject: `Annonce de la visite du responsable de circonscription — ${x.date}`,
            body: `Bonjour,\n\nVeuillez trouver ci-joint l’annonce de la prochaine visite du responsable de circonscription (S-302), du ${x.date}.\n\nFraternellement,\n${x.rc}`});
          if (!r.s302 && await api.confirm('S-302', `Cocher « S-302 » pour ${x.asm} ?`, 'Cocher')) { r.s302 = true; api.save(); }
          return false; }},
        {label: 'Valider et cocher « S-302 »', kind: 'primary', onClick: el => { keep(el); r.s302 = true; api.save(); return 'ok'; }}]});
      render();
    }
    /* Lettre du cycle : on modifie la lettre une fois par cycle (A : sept.–févr., B : mars–août) ;
       elle sert ensuite à toutes les assemblées du cycle (objet, coordinateur et dates remplis automatiquement). */
    const fixObjet = html => String(html || '').replace(/(dans\s+l['’]assembl[ée]e)\s*(?:…|\.\.\.)/i, '$1 de {{v_assemblee}}');
    const cycleName = (A, h) => `${A.titre.replace(/\s*A et B\s*$/i, '').trim()} ${h}`;
    // Deux lettres par cycle : avec demande de logement, et la même sans (« 5. Logement : Merci de ne pas prévoir de logement pour la visite. »)
    const SANS_LOG = 'Merci de ne pas prévoir de logement pour la visite.';
    function sansLogement(html) {
      const box = document.createElement('div'); box.innerHTML = html;
      const head = [...box.querySelectorAll('p,h1,h2,h3')].find(e => /^\s*\d*\.?\s*logement\s*:?\s*$/i.test(e.textContent));
      const n = head?.nextElementSibling; if (!n) return html;
      n.innerHTML = SANS_LOG;
      for (let x = n.nextElementSibling; x && !/^\s*\d+\.\s/.test(x.textContent) && /logement|arriverons/i.test(x.textContent); x = n.nextElementSibling) x.remove();
      return box.innerHTML;
    }
    const getL = (Y, h) => { const v = Y.lettres?.[h]; return !v ? null : typeof v === 'string' ? {avec: v, sans: null} : v; };
    function cycleModel(A, h, logement = true) {   // la lettre du cycle, sinon celle du cycle précédent, sinon le modèle général
      const pick = (L, from, own) => ({html: logement ? L.avec : (L.sans || sansLogement(L.avec)), from, own, sansPerso: !!L.sans});
      if (getL(A, h)) return pick(getL(A, h), cycleName(A, h), true);
      const Ys = store().annees.slice().sort((a, b) => a.debut.localeCompare(b.debut)), k = Ys.indexOf(A);
      const prev = [...(h === 'B' ? [[A, 'A']] : []), ...Ys.slice(0, k).reverse().flatMap(Y => [[Y, 'B'], [Y, 'A']])].find(([Y, hh]) => getL(Y, hh));
      if (prev) return pick(getL(prev[0], prev[1]), cycleName(prev[0], prev[1]), false);
      return pick({avec: fixObjet(ensureTpl('cour').body), sans: null}, 'modèle général', false);
    }
    // Les champs apparaissent comme des étiquettes non modifiables dans l'éditeur
    const toChips = html => html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => `<span data-champ="${k}" contenteditable="false" style="background:#e7f0fd;color:#1d4f91;border-radius:4px;padding:0 4px;font-weight:600">${api.esc(App.fields.label(k))}</span>`);
    const fromChips = el => { const c = el.cloneNode(true); for (const x of c.querySelectorAll('[data-champ]')) x.replaceWith(`{{${x.dataset.champ}}}`); return c.innerHTML; };
    async function editCycleLetter(A, h) {
      const mA = cycleModel(A, h, true), mS = cycleModel(A, h, false);
      const cur = {avec: toChips(fixObjet(mA.html)), sans: toChips(fixObjet(mS.html))}; let tab = 'avec', sansTouched = mS.sansPerso;
      const body = `<p class="small muted" style="margin-top:0">Lettres au CCA du <strong>cycle ${api.esc(cycleName(A, h))}</strong> (${h === 'A' ? 'septembre à février' : 'mars à août'})${mA.own ? '' : ` — part de : ${api.esc(mA.from)}`}.
        Elles serviront pour toutes les assemblées du cycle ; les étiquettes bleues se remplissent seules (objet, coordinateur, dates, date du jour).</p>
        <div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap"><button class="btn primary" data-tab="avec">🏠 Avec logement</button><button class="btn" data-tab="sans">Sans logement</button><span class="small muted" id="cHint"></span></div>
        <div id="cEd" contenteditable="true" style="border:1px solid var(--line,#ddd);border-radius:8px;padding:28px 34px;background:#fff;max-height:54vh;overflow:auto;font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.35">${cur.avec}</div>
        <label class="row small" style="gap:6px;margin-top:8px"><input type="checkbox" id="cGen" checked> Enregistrer aussi la lettre « avec logement » comme modèle général (point de départ des cycles suivants)</label>`;
      const sync = ed => { if (tab === 'avec') { if (ed.innerHTML !== cur.avec) { cur.avec = ed.innerHTML; if (!sansTouched) { const t = document.createElement('div'); t.innerHTML = cur.avec; cur.sans = toChips(sansLogement(fromChips(t))); } } }
        else { if (ed.innerHTML !== cur.sans) { cur.sans = ed.innerHTML; sansTouched = true; } } };
      const hint = d => { d.querySelector('#cHint').textContent = tab === 'avec' ? (sansTouched ? 'La lettre « sans logement » a été modifiée séparément.' : 'La lettre « sans logement » suit ce texte, avec « Merci de ne pas prévoir de logement pour la visite. »') : 'Version utilisée quand aucun logement n’est demandé.'; };
      const promise = api.modal({title: `Lettres du cycle ${cycleName(A, h)}`, body, wide: true, actions: [
        {label: 'Annuler', value: null},
        {label: 'Enregistrer pour le cycle', kind: 'primary', onClick: el => {
          sync(api.$('#cEd', el));
          const tmp = document.createElement('div'), back = html => { tmp.innerHTML = html; return fromChips(tmp); };
          const avec = back(cur.avec), sans = sansTouched ? back(cur.sans) : null;
          (A.lettres ??= {})[h] = {avec, sans};
          if (api.$('#cGen', el).checked) { const t = ensureTpl('cour'); t.body = avec; t.updated = new Date().toISOString(); }
          A.semaines.forEach((r, k) => { if (r.docs?.cour && !r.cour && halfOf(weekOf(A, k).s) === h) delete r.docs.cour; });   // les courriers non validés reprennent la nouvelle lettre
          api.save(); return 'ok'; }}]});
      setTimeout(() => { const d = [...document.querySelectorAll('dialog[open]')].find(x => x.querySelector('#cEd')); if (!d) return; hint(d);
        for (const b of d.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { const ed = d.querySelector('#cEd'); sync(ed); tab = b.dataset.tab; ed.innerHTML = cur[tab];
          for (const x of d.querySelectorAll('[data-tab]')) x.classList.toggle('primary', x === b); hint(d); }); }, 0);
      const ok = await promise;
      if (ok) { api.toast(`Lettres du cycle ${cycleName(A, h)} enregistrées : elles serviront pour chaque assemblée du cycle.`); render(); }
    }
    async function docFlow(A, i, kind) {
      const r = A.semaines[i], w = weekOf(A, i), tpl = ensureTpl(kind), ctx = visiteCtx(r, w), h = halfOf(w.s);
      let cm = kind === 'cour' ? cycleModel(A, h, r.logement !== false) : null;
      const merged = () => App.pdf.merge(kind === 'cour' ? fixObjet(cm.html) : tpl.body, App.fields.values({visite: ctx}));
      const lbl = kind === 's302' ? 'S-302' : 'Lettre au CCA', flag = kind === 's302' ? 's302' : 'cour';
      const fileName = App.pdf.fileName(`${kind === 's302' ? 'S-302' : 'Lettre CCA'} ${ctx.assemblee} ${w.s.toLocaleDateString('fr-FR').replace(/\//g, '-')}`) + '.pdf';
      const body = `<p class="small muted" style="margin-top:0">${api.esc(ctx.assemblee)} · semaine du ${api.esc(ctx.semaine)}${kind === 'cour' ? ` · coordinateur : ${api.esc(ctx.coordinateur)}` : ''}${r.docs?.[kind] ? ' · <strong>version modifiée pour cette visite</strong>' : ''}</p>
        ${kind === 'cour' ? `<div class="row small" style="gap:14px;margin-bottom:6px"><label class="row" style="gap:4px"><input type="radio" name="dLog" value="1"${r.logement !== false ? ' checked' : ''}> 🏠 Avec logement</label><label class="row" style="gap:4px"><input type="radio" name="dLog" value="0"${r.logement === false ? ' checked' : ''}> Sans logement</label></div>` : ''}
        <div id="dEd" contenteditable="true" style="border:1px solid var(--line,#ddd);border-radius:8px;padding:28px 34px;background:#fff;max-height:58vh;overflow:auto;font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.35">${r.docs?.[kind] || merged()}</div>
        <p class="small muted" style="margin:6px 0 0">${kind === 'cour' ? `Lettre du cycle ${api.esc(cycleName(A, h))} (${api.esc(cm.own ? 'modifiée pour ce cycle' : 'reprise de : ' + cm.from)}), remplie pour ${api.esc(ctx.assemblee)}. Pour changer la lettre de toutes les assemblées du cycle : bouton « Lettre du cycle » en haut de l’itinéraire. Une correction faite ici ne vaut que pour cette assemblée.` : `Modifiez directement le texte pour cette visite. Le modèle commun se modifie dans Modèles › « ${api.esc(tpl.name)} ».`}</p>`;
      const keep = el => { (r.docs ??= {})[kind] = api.$('#dEd', el).innerHTML; api.save(); };
      if (kind === 'cour') setTimeout(() => { const d = [...document.querySelectorAll('dialog[open]')].find(x => x.querySelector('#dEd')); if (!d) return;
        for (const rb of d.querySelectorAll('input[name=dLog]')) rb.addEventListener('change', () => { r.logement = rb.value === '1'; cm = cycleModel(A, h, r.logement);
          if (r.docs) delete r.docs.cour; d.querySelector('#dEd').innerHTML = merged(); api.save(); }); }, 0);
      const blobOf = async el => new Blob([await App.pdf.render(api.$('#dEd', el).innerHTML, {title: lbl})], {type: 'application/pdf'});
      await api.modal({title: `${lbl} — ${ctx.assemblee}`, body, wide: true, actions: [
        {label: 'Fermer', value: null, onClick: el => { if (api.$('#dEd', el).innerHTML !== (r.docs?.[kind] || merged())) keep(el); }},
        {label: kind === 'cour' ? 'Revenir à la lettre du cycle' : 'Revenir au modèle', onClick: el => { api.$('#dEd', el).innerHTML = merged(); if (r.docs) delete r.docs[kind]; api.save(); return false; }},
        {label: 'PDF', onClick: async el => { keep(el); api.download(fileName, await blobOf(el)); return false; }},
        {label: 'Envoyer par mail…', onClick: async el => { keep(el); const blob = await blobOf(el);
          await App.mailer.open({asm: r.asm, blob, fileName, defaults: kind === 's302' ? ['CCA', 'Secrétaire'] : ['CCA'],
            subject: kind === 's302' ? `Annonce de la visite du responsable de circonscription — ${ctx.semaine}` : `Semaine spéciale du ${ctx.semaine} — ${ctx.assemblee}`,
            body: `Bonjour${kind === 'cour' ? ' ' + ctx.coordinateur.replace(/^frère\s+/, '') : ''},\n\nVeuillez trouver ci-joint ${kind === 's302' ? 'l’annonce de la prochaine visite du responsable de circonscription (S-302)' : 'les informations pour l’organisation de la semaine spéciale'}.\n\nFraternellement,\n${[api.data.settings.profil?.prenom, api.data.settings.profil?.nom].filter(Boolean).join(' ')}`});
          if (!r[flag] && await api.confirm(lbl, `Cocher « ${kind === 's302' ? 'S-302' : 'Cour.'} » pour ${ctx.assemblee} ?`, 'Cocher')) { r[flag] = true; api.save(); render(); }
          return false; }},
        {label: `Valider et cocher « ${kind === 's302' ? 'S-302' : 'Cour.'} »`, kind: 'primary', onClick: el => { keep(el); r[flag] = true; api.save(); return 'ok'; }}]});
      render();
    }
    async function lotS302(A) {
      const rows = A.semaines.map((r, i) => ({r, i, w: weekOf(A, i)})).filter(x => isV(x.r.type) && x.r.asm && x.w.e >= today());
      if (!rows.length) return api.toast('Aucune visite à venir dans cette année.', 'error');
      const ids = await api.modal({title: 'S-302 en lot', body: `<p class="small muted" style="margin-top:0">Un PDF par visite, regroupés dans un ZIP. Les visites dont le S-302 n’est pas encore coché sont présélectionnées.</p>
        <div style="max-height:360px;overflow:auto">${rows.map(x => `<label class="row small" style="gap:6px;padding:2px 0"><input type="checkbox" value="${x.i}" ${x.r.s302 ? '' : 'checked'}> sem. ${x.w.n} · ${dd(x.w.s)} – ${dd(x.w.e)} · <strong>${api.esc(x.r.asm)}</strong>${x.r.s302 ? ' <span class="muted">(déjà fait)</span>' : ''}</label>`).join('')}</div>
        <label class="row small" style="margin-top:8px;gap:6px"><input type="checkbox" id="lCheck" checked> Cocher « S-302 » pour les visites générées</label>`,
        actions: [{label: 'Annuler', value: null}, {label: 'Générer le ZIP', kind: 'primary', onClick: el => { const v = api.$$('input[value]:checked', el).map(x => +x.value); return v.length ? {v, mark: api.$('#lCheck', el).checked} : false; }}]});
      if (!ids) return;
      const tpl = ensureTpl('s302'), entries = [];
      for (const i of ids.v) { const r = A.semaines[i], w = weekOf(A, i), ctx = visiteCtx(r, w);
        let bytes;
        if (s302Doc()) { try { bytes = await fillS302(s302Values(r, w)); } catch (e) { return api.toast(e.message, 'error'); } }
        else bytes = await App.pdf.render(r.docs?.s302 || App.pdf.merge(tpl.body, App.fields.values({visite: ctx})), {title: 'S-302'});
        entries.push({name: App.pdf.fileName(`S-302 ${ctx.assemblee} ${w.s.toLocaleDateString('fr-FR').replace(/\//g, '-')}`) + '.pdf', bytes});
        if (ids.mark) r.s302 = true; }
      api.download(`S-302 ${A.titre}.zip`, App.files.zip(entries)); api.save(); render();
      api.toast(`${entries.length} S-302 générés`);
    }

    async function pdf(A) {
      const {PDFDocument, StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
      const doc = await PDFDocument.create(); doc.setTitle('Itinéraire ' + A.titre); doc.setCreator('Mon Bureau');
      const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
      const W = 595.28, H = 841.89, M = 28, page = doc.addPage([W, H]), ink = rgb(.1, .1, .12), mute = rgb(.45, .47, .5), line = rgb(.8, .82, .85);
      const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
      page.drawText(T('Itinéraire ' + A.titre), {x: M, y: H - M - 14, size: 16, font: B, color: rgb(.12, .25, .4)});
      const cols = [['Sem.', 24], ['Du – au', 58], ['Itinéraire', 200], ['Remarques', 125], ['Vacances', 50], ['S-302', 28], ['jw', 22], ['Cour.', 0]];
      cols[cols.length - 1][1] = W - 2 * M - cols.slice(0, -1).reduce((a, c) => a + c[1], 0);
      const rh = Math.min(13.5, (H - 2 * M - 50) / (A.semaines.length + 1)), fs = Math.min(8, rh * .62);
      let y = H - M - 34, x = M;
      for (const [l, w] of cols) { page.drawText(T(l), {x: x + 2, y: y - rh + 4, size: fs, font: B, color: ink}); x += w; }
      y -= rh; page.drawLine({start: {x: M, y}, end: {x: W - M, y}, thickness: .8, color: ink});
      A.semaines.forEach((r, i) => {
        const w = weekOf(A, i), bg = TYPES[r.type]?.bg || '#ffffff';
        if (bg !== '#ffffff') page.drawRectangle({x: M, y: y - rh, width: W - 2 * M, height: rh, color: hex(bg)});
        const vals = [String(w.n), `${dd(w.s)} – ${dd(w.e)}`, r.libelle, r.note, r.zone, r.s302 ? 'X' : '', r.jw ? 'X' : '', r.cour ? 'X' : ''];
        x = M; vals.forEach((v, j) => { let s = T(v); const f = j === 2 && !isV(r.type) ? B : R; while (s.length > 1 && f.widthOfTextAtSize(s, fs) > cols[j][1] - 4) s = s.slice(0, -2) + '…'; if (s) page.drawText(s, {x: x + 2, y: y - rh + 4, size: fs, font: f, color: j === 3 ? mute : ink}); x += cols[j][1]; });
        y -= rh; page.drawLine({start: {x: M, y}, end: {x: W - M, y}, thickness: .3, color: line});
      });
      page.drawText(T(`Mon Bureau · imprimé le ${api.dateLongue()}`), {x: M, y: 14, size: 7, font: R, color: mute});
      return new Blob([await doc.save()], {type: 'application/pdf'});
    }

    render();
  }
});
