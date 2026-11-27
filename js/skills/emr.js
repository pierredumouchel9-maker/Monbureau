'use strict';
/* École du ministère du Royaume (EMR) : une session pour les anciens et/ou une session pour les assistants.
   Les programmes officiels (Word) sont importés par l'utilisateur et gardés chiffrés ; le code n'en contient rien.
   Formateurs : anciens uniquement (codes A, RC, An du programme) ; parties communes aux deux sessions = mêmes formateurs.
   Sorties : programme Word complété (même document, noms remplis), lettres d'attribution PDF avec l'heure de répétition Zoom. */
App.fields.register('emr', 'École du ministère du Royaume', [
  {key: 'emr_annee', label: 'Année de l’école'}, {key: 'emr_salle', label: 'Salle du Royaume'}, {key: 'emr_lieu', label: 'Lieu (« salle du Royaume de … »)'}, {key: 'emr_adresse', label: 'Adresse de la salle'},
  {key: 'emr_dates', label: 'Dates des sessions'}, {key: 'emr_date_anciens', label: 'Date — session des anciens'}, {key: 'emr_date_assistants', label: 'Date — session des assistants'},
  {key: 'emr_parties', label: 'Parties attribuées (une ligne par partie)'}, {key: 'emr_repet_date', label: 'Date des répétitions'}, {key: 'emr_repet_heure', label: 'Heure de répétition (formateur)'},
  {key: 'emr_zoom', label: 'N° Zoom'}, {key: 'emr_code', label: 'Code secret Zoom'}
], ({emr}) => emr ? App.emr.values(emr.E, emr.f) : {});

App.emr = (() => {
  const api = App.api;
  const store = () => api.moduleData('emr', {ecoles: []});
  const PUBLIC = {anciens: 'École des anciens', assistants: 'École des assistants'};
  const N = s => api.norm(String(s || '')).replace(/[«»"“”'’.:,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const longDate = iso => { if (!iso) return ''; const t = new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}); return t; };
  const hFmt = h => { const m = /(\d{1,2})\s*[.:h]\s*(\d{2})/.exec(String(h || '')); return m ? `${+m[1]}h${m[2]}` : String(h || ''); };
  const toMin = hm => { const m = /(\d{1,2})\s*[h:.]\s*(\d{0,2})/.exec(String(hm || '')); return m ? +m[1] * 60 + (+m[2] || 0) : null; };
  const fmtH = m => m == null ? '' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  const nomOf = p => [p.prenom, (p.nom || '').toUpperCase()].filter(Boolean).join(' ');
  const keyOf = p => N(`${p.nom} ${p.prenom}`);
  const prof = () => api.data.settings.profil || {};
  const isMe = p => { const m = prof(); return !!(m.nom && N(p.nom) === N(m.nom) && (!m.prenom || N(p.prenom) === N(m.prenom))); };
  const moi = () => { const m = prof(), code = api.data.settings.circo?.code || ''; return m.nom ? {nom: m.nom.toUpperCase(), prenom: m.prenom || '', asm: code ? `RC ${code}` : 'Responsable de circonscription'} : null; };
  const isA = (S, p) => !!(S.formateurA && p.nom && [N(`${p.prenom} ${p.nom}`), N(`${p.nom} ${p.prenom}`)].includes(N(S.formateurA)));

  /* ---------- Lecture du programme Word ---------- */
  async function parseDocx(file) {
    const z = await App.files.unzip(await file.arrayBuffer()), W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const doc = new DOMParser().parseFromString(await z.text('word/document.xml'), 'application/xml');
    const txt = n => [...n.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
    const all = txt(doc), pub = /assistants/i.test(all.slice(0, 200)) ? 'assistants' : /anciens/i.test(all.slice(0, 200)) ? 'anciens' : '';
    const an = (/Royaume\s*(\d{4})/.exec(all) || [])[1] || '';
    const parts = []; let groupe = '', partie = 1, slot = 0;
    for (const tr of doc.getElementsByTagNameNS(W, 'tr')) {
      const cells = [...tr.getElementsByTagNameNS(W, 'tc')].map(txt);
      const line = cells.join(' | ');
      if (/^Heure\b/i.test(cells[0] || '') || cells.some(c => /^Partie\s*\d/i.test(c) && cells.includes('Durée'))) { const m = /Partie\s*(\d)/i.exec(line); if (m) partie = +m[1]; continue; }
      const ex = cells.find(c => /^Exposé en/i.test(c)); if (ex) { groupe = ex.replace(/^Exposé en [^:]*:\s*/i, '').trim(); parts.push({type: 'groupe', titre: ex, partie}); continue; }
      const iH = cells.findIndex(c => /^\d{1,2}[.:h]\d{2}$/.test(c)); if (iH < 0) continue;
      const n = /^\d{1,2}$/.test(cells[iH - 1] || '') ? cells[iH - 1] : '';
      if (!n) groupe = '';
      const titre = cells[iH + 1] || '', duree = +((/(\d+)\s*min/.exec(cells[iH + 2] || '') || [])[1] || 0), code = n ? (cells[iH + 3] || '') : '';
      const hasName = cells.some(c => /\[Name\]/i.test(c));
      parts.push({id: api.uid(), type: n ? 'sujet' : /pause/i.test(titre) ? 'pause' : 'cantique', n, heure: cells[iH], titre, duree, code, groupe: n ? groupe : '', partie, slot: hasName ? slot++ : null, nom: '', prenom: '', asm: ''});
    }
    return {pub, annee: an, parts};
  }
  // Programme Word complété : les « [Name] » remplacés par les formateurs, le lieu et la date de la session
  async function filledDocx(E, S) {
    const blob = await api.docs.blob(S.docId); if (!blob) throw new Error('Le programme Word de cette session n’est plus disponible : importez-le de nouveau.');
    const z = await App.files.unzip(await blob.arrayBuffer()), x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const names = []; for (const p of S.parts) if (p.slot !== null && p.slot !== undefined) names[p.slot] = p.nom ? nomOf(p) : '';
    const runRe = tag => new RegExp(`<w:r\\b[^>]*>(?:(?!</w:r>)[\\s\\S])*?\\[${tag}\\](?:(?!</w:r>)[\\s\\S])*?</w:r>`, 'g');
    const put = (run, tag, v) => v ? run.replace(/<w:color w:val="FF0000"\/>/, '').replace(`[${tag}]`, x(v)) : run;
    let k = 0, xmlS = await z.text('word/document.xml');
    xmlS = xmlS.replace(runRe('Name'), run => put(run, 'Name', names[k++]));
    xmlS = xmlS.replace(runRe('Class location'), run => put(run, 'Class location', [E.salle, E.adresse].filter(Boolean).join(' — ')));
    xmlS = xmlS.replace(runRe('Class date'), run => put(run, 'Class date', longDate(S.date)));
    const entries = [];
    for (const name of z.names) entries.push({name, bytes: name === 'word/document.xml' ? new TextEncoder().encode(xmlS) : await z.bytes(name)});
    return App.files.zip(entries);
  }

  /* ---------- Formateurs, parties communes, répétitions ---------- */
  const sessions = E => (E.sessions || []).slice().sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.pub.localeCompare(b.pub));
  const sujets = S => (S.parts || []).filter(p => p.type === 'sujet');
  // partie de l'autre session qui porte le même titre (parties communes)
  const commune = (E, S, p) => { for (const o of E.sessions || []) if (o !== S) { const q = sujets(o).find(x => N(x.titre) === N(p.titre) && N(x.groupe) === N(p.groupe)); if (q) return q; } return null; };
  // formateurs à qui écrire (ni le responsable de circonscription, ni le formateur envoyé par la filiale)
  function formateurs(E) {
    const map = new Map();
    for (const S of sessions(E)) for (const p of sujets(S)) {
      if (!p.nom || isMe(p) || isA(S, p)) continue;
      const k = keyOf(p); if (!map.has(k)) map.set(k, {key: k, nom: p.nom, prenom: p.prenom, asm: p.asm, parts: []});
      map.get(k).parts.push({S, p});
    }
    return [...map.values()];
  }
  // sujets distincts d'un formateur (une partie commune présentée aux deux sessions = un seul sujet à répéter)
  const nbSujets = f => new Set(f.parts.map(({p}) => N(p.groupe + ' ' + p.titre))).size;
  function planRepet(E) {
    let t = toMin(E.repetDebut); if (t === null) return 0;
    const pas = Number(E.repetPas) || 10; E.repet ??= {};
    const L = formateurs(E); for (const f of L) { E.repet[f.key] = fmtH(t); t += pas * nbSujets(f); }
    return L.length;
  }

  /* ---------- Lettres ---------- */
  const NEUTRE = '<p style="text-align:right">{{exp_entete}}</p><p style="text-align:right">Le {{date_jour}}</p><p>Objet : École du ministère du Royaume {{emr_annee}}</p><p>À : F. {{prenom}} {{nom}}</p><p><br></p><p>Cher {{prenom}},</p>'
    + '<p>L’École du ministère du Royaume se tiendra à la {{emr_lieu}}, {{emr_adresse}} : {{emr_dates}}.</p><p>Je te remercie de bien vouloir présenter la ou les parties suivantes :</p><p>• {{emr_parties}}</p>'
    + '<p>Une répétition par Zoom est prévue le {{emr_repet_date}} à {{emr_repet_heure}}.</p><p>• N° Zoom : {{emr_zoom}}</p><p>• Code secret : {{emr_code}}</p>'
    + '<p>Merci de me confirmer que tu acceptes cette attribution.</p><p><br></p><p>Ton frère dans la foi,</p><p>{{exp_prenom}} {{exp_nom}}</p>';
  const modele = E => E.lettre || NEUTRE;
  // « Renforcez votre amour pour Jésus » (titre d'exposé + partie) ; une partie commune présentée aux deux sessions = une seule ligne
  const sujetTxt = p => !p.groupe ? `« ${p.titre} »` : /[\p{L}]$/u.test(p.groupe.replace(/[\s\u00a0]+$/, '')) ? `« ${p.groupe} ${p.titre} »` : `${p.groupe} — « ${p.titre} »`;
  const quand = (S, p) => `${S.pub === 'anciens' ? 'école des anciens' : 'école des assistants'}${S.date ? ' du ' + longDate(S.date) : ''} à ${hFmt(p.heure)}`;
  const lignes = f => { const out = []; for (const {S, p} of f.parts) { const k = N(p.groupe + ' ' + p.titre), o = out.find(x => x.k === k); if (o) o.q.push(quand(S, p)); else out.push({k, p, q: [quand(S, p)]}); }
    return out.map(x => { const t = `${sujetTxt(x.p)} (${x.p.duree} min) — ${x.q.join(' et ')}`; return t; }); };
  function values(E, f) {
    const SS = sessions(E), d = pub => SS.find(s => s.pub === pub)?.date;
    return {emr_annee: E.annee || '', emr_salle: E.salle || '', emr_lieu: !E.salle ? '' : /salle/i.test(E.salle) ? E.salle.replace(/^Salle/, 'salle') : `salle du Royaume de ${E.salle}`, emr_adresse: E.adresse || '',
      emr_dates: SS.filter(s => s.date).map(s => `${longDate(s.date)} (${s.pub === 'anciens' ? 'anciens' : 'assistants'})`).join(' et '),
      emr_date_anciens: longDate(d('anciens')), emr_date_assistants: longDate(d('assistants')),
      emr_parties: f ? lignes(f).join('\n') : '', emr_repet_date: longDate(E.repetDate),
      emr_repet_heure: f ? (E.repet || {})[f.key] || '' : '', emr_zoom: E.zoom || '', emr_code: E.code || ''};
  }
  // le paragraphe qui contient {{emr_parties}} est répété, une fois par partie attribuée
  const expandParts = (html, f, E) => html.replace(/<p([^>]*)>((?:(?!<\/p>)[\s\S])*?)\{\{\s*emr_parties\s*\}\}((?:(?!<\/p>)[\s\S])*?)<\/p>/,
    (m, at, a, b) => lignes(f).map(t => `<p${at}>${a}${api.esc(t)}${b}</p>`).join(''));
  async function lettreBytes(E, f) {
    const X = App.reunionPP, base = modele(E).replace(/<!--mf1-->/, '').replace(/ ?<img src="data:image[^>]+>/, '');
    const html = App.pdf.merge(X.styleLetter(expandParts(base, f, E), E.presentation), App.fields.values({person: {prenom: f.prenom, nom: f.nom, assemblee: f.asm, civilite: 'Frère'}, emr: {E, f}}));
    return X.onePage(html, `École du ministère du Royaume — ${nomOf(f)}`);
  }
  const lettreNom = (E, f) => App.pdf.fileName(`EMR ${E.annee || ''} - ${f.nom} ${f.prenom}`) + '.pdf';
  async function editLettre(E, redraw) {
    const chips = h => h.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => `<span data-champ="${k}" contenteditable="false" style="background:#e7f0fd;color:#1d4f91;border-radius:4px;padding:0 4px">${api.esc(App.fields.label(k))}</span>`);
    const unchips = el => { const c = el.cloneNode(true); for (const x of c.querySelectorAll('[data-champ]')) x.replaceWith(`{{${x.dataset.champ}}}`); return c.innerHTML; };
    const flds = ['emr', 'personne', 'expediteur', 'dates'].flatMap(g => (App.fields.groups.find(x => x.id === g)?.fields || []).filter(f => g !== 'personne' || ['prenom', 'nom', 'assemblee'].includes(f.key)));
    const r = await api.modal({title: 'Lettre d’attribution aux formateurs', wide: true, body: `<div class="stack">
      <div class="row small" style="flex-wrap:wrap"><button class="btn" data-cmd="bold"><b>G</b></button><button class="btn" data-cmd="italic"><i>I</i></button><button class="btn" data-cmd="underline"><u>S</u></button>
        <button class="btn" data-cmd="justifyLeft">⟸</button><button class="btn" data-cmd="justifyCenter">≡</button><button class="btn" data-cmd="justifyRight">⟹</button><button class="btn" data-uni>Aa ✕ Uniformiser</button>
        <select id="eF" style="width:auto"><option value="">+ Insérer un champ…</option>${flds.map(f => `<option value="${f.key}">${api.esc(f.label)}</option>`).join('')}</select></div>
      <div id="eEd" contenteditable="true" style="border:1px solid var(--line);border-radius:8px;padding:18px 22px;min-height:380px;max-height:60vh;overflow:auto;background:#fff;color:#111;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45">${chips(modele(E).replace(/<!--mf1-->/, ''))}</div>
      <p class="small muted" style="margin:0">Les étiquettes bleues sont remplacées pour chaque formateur. Le paragraphe qui contient « Parties attribuées » est répété : une ligne par partie (session, date, heure, sujet, durée).</p></div>`,
      actions: [{label: 'Annuler', value: null}, ...(E.lettre ? [{label: 'Modèle neutre', value: 'reset'}] : []), {label: 'Enregistrer', kind: 'primary', onClick: b => unchips(api.$('#eEd', b))}],
      onMount: b => {
        b.querySelectorAll('[data-cmd]').forEach(x => x.addEventListener('mousedown', e => { e.preventDefault(); document.execCommand(x.dataset.cmd); }));
        b.querySelectorAll('[data-uni]').forEach(x => x.addEventListener('mousedown', e => { e.preventDefault(); window.uniformiser(api.$('#eEd', b)); }));
        api.$('#eF', b).addEventListener('change', e => { const k = e.target.value; if (!k) return; api.$('#eEd', b).focus(); document.execCommand('insertHTML', false, chips(`{{${k}}}`) + '&nbsp;'); e.target.value = ''; });
      }});
    if (r === null || r === undefined) return;
    if (r === 'reset') delete E.lettre; else E.lettre = r;
    api.save(); redraw();
  }
  async function importLettre(E) {
    const file = await api.pickFile('.docx'); if (!file) return false;
    try { E.lettre = await App.files.docxToHtml(file); api.save(); api.toast('Lettre importée : placez les champs (formateur, parties, répétition…) avec « Modifier la lettre »'); return true; }
    catch (e) { api.toast('Lecture impossible : ' + e.message, 'error'); return false; }
  }
  return {store, PUBLIC, parseDocx, filledDocx, sessions, sujets, commune, formateurs, nbSujets, planRepet, values, lettreBytes, lettreNom, editLettre, importLettre, nomOf, keyOf, isMe, isA, moi, hFmt, longDate, N};
})();

App.registerSkill({
  id: 'emr', name: 'École du ministère du Royaume', icon: '📖', group: 'metier', order: 15, version: '1.0',
  description: 'EMR des anciens et des assistants : formateurs (anciens), programmes Word complétés, lettres et répétitions Zoom.',
  mount(el, api) {
    const X = App.emr, D = X.store(), st = App.emrState ??= {id: null};
    const draw = () => this.mount(el, api), save = () => api.save();
    const E = D.ecoles.find(e => e.id === st.id) || D.ecoles.at(-1); if (E) st.id = E.id;
    const head = `<div class="page-head"><div><h1>📖 École du ministère du Royaume</h1><p>Sessions des anciens et des assistants : formateurs, programmes complétés, lettres d’attribution et répétitions Zoom.</p></div></div>`;
    const newE = from => { const an = String(new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear());
      const e = {id: api.uid(), annee: an, salle: from?.salle || '', adresse: from?.adresse || '', zoom: from?.zoom || '', code: '', repetDate: '', repetDebut: '', repetPas: from?.repetPas || 10, lier: true,
        presentation: from?.presentation || 'officielle', lettre: from?.lettre, sessions: [], repet: {}, retours: {}};
      D.ecoles.push(e); st.id = e.id; save(); return e; };
    const importProg = async (e, pubWanted) => {
      const file = await api.pickFile('.docx'); if (!file) return;
      let r; try { r = await X.parseDocx(file); } catch (err) { return api.toast('Lecture impossible : ' + err.message, 'error'); }
      if (!r.parts.some(p => p.type === 'sujet')) return api.toast('Ce document ne ressemble pas à un programme de l’École (tableau Heure / Durée / Code / Orateur introuvable).', 'error');
      const pub = pubWanted || r.pub || 'anciens';
      let S = e.sessions.find(s => s.pub === pub);
      const old = S ? Object.fromEntries(X.sujets(S).filter(p => p.nom).map(p => [X.N(p.groupe + ' ' + p.titre), p])) : {};
      if (S?.docId) { try { await api.docs.remove(S.docId); } catch (err) { console.warn(err); } }
      const docId = await api.docs.add(file, {module: 'emr', kind: 'emr-programme'});
      if (!S) { S = {id: api.uid(), pub, date: '', formateurA: ''}; e.sessions.push(S); }
      Object.assign(S, {docId, docName: file.name, parts: r.parts});
      for (const p of X.sujets(S)) { const o = old[X.N(p.groupe + ' ' + p.titre)]; if (o) Object.assign(p, {nom: o.nom, prenom: o.prenom, asm: o.asm}); }
      if (r.annee) e.annee = r.annee;
      // parties communes déjà attribuées dans l'autre session : mêmes formateurs
      if (e.lier) for (const p of X.sujets(S)) if (!p.nom) { const q = X.commune(e, S, p); if (q?.nom) Object.assign(p, {nom: q.nom, prenom: q.prenom, asm: q.asm}); }
      save(); api.toast(`${X.PUBLIC[pub]} : ${X.sujets(S).length} sujets lus dans « ${file.name} »`); draw();
      api.toast('Le programme est gardé, chiffré, dans l’application : vous pouvez supprimer le fichier de votre ordinateur si vous le souhaitez.');
    };
    if (!E) {
      el.innerHTML = `${head}<div class="card stack" style="max-width:720px"><strong>Commencer</strong>
        <p class="small muted" style="margin:0">Importez le programme Word de chaque session (« Emploi du temps pour les formateurs ») : les sujets, horaires, durées et codes formateurs (A, RC, An) sont repris. Vous choisissez ensuite les formateurs parmi les anciens de l’annuaire ; l’application remplit le programme Word et prépare les lettres d’attribution avec les répétitions Zoom.</p>
        <div class="row"><button class="btn primary" id="eImp">Importer un programme (Word)…</button><button class="btn" id="eNew">École vide</button></div></div>`;
      api.$('#eImp', el).onclick = async () => { const e = newE(); await importProg(e); if (!e.sessions.length) { D.ecoles.splice(D.ecoles.indexOf(e), 1); save(); draw(); } };
      api.$('#eNew', el).onclick = () => { newE(); draw(); };
      return;
    }
    E.sessions ??= []; E.repet ??= {}; E.retours ??= {};
    const persons = api.data.persons, me = X.moi();
    const anciens = persons.filter(p => p.fonction === 'Ancien' && p.nom).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
    const ancienOf = p => anciens.find(a => X.keyOf(a) === X.keyOf(p));
    const warn = (S, p) => p.nom && !X.isMe(p) && !X.isA(S, p) && anciens.length && !ancienOf(p);
    const SS = X.sessions(E), F = X.formateurs(E);
    const codeTip = {'A/RC*': 'Formateur A (envoyé par la filiale), sinon le responsable de circonscription', 'RC/An#': 'Responsable de circonscription si la filiale a envoyé un formateur, sinon un ancien', An: 'Un ancien'};
    const orateurVal = p => [(p.nom || '').toUpperCase(), p.prenom].filter(Boolean).join(' ');
    const sessCard = S => {
      const n = X.sujets(S), faits = n.filter(p => p.nom).length;
      return `<div class="card stack" data-s="${S.id}" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><div><strong style="font-size:1.1rem">${X.PUBLIC[S.pub]}</strong> <span class="pill">${faits}/${n.length} formateurs</span>
          <div class="small muted">${api.esc(S.docName || '')}</div></div>
          <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" data-reimp>Réimporter le programme…</button><button class="btn primary" data-docx>Programme complété (Word)</button><button class="btn ghost" data-sdel title="Retirer cette session">🗑</button></div></div>
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:end">
          <label class="field" style="margin:0"><span>Date de la session</span><input type="date" data-sf="date" value="${S.date || ''}"></label>
          <label class="field" style="margin:0;flex:1;min-width:240px"><span>Formateur A envoyé par la filiale (s’il y en a un)</span><input type="text" data-sf="formateurA" value="${api.esc(S.formateurA || '')}" placeholder="Prénom NOM — laisser vide sinon"></label>
          <button class="btn" data-auto title="Remplit les codes A/RC* et RC/An# selon qu’un formateur A a été envoyé ou non">Appliquer les codes A / RC</button></div>
        <div class="table-wrap"><table class="list"><thead><tr><th>Heure</th><th>N°</th><th>Sujet</th><th style="text-align:right">Durée</th><th>Code</th><th>Formateur</th></tr></thead><tbody>
        ${S.parts.map((p, i) => p.type === 'groupe' ? `<tr><td></td><td></td><td colspan="4"><strong>${api.esc(p.titre)}</strong></td></tr>`
          : p.type !== 'sujet' ? `<tr class="muted"><td>${X.hFmt(p.heure)}</td><td></td><td colspan="2"${p.type === 'pause' ? ' style="font-weight:600"' : ''}>${api.esc(p.titre)} · ${p.duree} min</td><td></td><td></td></tr>`
          : `<tr data-i="${i}"><td>${X.hFmt(p.heure)}</td><td>${p.n}</td><td style="${p.groupe ? 'padding-left:22px' : ''}">${api.esc(p.titre)}${X.commune(E, S, p) ? ' <span class="pill" title="Partie commune aux deux sessions" style="background:#eef4fb">commune</span>' : ''}</td>
            <td style="text-align:right;white-space:nowrap">${p.duree} min</td><td title="${api.esc(codeTip[p.code] || '')}"><span class="pill">${api.esc(p.code)}</span></td>
            <td><input type="text" data-o list="ePers" value="${api.esc(orateurVal(p))}" placeholder="${p.code === 'An' ? 'Ancien : NOM Prénom' : 'NOM Prénom'}" style="min-width:170px${warn(S, p) ? ';border-color:#c0392b' : ''}">${warn(S, p) ? '<div class="small" style="color:#c0392b">⚠ pas ancien dans l’annuaire</div>' : p.asm ? `<div class="small muted">${api.esc(p.asm)}</div>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    };
    el.innerHTML = `${head}
      <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <select id="eSel" style="width:auto;font-weight:600">${D.ecoles.map(e => `<option value="${e.id}" ${e.id === E.id ? 'selected' : ''}>École ${api.esc(e.annee || '')}</option>`).join('')}</select>
        <button class="btn" id="eNew">+ Nouvelle école</button><button class="btn" id="eImp">Importer un programme (Word)…</button>
        <span style="flex:1"></span><button class="btn primary" id="eLet">Lettres aux formateurs (ZIP)</button></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;align-items:start;margin-bottom:14px">
        <div class="card stack"><strong>École ${api.esc(E.annee || '')}</strong>
          <div class="form-grid">
            <label class="field"><span>Année</span><input type="text" data-ef="annee" value="${api.esc(E.annee || '')}"></label>
            <label class="field"><span>Salle du Royaume</span><input type="text" data-ef="salle" value="${api.esc(E.salle || '')}"></label>
            <label class="field wide"><span>Adresse</span><input type="text" data-ef="adresse" value="${api.esc(E.adresse || '')}"></label></div>
          <label class="row small"><input type="checkbox" id="eLier" ${E.lier !== false ? 'checked' : ''}> Mêmes formateurs pour les parties communes aux deux sessions</label></div>
        <div class="card stack"><strong>Répétitions par Zoom</strong>
          <div class="form-grid">
            <label class="field"><span>Date des répétitions</span><input type="date" data-ef="repetDate" value="${E.repetDate || ''}"></label>
            <label class="field"><span>Heure de la 1re répétition</span><input type="time" data-ef="repetDebut" value="${E.repetDebut || ''}"></label>
            <label class="field"><span>Durée par sujet (min)</span><input type="number" min="5" step="5" data-ef="repetPas" value="${E.repetPas || 10}"></label>
            <label class="field"><span>N° Zoom</span><input type="text" data-ef="zoom" value="${api.esc(E.zoom || '')}"></label>
            <label class="field"><span>Code secret</span><input type="text" data-ef="code" value="${api.esc(E.code || '')}"></label></div>
          <p class="small muted" style="margin:0">Un créneau par formateur, dans l’ordre du programme : la durée par sujet × le nombre de sujets différents (une partie commune présentée aux deux sessions ne compte qu’une fois). Vous n’avez pas de créneau, ni le formateur A.</p></div></div>
      ${SS.length ? '' : '<div class="notice" style="margin-bottom:14px">Aucune session : importez le programme Word de l’école des anciens et/ou de l’école des assistants.</div>'}
      ${SS.map(sessCard).join('')}
      <datalist id="ePers">${me ? `<option value="${api.esc(me.nom + ' ' + me.prenom)}">Responsable de circonscription (${api.esc(me.asm)})</option>` : ''}${anciens.filter(p => !me || X.keyOf(p) !== X.keyOf(me)).map(p => `<option value="${api.esc((p.nom || '').toUpperCase() + ' ' + (p.prenom || ''))}">${api.esc(p.assemblee || '')}</option>`).join('')}</datalist>
      <div class="card stack"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><strong>Formateurs et lettres d’attribution (${F.length})</strong>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" id="eCalc">↻ Calculer les horaires de répétition</button>
          <select id="ePres" style="width:auto">${Object.entries(App.reunionPP.PRESENTATIONS).map(([k, v]) => `<option value="${k}" ${k === (E.presentation || 'officielle') ? 'selected' : ''}>Présentation : ${api.esc(v.label || k)}</option>`).join('')}</select>
          <button class="btn" id="eEdit">Modifier la lettre</button><button class="btn" id="eImpL">Importer ma lettre (Word)…</button></div></div>
        ${F.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Formateur</th><th>Sujets</th><th>Répétition</th><th>Retours</th><th></th></tr></thead><tbody>
          ${F.map((f, i) => `<tr data-f="${i}"><td><strong>${api.esc(X.nomOf(f))}</strong><div class="small muted">${api.esc(f.asm || '')}</div></td>
            <td class="small">${f.parts.map(({S, p}) => `${S.pub === 'anciens' ? 'Anc.' : 'Ass.'} ${X.hFmt(p.heure)} · ${api.esc(p.titre)} (${p.duree} min)`).join('<br>')}</td>
            <td><input type="text" data-rep value="${api.esc(E.repet[f.key] || '')}" placeholder="ex. 19h10" style="width:90px"></td>
            <td><label class="row small" style="white-space:nowrap"><input type="checkbox" data-ret ${E.retours[f.key] ? 'checked' : ''}> ${E.retours[f.key] ? 'Accepte' : 'En attente'}</label></td>
            <td><button class="btn" data-pdf>Lettre PDF</button></td></tr>`).join('')}</tbody></table></div>
          <div class="small muted">${F.filter(f => E.retours[f.key]).length}/${F.length} formateurs ont accepté.</div>` : '<p class="small muted" style="margin:0">Les formateurs apparaissent ici dès qu’ils sont attribués dans les programmes (sauf vous et le formateur A).</p>'}</div>`;

    // ---- École et sessions ----
    api.$('#eSel', el).onchange = e => { st.id = e.target.value; draw(); };
    api.$('#eNew', el).onclick = () => { newE(E); draw(); };
    api.$('#eImp', el).onclick = () => importProg(E);
    el.querySelectorAll('[data-ef]').forEach(i => i.addEventListener('change', () => { E[i.dataset.ef] = i.value.trim(); save(); if (['annee'].includes(i.dataset.ef)) draw(); }));
    api.$('#eLier', el).onchange = e => { E.lier = e.target.checked; save(); };
    const setOrateur = (S, p, v) => {
      const w = v.trim().split(/\s+/).filter(Boolean), up = w.filter(x => x === x.toUpperCase() && /\p{L}/u.test(x));
      const nom = (up.length ? up.join(' ') : w.slice(-1).join(' ')).toUpperCase(), prenom = w.filter(x => up.length ? !up.includes(x) : x !== w.at(-1)).join(' ');
      const a = ancienOf({nom, prenom}), m = me && X.N(nom) === X.N(me.nom) ? me : null;
      const prev = {nom: p.nom, prenom: p.prenom};
      Object.assign(p, v.trim() ? {nom, prenom, asm: a?.assemblee || m?.asm || ''} : {nom: '', prenom: '', asm: ''});
      // partie commune : même formateur dans l'autre session (si elle était vide ou avait le même formateur)
      if (E.lier !== false) { const q = X.commune(E, S, p); if (q && (!q.nom || X.N(q.nom + q.prenom) === X.N(prev.nom + prev.prenom))) Object.assign(q, {nom: p.nom, prenom: p.prenom, asm: p.asm}); }
    };
    for (const card of el.querySelectorAll('[data-s]')) {
      const S = E.sessions.find(s => s.id === card.dataset.s);
      card.querySelectorAll('[data-sf]').forEach(i => i.addEventListener('change', () => { S[i.dataset.sf] = i.value.trim(); save(); draw(); }));
      card.querySelectorAll('[data-o]').forEach(i => i.addEventListener('change', () => { setOrateur(S, S.parts[+i.closest('tr').dataset.i], i.value); save(); draw(); }));
      api.$('[data-reimp]', card).onclick = () => importProg(E, S.pub);
      api.$('[data-auto]', card).onclick = () => {
        let n = 0;
        for (const p of X.sujets(S)) {
          const who = p.code === 'A/RC*' ? (S.formateurA ? 'A' : 'RC') : p.code === 'RC/An#' ? (S.formateurA ? 'RC' : '') : '';
          if (who === 'RC' && me) { setOrateur(S, p, `${me.nom} ${me.prenom}`); n++; }
          else if (who === 'A') { const w = S.formateurA.trim().split(/\s+/); Object.assign(p, {prenom: w.slice(0, -1).join(' ') || '', nom: (w.at(-1) || '').toUpperCase(), asm: 'Filiale'}); n++; }
          else if (p.code === 'RC/An#' && !S.formateurA && p.nom && X.isMe(p)) { Object.assign(p, {nom: '', prenom: '', asm: ''}); }
        }
        if (!me && X.sujets(S).some(p => p.code === 'A/RC*' && !S.formateurA)) api.toast('Renseignez votre nom dans Paramètres › Profil pour être placé sur les parties « RC ».', 'error');
        save(); draw(); api.toast(`${n} partie(s) attribuée(s) selon les codes`);
      };
      api.$('[data-sdel]', card).onclick = async () => {
        if (!await api.confirm('Retirer la session', `Retirer ${X.PUBLIC[S.pub].toLowerCase()} et ses formateurs ?`, 'Retirer', true)) return;
        if (S.docId) { try { await api.docs.remove(S.docId); } catch (err) { console.warn(err); } }
        E.sessions.splice(E.sessions.indexOf(S), 1); save(); draw(); };
      api.$('[data-docx]', card).onclick = async () => {
        const vides = X.sujets(S).filter(p => p.slot !== null && !p.nom).length;
        if (vides && !await api.confirm('Programme incomplet', `${vides} partie(s) sans formateur : « [Name] » restera écrit en rouge. Produire quand même ?`, 'Produire')) return;
        try { api.download(App.pdf.fileName(`EMR ${E.annee || ''} ${X.PUBLIC[S.pub]} - programme formateurs`) + '.docx', await X.filledDocx(E, S), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); }
        catch (err) { console.error(err); api.toast(err.message, 'error'); } };
    }
    // ---- Formateurs, répétitions, lettres ----
    api.$('#eCalc', el).onclick = () => {
      if (!E.repetDebut) return api.toast('Indiquez d’abord l’heure de la 1re répétition', 'error');
      const n = X.planRepet(E); save(); draw(); api.toast(`${n} créneau(x) de répétition calculé(s)`); };
    for (const tr of el.querySelectorAll('[data-f]')) {
      const f = F[+tr.dataset.f];
      api.$('[data-rep]', tr).onchange = e => { E.repet[f.key] = e.target.value.trim(); save(); };
      api.$('[data-ret]', tr).onchange = e => { if (e.target.checked) E.retours[f.key] = true; else delete E.retours[f.key]; save(); draw(); };
      api.$('[data-pdf]', tr).onclick = async () => { try { api.download(X.lettreNom(E, f), new Blob([await X.lettreBytes(E, f)], {type: 'application/pdf'})); } catch (err) { console.error(err); api.toast('Erreur PDF : ' + err.message, 'error'); } };
    }
    api.$('#ePres', el).onchange = e => { E.presentation = e.target.value; save(); };
    api.$('#eEdit', el).onclick = () => X.editLettre(E, draw);
    api.$('#eImpL', el).onclick = async () => { if (await X.importLettre(E)) draw(); };
    api.$('#eLet', el).onclick = async () => {
      if (!F.length) return api.toast('Aucun formateur à qui écrire : attribuez d’abord les parties.', 'error');
      const nA = SS.flatMap(S => X.sujets(S).filter(p => warn(S, p))).length;
      if (nA && !await api.confirm('Formateurs à vérifier', `${nA} partie(s) ont un formateur qui n’est pas ancien dans l’annuaire (signalé ⚠). Produire quand même les lettres ?`, 'Produire')) return;
      const sansRep = F.filter(f => !E.repet[f.key]).length;
      if (sansRep && !await api.confirm('Répétitions', `${sansRep} formateur(s) n’ont pas d’heure de répétition. Produire quand même ?`, 'Produire')) return;
      try { const entries = []; for (const f of F) entries.push({name: X.lettreNom(E, f), bytes: new Uint8Array(await X.lettreBytes(E, f))});
        api.download(App.pdf.fileName(`EMR ${E.annee || ''} - lettres formateurs`) + '.zip', App.files.zip(entries)); api.toast(`${entries.length} lettre(s) dans le ZIP`); }
      catch (err) { console.error(err); api.toast('Erreur PDF : ' + err.message, 'error'); }
    };
  }
});
