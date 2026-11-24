'use strict';
/* Territoires S-13 : analyse automatique des relevés d'attribution de territoire (procédure de Pierre, voir js/s13.js).
   Le PDF importé est gardé chiffré (documents de l'assemblée, type « s13 ») ; les résultats sont dans modules.territoires. */
App.registerSkill({
  id: 'territoires', name: 'Territoires S-13', icon: '🗺️', group: 'metier', order: 13, version: '1.0',
  description: 'Analyse automatique des formulaires S-13 : ancienneté des territoires en 6 catégories.',
  mount(el, api) {
    const S13 = App.s13, CATS = S13.CATS;
    const store = () => api.moduleData('territoires', {analyses: {}});
    const circ = () => api.moduleData('circonscription', {cycles: [], assemblees: [], fiches: {}});
    const ckey = s => api.norm(s).replace(/\bst\b/g, 'saint').replace(/\s+/g, '');
    const asmList = () => { const m = new Map(); for (const a of [...(circ().assemblees || []), ...Object.keys(store().analyses), ...api.data.persons.map(p => p.assemblee).filter(Boolean)]) if (!/^groupe\b/i.test(a) && !m.has(ckey(a))) m.set(ckey(a), a); return [...m.values()].sort((a, b) => a.localeCompare(b, 'fr')); };
    const fr = iso => iso ? new Date(iso + (iso.length === 10 ? 'T00:00' : '')).toLocaleDateString('fr-FR') : '—';
    const pc = (a, b) => b ? Math.round(a / b * 100) + ' %' : '';
    const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    const lastCycle = () => [...(circ().cycles || [])].sort((a, b) => a.code.localeCompare(b.code)).at(-1);
    let state = {asm: null, filter: null, q: ''};

    // Résultat partiel (seulement le total et les « plus de 12 mois ») : les autres catégories sont regroupées
    const REC = {k: 'rec', l: 'moins de 12 mois', e: '🔹', c: '#5b86b8'};
    const catsOf = r => r.partiel ? [REC, CATS.find(c => c.k === 'p12')] : CATS;
    const val = (r, k) => k === 'rec' ? r.total - (r.counts.p12 || 0) : r.counts[k] ?? null;
    const bar = r => { const tot = r.total || 1;
      return `<div style="display:flex;height:16px;border-radius:5px;overflow:hidden;border:1px solid var(--line,#ddd)">${catsOf(r).map(c => val(r, c.k) ? `<div title="${c.l} : ${val(r, c.k)}" style="width:${val(r, c.k) / tot * 100}%;background:${c.c}"></div>` : '').join('')}</div>`; };

    function home() {
      const A = store().analyses, list = asmList();
      el.innerHTML = `<div class="page-head"><div><h1>🗺️ Territoires S-13</h1><p>Importez le relevé S-13 d’une assemblée (PDF) : chaque territoire est classé selon sa date la plus récente.</p></div>
        <div class="row"><select id="tAsm"><option value="">Assemblée…</option>${list.map(a => `<option>${api.esc(a)}</option>`).join('')}</select>
        <button class="btn primary" id="tImp">Importer un S-13 (PDF)</button><button class="btn" id="tMan" title="S-13 remplis à la main : tapez directement le résultat de l’analyse (nombre de territoires par catégorie)">✍️ Saisir le résultat</button></div></div>
        <div class="card"><div class="table-wrap"><table class="list"><thead><tr><th>Assemblée</th><th>Analyse du</th><th style="text-align:right">Territoires</th>${CATS.map(c => `<th style="text-align:right" title="${c.l}">${c.e}</th>`).join('')}<th style="text-align:right">⚫ %</th><th style="min-width:140px"></th></tr></thead><tbody>
        ${list.map(a => { const r = (A[a] || [])[0];
          return `<tr data-open="${api.esc(a)}" style="cursor:pointer"><td><strong>${api.esc(a)}</strong></td>${r ? `<td>${fr(r.date)}</td><td style="text-align:right">${r.total}</td>${CATS.map(c => `<td style="text-align:right">${r.counts[c.k] ?? '<span class="muted">—</span>'}</td>`).join('')}<td style="text-align:right"><strong>${pc(r.counts.p12, r.total)}</strong></td><td>${bar(r)}</td>`
            : `<td colspan="${CATS.length + 4}" class="muted small">Pas encore analysé</td>`}</tr>`; }).join('') || `<tr><td colspan="${CATS.length + 5}" class="muted">Aucune assemblée : importez d’abord les listes dans l’annuaire ou la circonscription.</td></tr>`}
        </tbody></table></div>
        <p class="small muted" style="margin:8px 0 0">Catégories : ${CATS.map(c => `${c.e} ${c.l}`).join(' · ')} (sans date : ⚫).</p></div>`;
      api.$('#tImp', el).addEventListener('click', () => { const a = api.$('#tAsm', el).value; if (!a) return api.toast('Choisissez d’abord l’assemblée', 'error'); importS13(a); });
      api.$('#tMan', el).addEventListener('click', () => { const a = api.$('#tAsm', el).value; if (!a) return api.toast('Choisissez d’abord l’assemblée', 'error'); saisie(a); });
      for (const tr of api.$$('[data-open]', el)) tr.addEventListener('click', () => { const a = tr.dataset.open; if (!(A[a] || []).length) return importS13(a); state = {asm: a, filter: null, q: ''}; view(); });
    }

    async function importS13(asm) {
      const file = await api.pickFile('.pdf,application/pdf'); if (!file) return;
      if (!/\.pdf$/i.test(file.name)) return api.toast('Choisissez le S-13 au format PDF.', 'error');
      api.toast('Analyse du S-13 en cours…');
      let res;
      try { res = S13.analyse(await App.files.readLayout(file), today()); }
      catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
      if (!res.total) return api.toast('Aucun territoire reconnu : le PDF est peut-être scanné (image). Envoyez-le pour adapter la lecture.', 'error');
      const old = api.docs.list({asm, kind: 's13'}), docId = await api.docs.add(file, {asm, kind: 's13'});
      for (const d of old) await api.docs.remove(d.id);
      const A = store().analyses; (A[asm] ??= []).unshift({id: api.uid(), docId, docName: file.name, imported: new Date().toISOString(), ...res});
      A[asm] = A[asm].slice(0, 6); api.save();
      state = {asm, filter: null, q: ''}; view();
      api.toast(`${res.pages} pages · ${res.total} territoires analysés`);
    }

    /* Résultat saisi à la main (S-13 remplis à la main, analysés sur papier) : nombre de territoires par catégorie.
       Aucune liste de territoires : seuls les totaux sont gardés (report dans le cycle, PDF, évolution). */
    async function saisie(asm) {
      const H = store().analyses[asm] || [], r0 = H[0], c0 = r0?.counts || {}, part0 = !!r0?.partiel;
      const res = await api.modal({title: `✍️ Résultat de l’analyse S-13 — ${asm}`,
        body: `<div class="stack" style="gap:10px">
          <div class="row" style="gap:16px;flex-wrap:wrap">
            <label><input type="radio" name="rMode" value="detail" ${part0 ? '' : 'checked'}> Détail par catégorie (6 cases)</label>
            <label><input type="radio" name="rMode" value="partiel" ${part0 ? 'checked' : ''}> Seulement le total et les non parcourus depuis plus d’un an</label></div>
          <label class="field"><span>Date de l’analyse</span><input type="date" id="rDate" value="${S13Iso(today())}" style="max-width:180px"></label>
          <div id="rDetail" class="stack" style="gap:8px">
            <p class="small muted" style="margin:0">Tapez le nombre de territoires de chaque catégorie, selon la date la plus récente de chaque territoire. Le total se calcule tout seul.</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
            ${CATS.map(c => `<label class="field" style="margin:0"><span><span style="color:${c.c}">${c.e}</span> ${c.l}</span><input type="number" min="0" step="1" inputmode="numeric" data-k="${c.k}" value="${part0 ? '' : c0[c.k] ?? ''}" placeholder="0"></label>`).join('')}
            </div>
            <div style="font-size:1.05rem">Total : <strong id="rTot">0</strong> territoires</div></div>
          <div id="rPart" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
            <label class="field" style="margin:0"><span>Nombre total de territoires</span><input type="number" min="1" step="1" inputmode="numeric" id="rTotal" value="${r0?.total ?? ''}"></label>
            <label class="field" style="margin:0"><span>⚫ Non parcourus depuis plus d’un an</span><input type="number" min="0" step="1" inputmode="numeric" id="rP12" value="${c0.p12 ?? ''}"></label></div></div>`,
        actions: [{label: 'Annuler', value: null}, {label: 'Enregistrer', kind: 'primary', onClick: b => {
          const date = api.$('#rDate', b).value || S13Iso(today()), num = x => Math.max(0, Math.round(+x.value || 0));
          if (date > S13Iso(today())) { api.toast('La date de l’analyse est dans le futur', 'error'); return false; }
          if (api.$('input[name=rMode]:checked', b).value === 'partiel') {
            const total = num(api.$('#rTotal', b)), p12 = num(api.$('#rP12', b));
            if (!total) { api.toast('Indiquez le nombre total de territoires', 'error'); return false; }
            if (p12 > total) { api.toast('Les non parcourus ne peuvent pas dépasser le total', 'error'); return false; }
            return {partiel: true, counts: Object.fromEntries(CATS.map(c => [c.k, c.k === 'p12' ? p12 : null])), total, date};
          }
          const counts = Object.fromEntries(CATS.map(c => [c.k, num(api.$(`[data-k=${c.k}]`, b))]));
          const total = Object.values(counts).reduce((a, x) => a + x, 0);
          if (!total) { api.toast('Indiquez au moins un territoire', 'error'); return false; }
          return {partiel: false, counts, total, date}; }}],
        onMount: b => {
          const upd = () => { api.$('#rTot', b).textContent = CATS.reduce((a, c) => a + (Math.round(+api.$(`[data-k=${c.k}]`, b).value) || 0), 0); };
          const mode = () => { const p = api.$('input[name=rMode]:checked', b).value === 'partiel'; api.$('#rDetail', b).style.display = p ? 'none' : ''; api.$('#rPart', b).style.display = p ? 'grid' : 'none';
            const f = p ? api.$('#rTotal', b) : api.$('[data-k]', b); f.focus(); f.select(); };
          b.addEventListener('input', upd); upd();
          api.$$('input[name=rMode]', b).forEach(x => x.addEventListener('change', mode));
          const chain = list => list.forEach((x, n) => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (list[n + 1] || x).focus(); } }));
          chain(api.$$('[data-k]', b)); chain([api.$('#rTotal', b), api.$('#rP12', b)]);
          mode();
        }});
      if (!res) return;
      const entry = {id: api.uid(), format: 'manuel', partiel: res.partiel, docName: 'Résultat saisi à la main', imported: new Date().toISOString(), pages: 0, total: res.total, counts: res.counts, list: [], warn: [], date: res.date};
      const A = store().analyses; A[asm] ??= [];
      if (A[asm][0] && A[asm][0].format === 'manuel' && A[asm][0].date === entry.date) A[asm][0] = entry; else A[asm].unshift(entry);
      A[asm].sort((a, b) => b.date.localeCompare(a.date)); A[asm] = A[asm].slice(0, 6); api.save();
      state = {asm, filter: null, q: ''}; view();
      api.toast(`Analyse enregistrée : ${res.total} territoires`);
    }

    function view() {
      const asm = state.asm, H = store().analyses[asm] || [], r = H[0];
      if (!r) return home();
      const prev = H[1], cyc = lastCycle(), sum = r.partiel ? r.total : Object.values(r.counts).reduce((a, b) => a + b, 0);
      const rows = r.list.filter(t => (!state.filter || t.cat === state.filter) && (!state.q || api.norm(t.id).includes(api.norm(state.q))));
      el.innerHTML = `<div class="page-head"><div><h1>🗺️ ${api.esc(asm)}</h1><p>Analyse du S-13 au <strong>${fr(r.date)}</strong> · ${r.format === 'manuel' ? 'résultat saisi à la main' : api.esc(r.docName) + ' · ' +  `présentation ${r.format === 'colonnes' ? 'S-13-Z (territoires en colonnes)' : 'en tableau (un territoire par ligne)'}`}</p></div>
        <div class="row"><button class="btn" id="tBack">← Toutes les assemblées</button><button class="btn" id="tNew">Importer un nouveau S-13</button><button class="btn" id="tMan">${r.format === 'manuel' ? '✍️ Modifier le résultat' : '✍️ Saisir le résultat'}</button></div></div>
        <div class="card" style="margin-bottom:14px">
          <div style="font-size:1.05rem">${r.format === 'manuel' ? 'Résultat saisi à la main' : `<strong>${r.pages}</strong> page${r.pages > 1 ? 's' : ''}`} · <strong>${r.total}</strong> territoires
            ${r.partiel ? '<span class="pill">résultat partiel : total et non parcourus depuis plus d’un an</span>' : sum === r.total ? '<span class="pill" style="background:#e3f4ea;color:#1d5a35">✓ total des 6 catégories = nombre de territoires</span>' : `<span class="pill" style="background:#fdecec;color:#8a1f1f">⚠ total des catégories : ${sum}</span>`}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0">
          ${catsOf(r).map(c => { const a = val(r, c.k), z = prev ? val(prev, c.k) : null, d = a !== null && z !== null ? a - z : null;
            return `<button class="card" data-cat="${c.k}" style="text-align:left;padding:8px 10px;cursor:pointer;border:2px solid ${state.filter === c.k ? c.c : 'transparent'};background:#fff">
              <div class="small muted">${c.e} ${c.l}</div><div style="font-size:1.5rem;font-weight:700;color:${c.c}">${a}</div>
              <div class="small">${pc(a, r.total)}${d !== null && d !== 0 ? ` <span class="muted">(${d > 0 ? '+' : ''}${d} vs ${fr(prev.date)})</span>` : ''}</div></button>`; }).join('')}
          </div>${bar(r)}
          ${r.warn.length ? `<div class="notice warn small" style="margin-top:10px">${r.warn.map(api.esc).join('<br>')}</div>` : ''}
          <div class="row" style="margin-top:12px;flex-wrap:wrap">
            ${cyc ? `<button class="btn primary" id="tReport">Reporter dans le cycle ${api.esc(cyc.code)} (Territoires ${r.total} · Non parcourus depuis 1 an ${r.counts.p12})</button>` : ''}
            <button class="btn" id="tPdf">PDF de l’analyse</button>${r.docId ? '<button class="btn" id="tOpen">Ouvrir le S-13</button>' : ''}
            ${r.list.length && r.date !== S13Iso(today()) ? `<button class="btn" id="tToday">Recalculer à la date du jour</button>` : ''}
            <button class="btn" id="tDel" title="Supprimer cette analyse">Supprimer l’analyse</button></div>
        </div>
        ${r.list.length ? `<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><strong>${state.filter ? CATS.find(c => c.k === state.filter).e + ' ' + CATS.find(c => c.k === state.filter).l : 'Tous les territoires'} (${rows.length})</strong>
          <div class="row">${state.filter ? '<button class="btn" id="tAll">Tout afficher</button>' : ''}<input id="tQ" placeholder="Rechercher un n°" value="${api.esc(state.q)}" style="max-width:180px"></div></div>
          <p class="small muted" style="margin:4px 0 8px">Si une date a été mal lue, corrigez-la dans la colonne « Date la plus récente » : la catégorie et les totaux se recalculent.</p>
          <div class="table-wrap" style="max-height:60vh"><table class="list"><thead><tr><th>Territoire</th><th>Page</th><th>Date la plus récente</th><th>Catégorie</th></tr></thead><tbody>
          ${rows.map(t => { const c = CATS.find(x => x.k === t.cat); return `<tr><td><strong>${api.esc(t.id)}</strong></td><td class="small muted">${t.page}</td>
            <td><input type="date" data-fix="${api.esc(t.id)}" value="${t.last}" style="max-width:160px"></td><td><span style="color:${c.c}">${c.e}</span> ${c.l}</td></tr>`; }).join('')}
          </tbody></table></div></div>` : ''}`;
      api.$('#tBack', el).onclick = () => home();
      api.$('#tNew', el).onclick = () => importS13(asm);
      for (const b of api.$$('[data-cat]', el)) b.onclick = () => { state.filter = state.filter === b.dataset.cat ? null : b.dataset.cat; view(); };
      if (api.$('#tAll', el)) api.$('#tAll', el).onclick = () => { state.filter = null; view(); };
      const q = api.$('#tQ', el); if (q) q.oninput = () => { state.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { view(); const n = api.$('#tQ', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
      for (const inp of api.$$('[data-fix]', el)) inp.onchange = () => { const t = r.list.find(x => x.id === inp.dataset.fix); if (!t) return; t.last = inp.value; t.fixed = true; r.counts = S13.recount(r.list, new Date(r.date + 'T00:00')); api.save(); view(); };
      if (api.$('#tReport', el)) api.$('#tReport', el).onclick = () => {
        const c = lastCycle(); if (!c) return; const key = (circ().assemblees || []).find(a => ckey(a) === ckey(asm)) || asm;
        c.valeurs[key] ??= {}; c.valeurs[key].terr = r.total; c.valeurs[key].nonparc = r.counts.p12; api.save();
        api.toast(`Cycle ${c.code} – ${key} : ${r.total} territoires, ${r.counts.p12} non parcourus depuis 1 an`);
      };
      api.$('#tPdf', el).onclick = async () => { try { api.download(`S-13 ${asm} ${r.date}.pdf`, await pdf(asm, r)); } catch (e) { api.toast('PDF impossible : ' + e.message, 'error'); } };
      api.$('#tMan', el).onclick = () => saisie(asm);
      if (api.$('#tOpen', el)) api.$('#tOpen', el).onclick = () => { const win = window.open('about:blank', '_blank');
        api.docs.blob(r.docId).then(b => { if (!b) { win?.close(); return api.toast('S-13 pas encore reçu sur cet appareil : synchronisez puis réessayez.', 'error'); } if (win) win.location = URL.createObjectURL(b); else api.download(r.docName, b); }); };
      if (api.$('#tToday', el)) api.$('#tToday', el).onclick = () => { r.date = S13Iso(today()); r.counts = S13.recount(r.list, today()); api.save(); view(); };
      api.$('#tDel', el).onclick = async () => { if (!(await api.confirm('Supprimer l’analyse', `Supprimer l’analyse du ${fr(r.date)} pour ${asm} ?`, 'Supprimer', true))) return;
        H.shift(); if (!H.length) { delete store().analyses[asm]; for (const d of api.docs.list({asm, kind: 's13'})) await api.docs.remove(d.id); } api.save(); view(); };
    }
    const S13Iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // PDF : synthèse puis, par catégorie (de la plus ancienne à la plus récente), la liste des territoires
    async function pdf(asm, r) {
      const {PDFDocument, StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
      const doc = await PDFDocument.create(); doc.setTitle(`Analyse S-13 ${asm}`); doc.setCreator('Mon Bureau');
      const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
      const W = 595.28, H = 841.89, M = 36, ink = rgb(.1, .1, .12), mute = rgb(.42, .45, .5), blue = rgb(.12, .25, .4);
      const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
      let page, y;
      const newPage = () => { page = doc.addPage([W, H]); y = H - M;
        page.drawText(T(`Mon Bureau${App.circoPied()} · Analyse S-13 · ${asm} · au ${fr(r.date)}`), {x: M, y: 18, size: 7, font: R, color: mute}); };
      const txt = (t, x, yy, o = {}) => page.drawText(T(t), {x, y: yy, size: o.size || 9, font: o.bold ? B : R, color: o.color || ink});
      newPage();
      txt(`Analyse du S-13 — ${asm}`, M, y - 16, {size: 18, bold: true, color: blue}); if (App.circoNom()) txt(App.circoNom(), M, y - 30, {size: 9, color: mute}); y -= App.circoNom() ? 44 : 34;
      txt(r.format === 'manuel' ? `Au ${fr(r.date)} · ${r.total} territoires · résultat saisi à la main` : `Au ${fr(r.date)} · ${r.pages} pages · ${r.total} territoires · fichier « ${r.docName} »`, M, y, {size: 10, color: mute}); y -= 26;
      const PC = catsOf(r), bw = (W - 2 * M - 5 * 8) / 6;
      PC.forEach((c, i) => { const x = M + i * (bw + 8);
        page.drawRectangle({x, y: y - 56, width: bw, height: 56, borderColor: hex(c.c), borderWidth: 1.5, color: rgb(1, 1, 1)});
        page.drawRectangle({x, y: y - 14, width: bw, height: 14, color: hex(c.c)});
        const lab = T(c.l); page.drawText(lab, {x: x + (bw - R.widthOfTextAtSize(lab, 7.5)) / 2, y: y - 10.5, size: 7.5, font: B, color: rgb(1, 1, 1)});
        const v = String(val(r, c.k)); page.drawText(v, {x: x + (bw - B.widthOfTextAtSize(v, 20)) / 2, y: y - 38, size: 20, font: B, color: hex(c.c)});
        const p = pc(val(r, c.k), r.total); page.drawText(T(p), {x: x + (bw - R.widthOfTextAtSize(T(p), 8.5)) / 2, y: y - 51, size: 8.5, font: R, color: mute}); });
      y -= 70;
      let bx = M; for (const c of PC) { const w = r.total ? (W - 2 * M) * val(r, c.k) / r.total : 0; if (w) page.drawRectangle({x: bx, y: y - 12, width: w, height: 12, color: hex(c.c)}); bx += w; }
      y -= 30;
      const sum = r.partiel ? r.total : Object.values(r.counts).reduce((a, b) => a + b, 0);
      txt(r.partiel ? `Résultat partiel : ${r.counts.p12} territoire(s) non parcouru(s) depuis plus d’un an sur ${r.total}.` : sum === r.total ? `Contrôle : total des 6 catégories = ${sum} = nombre de territoires.` : `Attention : total des catégories ${sum} ≠ ${r.total} territoires.`, M, y, {size: 9, color: sum === r.total ? rgb(.11, .45, .25) : rgb(.8, .1, .1)}); y -= 22;
      const ncol = 5, cw = (W - 2 * M) / ncol, lh = 11;
      for (const c of [...CATS].reverse()) {
        const items = r.list.filter(t => t.cat === c.k); if (!items.length) continue;
        if (y < M + 40) newPage();
        page.drawRectangle({x: M, y: y - 3, width: 9, height: 9, color: hex(c.c)});
        txt(`${c.l[0].toUpperCase() + c.l.slice(1)} : ${items.length} territoire${items.length > 1 ? 's' : ''}`, M + 14, y - 2, {size: 11, bold: true}); y -= 16;
        for (let i = 0; i < items.length; i += ncol) {
          if (y < M + 14) newPage();
          items.slice(i, i + ncol).forEach((t, j) => { const short = api.norm(t.id).startsWith(api.norm(asm) + ' ') ? t.id.slice(asm.length).trim() : t.id; const s = `${short}  ${t.last ? fr(t.last) : 'sans date'}`; let s1 = T(s); while (s1.length > 1 && R.widthOfTextAtSize(s1, 7.5) > cw - 4) s1 = s1.slice(0, -2) + '…'; page.drawText(s1, {x: M + j * cw, y, size: 7.5, font: R, color: ink}); });
          y -= lh;
        }
        y -= 10;
      }
      return new Blob([await doc.save()], {type: 'application/pdf'});
    }

    state.asm ? view() : home();
  }
});
