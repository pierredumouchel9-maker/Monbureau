'use strict';
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
      visite: {l: 'Visite', bg: '#ffffff'}, vacances: {l: 'Vacances', bg: '#c8f7c5'}, repos: {l: 'Repos', bg: '#c8f7c5'},
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
      if (asmOf(label)) return 'visite';
      return t ? 'autre' : 'autre';
    }
    // Dates
    const D = iso => new Date(iso + 'T00:00');
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
    const firstTuesday = y => { const d = new Date(y, 8, 1); while (d.getDay() !== 2) d.setDate(d.getDate() + 1); return d; };
    const dd = d => d.toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});
    const weekOf = (A, i) => { const s = add(D(A.debut), 7 * i); return {s, e: add(s, 5), n: isoWeek(s)}; };
    const halfOf = d => (d.getMonth() >= 8 || d.getMonth() <= 1) ? 'A' : 'B';   // A : septembre → février ; B : mars → août
    const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    let state = {id: null};

    function current() { const L = store().annees; if (!L.length) return null; return L.find(a => a.id === state.id) || L.find(a => { const s = D(a.debut), e = add(s, 7 * a.semaines.length); return today() >= add(s, -1) && today() < e; }) || L.at(-1); }

    function render() {
      const L = store().annees.sort((a, b) => a.debut.localeCompare(b.debut)), A = current();
      el.innerHTML = `<div class="page-head"><div><h1>🗓️ Itinéraire</h1><p>Planning de l’année de service, semaine par semaine. Déplacez une ligne avec ↑ ↓ : les dates suivent.</p></div>
        <div class="row" style="flex-wrap:wrap"><button class="btn" id="iImp">Importer un fichier Excel</button><button class="btn primary" id="iNew">Nouvelle année de service</button>${A ? '<button class="btn" id="iPdf">PDF</button>' : ''}</div></div>
        ${L.length ? `<div class="row" style="gap:6px;margin-bottom:12px;flex-wrap:wrap">${L.map(a => `<button class="btn${a === A ? ' primary' : ''}" data-year="${a.id}">${api.esc(a.titre)}</button>`).join('')}</div>` : ''}
        ${A ? yearView(A) : `<div class="card"><p>Aucun itinéraire. Importez votre fichier Excel (une feuille par année, comme « 2027 A et B ») ou créez une nouvelle année de service.</p></div>`}`;
      api.$('#iImp', el).onclick = importXlsx;
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
      A.semaines.forEach((r, i) => { if (r.type === 'visite' && r.asm) (vis[r.asm] ??= []).push({i, w: weekOf(A, i)}); });
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
          <div class="row small" style="gap:8px;flex-wrap:wrap"><label>Premier mardi : <input type="date" id="iDeb" value="${A.debut}"></label><button class="btn" id="iAddEnd">+ Semaine à la fin</button><button class="btn" id="iDelY">Supprimer l’année</button></div></div>
          <datalist id="iList">${[...names, ...SPECIALS].map(n => `<option value="${api.esc(n)}">`).join('')}</datalist>
          <div class="table-wrap" style="max-height:70vh;margin-top:8px"><table class="list" style="font-size:.9rem"><thead><tr><th>Sem.</th><th>Du – au</th><th style="min-width:260px">Itinéraire</th><th>Type</th><th style="min-width:180px">Remarques</th><th>Vacances</th><th title="S-302">S-302</th><th title="jw.org">jw.org</th><th title="Courrier">Cour.</th><th style="min-width:200px">Tâche</th><th></th></tr></thead><tbody>
          ${A.semaines.map((r, i) => { const w = weekOf(A, i), now = t >= add(w.s, -1) && t <= w.e, bg = TYPES[r.type]?.bg || '#fff';
            return `<tr data-i="${i}" style="background:${bg};${now ? 'outline:2px solid var(--accent,#2f6fd6);' : ''}">
              <td><strong>${w.n}</strong></td><td class="small" style="white-space:nowrap">${dd(w.s)} – ${dd(w.e)}</td>
              <td><input list="iList" data-f="libelle" value="${api.esc(r.libelle)}" style="width:100%;font-weight:${r.type === 'visite' ? 600 : 400}">${r.type === 'visite' && !r.asm ? '<div class="small" style="color:var(--danger,#c00)">assemblée non reconnue</div>' : ''}</td>
              <td><select data-f="type" style="min-width:140px">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${r.type === k ? ' selected' : ''}>${v.l}</option>`).join('')}</select></td>
              <td><input data-f="note" value="${api.esc(r.note || '')}" style="width:100%"></td>
              <td><input data-f="zone" value="${api.esc(r.zone || '')}" style="width:110px"></td>
              ${['s302', 'jw', 'cour'].map(k => `<td style="text-align:center"><input type="checkbox" data-c="${k}"${r[k] ? ' checked' : ''}></td>`).join('')}
              <td><div style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap"><input type="checkbox" data-c="fait"${r.fait ? ' checked' : ''} title="Fait"${r.tache ? '' : ' style="visibility:hidden"'}><input data-f="tache" value="${api.esc(r.tache || '')}" style="flex:1;min-width:160px;${r.fait ? 'text-decoration:line-through;opacity:.6' : ''}"></div></td>
              <td style="white-space:nowrap"><button class="btn" data-mv="-1" title="Monter">↑</button><button class="btn" data-mv="1" title="Descendre">↓</button><button class="btn" data-ins title="Insérer une semaine avant">＋</button><button class="btn" data-del title="Supprimer la semaine">✕</button></td></tr>`; }).join('')}
          </tbody></table></div>
          <p class="small muted" style="margin:8px 0 0">Couleurs : <span style="background:#c8f7c5;padding:0 4px">vacances / repos</span> <span style="background:#fff3a3;padding:0 4px">assemblées, Mémorial</span> <span style="background:#dbeafe;padding:0 4px">semaines PP, formations</span>. A = septembre à février, B = mars à août.</p></div>`;
    }

    function bindYear(A) {
      const keep = () => { const w = api.$('.table-wrap[style*="70vh"]', el); return w ? w.scrollTop : 0; };
      const redraw = () => { const s = keep(); api.save(); render(); const w = api.$('.table-wrap[style*="70vh"]', el); if (w) w.scrollTop = s; };
      api.$('#iDeb', el).onchange = e => { if (e.target.value) { A.debut = e.target.value; redraw(); } };
      api.$('#iAddEnd', el).onclick = () => { A.semaines.push(blank()); redraw(); };
      api.$('#iDelY', el).onclick = async () => { if (!(await api.confirm('Supprimer l’année', `Supprimer l’itinéraire « ${A.titre} » ?`, 'Supprimer', true))) return; store().annees.splice(store().annees.indexOf(A), 1); state.id = null; api.save(); render(); };
      if (api.$('#iPdf', el)) api.$('#iPdf', el).onclick = async () => { try { api.download(`Itinéraire ${A.titre}.pdf`, await pdf(A)); } catch (e) { api.toast('PDF impossible : ' + e.message, 'error'); } };
      for (const tr of api.$$('tr[data-i]', el)) {
        const r = A.semaines[+tr.dataset.i];
        for (const inp of api.$$('[data-f]', tr)) inp.onchange = () => {
          const f = inp.dataset.f; r[f] = inp.value.trim();
          if (f === 'libelle') { r.asm = asmOf(r.libelle); r.type = typeOf(r.libelle); const m = /(\d+)\s*min/.exec(r.libelle); if (m && !r.note) r.note = m[0]; }
          if (f === 'type' && r.type === 'visite') r.asm = asmOf(r.libelle);
          redraw();
        };
        for (const c of api.$$('[data-c]', tr)) c.onchange = () => { r[c.dataset.c] = c.checked; redraw(); };
        for (const b of api.$$('[data-mv]', tr)) b.onclick = () => { const i = +tr.dataset.i, j = i + Number(b.dataset.mv); if (j < 0 || j >= A.semaines.length) return; [A.semaines[i], A.semaines[j]] = [A.semaines[j], A.semaines[i]]; redraw(); };
        api.$('[data-ins]', tr).onclick = () => { A.semaines.splice(+tr.dataset.i, 0, blank()); redraw(); };
        api.$('[data-del]', tr).onclick = async () => { if (r.libelle && !(await api.confirm('Supprimer la semaine', `Supprimer « ${r.libelle} » ? Les semaines suivantes remontent d’une semaine.`, 'Supprimer', true))) return; A.semaines.splice(+tr.dataset.i, 1); redraw(); };
      }
    }
    const blank = () => ({libelle: '', type: 'autre', asm: '', note: '', zone: '', s302: false, jw: false, cour: false, tache: '', fait: false});

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
      const unk = found.flatMap(f => f.semaines.filter(s => s.type === 'visite' && !s.asm)).length;
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
      api.toast(`${titre} créée${last ? ' à partir de ' + last.titre + ' : ajustez l’ordre et les dates spéciales' : ''}.`);
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
        x = M; vals.forEach((v, j) => { let s = T(v); const f = j === 2 && r.type !== 'visite' ? B : R; while (s.length > 1 && f.widthOfTextAtSize(s, fs) > cols[j][1] - 4) s = s.slice(0, -2) + '…'; if (s) page.drawText(s, {x: x + 2, y: y - rh + 4, size: fs, font: f, color: j === 3 ? mute : ink}); x += cols[j][1]; });
        y -= rh; page.drawLine({start: {x: M, y}, end: {x: W - M, y}, thickness: .3, color: line});
      });
      page.drawText(T(`Mon Bureau · imprimé le ${api.dateLongue()}`), {x: M, y: 14, size: 7, font: R, color: mute});
      return new Blob([await doc.save()], {type: 'application/pdf'});
    }

    render();
  }
});
