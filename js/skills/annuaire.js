'use strict';
/* Annuaire commun : chaque personne est enregistrée une seule fois et sert à tous les skills. */
App.annuaire = (() => {
  const api = App.api;
  const FIELDS = [
    {key: 'civilite', label: 'Civilité'}, {key: 'prenom', label: 'Prénom'}, {key: 'nom', label: 'Nom'},
    {key: 'naissance', label: 'Date de naissance'}, {key: 'bapteme', label: 'Date de baptême'}, {key: 'fonction', label: 'Fonction'}, {key: 'statut', label: 'Statut'},
    {key: 'telephone', label: 'Portable'}, {key: 'fixe', label: 'Fixe'}, {key: 'assemblee', label: 'Assemblée'}, {key: 'email', label: 'Mail'},
    {key: 'adresse', label: 'Adresse'}, {key: 'cp', label: 'Code postal'}, {key: 'ville', label: 'Ville'}, {key: 'notes', label: 'Notes'}
  ];
  const keyOf = p => api.norm(`${p.prenom || ''} ${p.nom || ''}`);
  const fullName = p => [p.prenom, (p.nom || '').toUpperCase()].filter(Boolean).join(' ');
  const emailOk = e => !e || /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(e.trim());
  const FONCTIONS = ['Ancien', 'Assistant'];
  // Comité de service de chaque assemblée : coordinateur du collège des anciens, secrétaire, responsable de prédication
  const COMITE = ['CCA', 'Secrétaire', 'Resp. Prédication'], COM_LIB = {'CCA': 'CCA', 'Secrétaire': 'secrétaire', 'Resp. Prédication': 'resp. prédication'};
  const comRang = p => { const i = COMITE.findIndex(r => (p.resp || []).includes(r)); return i < 0 ? 9 : i; };
  // Statut lu sur les fiches S-21 (PNB : date de naissance sans date de baptême ; PP, PS : cases cochées)
  const STATUTS = [['', 'Proclamateur'], ['PNB', 'PNB (non baptisé)'], ['PP', 'Pionnier permanent'], ['PS', 'Pionnier spécial']];
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
  /* ---------- Photos (trombinoscope) ---------- */
  // Réduit une image à 240 px de côté au plus, en JPEG : quelques kilo-octets par photo.
  async function resizePhoto(file, max = 240) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image illisible')); i.src = url; });
      const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * r), h = Math.round(img.naturalHeight * r);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      return cv.toDataURL('image/jpeg', 0.82);
    } finally { URL.revokeObjectURL(url); }
  }
  const pickImages = (multiple = true) => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple; i.style.display = 'none'; document.body.appendChild(i);
    const done = v => { res(v); setTimeout(() => i.remove(), 0); };
    i.addEventListener('change', async () => { const out = [];   // copie en mémoire avant de retirer le champ (Safari)
      for (const f of [...i.files]) { try { out.push(new File([await f.arrayBuffer()], f.name, {type: f.type, lastModified: f.lastModified})); } catch { /* fichier inaccessible : ignoré */ } }
      done(out); });
    i.addEventListener('cancel', () => done([])); i.click();
  });
  // Photos déposées en nombre : rattachées d'après le nom du fichier (« NOM Prénom.jpg », « Prénom_NOM.png »…)
  async function importPhotos(files) {
    if (!files.length) return;
    const tok = t => api.norm(t).replace(/[^a-z ]/g, ' ').split(' ').filter(Boolean).sort().join(' ');
    const idx = {};
    for (const p of api.data.persons) (idx[tok(`${p.nom} ${p.prenom}`)] ??= []).push(p);
    const ok = {}, sans = [], ambigus = [];
    for (const f of files) {
      const k = tok(f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ').replace(/\d+/g, ' '));
      const l = idx[k] || [];
      if (l.length === 1) { try { ok[l[0].id] = await resizePhoto(f); } catch { sans.push(f.name); } }
      else (l.length ? ambigus : sans).push(f.name);
    }
    if (Object.keys(ok).length) await api.photos.setMany(ok);
    await api.modal({title: 'Photos importées', actions: [{label: 'Fermer', kind: 'primary'}], body: `<p><strong>${Object.keys(ok).length}</strong> photo(s) rattachée(s) à une fiche de l’annuaire.</p>
      ${ambigus.length ? `<p class="small">Plusieurs personnes portent ce nom (photo à ajouter depuis la bonne fiche) : ${ambigus.map(api.esc).join(', ')}</p>` : ''}
      ${sans.length ? `<p class="small">Aucune fiche trouvée pour : ${sans.map(api.esc).join(', ')}</p><p class="small muted">Nommez les fichiers « NOM Prénom » comme dans l’annuaire.</p>` : ''}`});
  }


  /* ---------- Photos depuis des captures d'écran d'un trombinoscope ----------
     Chaque capture montre une liste de cartes : photo ronde à gauche, nom à droite, dans l'ordre alphabétique.
     L'application repère les photos, écarte les silhouettes par défaut, puis propose les noms dans l'ordre
     de l'annuaire : il suffit de choisir le premier nom et de corriger ceux qui ne correspondent pas. */
  async function loadImg(file) {
    const url = URL.createObjectURL(file);
    try { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image illisible')); i.src = url; }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  function findAvatars(img) {
    const W = img.naturalWidth, H = img.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', {willReadFrequently: true}); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data, XL = Math.round(W * 0.31);
    const ink = (x, y) => { const i = (y * W + x) * 4; return !(d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 228); };
    const counts = new Array(H).fill(0);
    for (let y = 0; y < H; y++) { let n = 0; for (let x = Math.round(W * 0.03); x < XL; x++) if (ink(x, y)) n++; counts[y] = n; }
    const minRun = W * 0.12, out = [];
    let y = 0;
    while (y < H) {
      if (counts[y] < 4) { y++; continue; }
      let y2 = y; while (y2 < H && counts[y2] >= 4) y2++;
      const hRun = y2 - y;
      if (hRun >= minRun && hRun <= W * 0.4) {
        // étendue horizontale du cercle sur la ligne du milieu : premier pixel non blanc jusqu'au premier vide
        const ym = Math.round((y + y2) / 2); let x0 = Math.round(W * 0.03); while (x0 < XL && !ink(x0, ym)) x0++;
        let x1 = x0, gap = 0; while (x1 < XL + W * 0.05 && gap < 6) { if (ink(x1, ym)) gap = 0; else gap++; x1++; }
        x1 -= gap; const cx = (x0 + x1) / 2, r = Math.max(hRun, x1 - x0) / 2;
        const size = Math.round(r * 2), sx = Math.max(0, Math.round(cx - r)), sy = Math.max(0, Math.round((y + y2) / 2 - r));
        const c2 = document.createElement('canvas'); c2.width = size; c2.height = size;
        const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
        g.save(); g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip(); g.drawImage(cv, sx, sy, size, size, 0, 0, size, size); g.restore();
        // silhouette grise par défaut ?
        // (deux tons seulement, gris et blanc, sans aucune couleur de peau ni de vêtement)
        const px = g.getImageData(0, 0, size, size).data; let grey = 0, colour = 0, tot = 0;
        for (let i = 0; i < px.length; i += 16) { const r2 = px[i], g2 = px[i + 1], b2 = px[i + 2], mx = Math.max(r2, g2, b2), mn = Math.min(r2, g2, b2); tot++; if (mx - mn < 12 && Math.abs((r2 + g2 + b2) / 3 - 178) < 22) grey++; if (mx - mn > 25) colour++; }
        out.push({canvas: c2, silhouette: grey / tot > 0.18 && colour / tot < 0.03});
      }
      y = y2;
    }
    return out;
  }
  function photoFromCanvas(cv, rot = 0, max = 240) {
    const s = Math.min(max, cv.width), c = document.createElement('canvas'); c.width = s; c.height = s;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    g.translate(s / 2, s / 2); g.rotate(rot * Math.PI / 180); g.drawImage(cv, -s / 2, -s / 2, s, s);
    return c.toDataURL('image/jpeg', 0.85);
  }
  async function screenshotsFlow(files, asm) {
    if (!files.length) return;
    files = [...files].sort((a, b) => a.name.localeCompare(b.name, 'fr', {numeric: true}));
    const tiles = [];
    for (const f of files) { try { tiles.push(...findAvatars(await loadImg(f))); } catch { api.toast(`${f.name} : image illisible`, 'error'); } }
    if (!tiles.length) return api.toast('Aucune photo repérée sur ces captures.', 'error');
    const people = api.data.persons.filter(p => !asm || api.norm(p.assemblee || '') === api.norm(asm))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr'));
    tiles.forEach(t => { t.pid = ''; t.manual = false; t.rot = 0; t.use = !t.silhouette; });
    const chain = from => { // propose la suite alphabétique après le dernier nom choisi à la main
      let idx = -1;
      tiles.forEach((t, i) => { if (t.manual) { idx = people.findIndex(p => p.id === t.pid); } else if (i > from && idx >= 0) { idx++; t.pid = people[idx]?.id || ''; } });
    };
    const label = p => `${(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
    const byLabel = new Map(people.map(p => [api.norm(label(p)), p.id]));
    const grid = () => tiles.map((t, i) => `<div class="card" data-i="${i}" style="padding:8px;display:flex;flex-direction:column;gap:6px;align-items:center;${t.use ? '' : 'opacity:.55'}">
        <img src="${t.canvas.toDataURL('image/jpeg', 0.8)}" style="width:84px;height:84px;border-radius:50%;transform:rotate(${t.rot}deg)">
        <input data-k="pid" list="shNames" placeholder="Taper le nom…" value="${api.esc(t.pid ? label(people.find(p => p.id === t.pid)) : '')}" style="width:100%;font-size:12px;padding:3px 5px;${t.manual ? 'border-color:var(--accent);font-weight:600' : ''}">
        <div class="row small" style="gap:6px;justify-content:space-between;width:100%">
          <label class="row" style="gap:4px"><input type="checkbox" data-k="use" ${t.use ? 'checked' : ''}> ${t.silhouette ? 'silhouette' : 'garder'}</label>
          <button type="button" class="btn" data-k="rot" title="Tourner d'un quart de tour" style="padding:2px 8px">↻</button></div></div>`).join('');
    const res = await api.modal({title: `Photos repérées sur les captures (${tiles.length})`, wide: true,
      body: `<p class="small" style="margin-top:0">Tapez le nom de la <strong>première</strong> photo (quelques lettres suffisent, puis choisissez dans la liste) : les suivantes sont proposées dans l’ordre alphabétique de l’annuaire${asm ? ` (${api.esc(asm)})` : ''}. Corrigez celles qui ne correspondent pas, la suite se recale. Les silhouettes par défaut ne sont pas gardées, mais comptent dans l’ordre.</p>
        <datalist id="shNames">${people.map(p => `<option value="${api.esc(label(p))}">`).join('')}</datalist>
        <div id="shGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;max-height:60vh;overflow:auto">${grid()}</div>`,
      actions: [{label: 'Annuler', value: false}, {label: 'Enregistrer les photos', kind: 'primary', value: true}],
      onMount: b => {
        const g = api.$('#shGrid', b), redraw = () => { const st = g.scrollTop; g.innerHTML = grid(); g.scrollTop = st; };
        g.addEventListener('change', e => { const card = e.target.closest('[data-i]'); if (!card) return; const i = +card.dataset.i, t = tiles[i];
          if (e.target.dataset.k === 'pid') { const id = byLabel.get(api.norm(e.target.value.trim())) || ''; if (e.target.value.trim() && !id) { api.toast('Nom introuvable dans l’annuaire de cette assemblée', 'error'); return; } t.pid = id; t.manual = !!id; chain(i); }
          if (e.target.dataset.k === 'use') t.use = e.target.checked;
          redraw(); });
        g.addEventListener('click', e => { if (e.target.dataset.k !== 'rot') return; const t = tiles[+e.target.closest('[data-i]').dataset.i]; t.rot = (t.rot + 90) % 360; redraw(); });
      }});
    if (!res) return;
    const map = {}; for (const t of tiles) if (t.use && t.pid) map[t.pid] = photoFromCanvas(t.canvas, t.rot);
    if (Object.keys(map).length) await api.photos.setMany(map);
    api.toast(`${Object.keys(map).length} photo(s) enregistrée(s)`);
  }
  async function photosMenu() {
    const congs = [...new Set(api.data.persons.map(p => p.assemblee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    let done = null;
    await api.modal({title: 'Ajouter des photos', actions: [{label: 'Fermer', value: null}],
      body: `<div class="stack">
        <div class="card stack"><strong>Captures d’écran d’un trombinoscope</strong>
          <p class="small muted" style="margin:0">Sélectionnez les captures d’une assemblée : l’application découpe les photos et vous propose les noms.</p>
          <label class="field"><span>Assemblée</span><select id="phAsm"><option value="">Toutes</option>${congs.map(c => `<option>${api.esc(c)}</option>`).join('')}</select></label>
          <button class="btn primary" id="phShots">Choisir les captures d’écran</button></div>
        <div class="card stack"><strong>Photos nommées « NOM Prénom »</strong>
          <p class="small muted" style="margin:0">Chaque fichier est rattaché à la fiche qui porte son nom.</p>
          <button class="btn" id="phNamed">Choisir les photos</button></div></div>`,
      onMount: (b, close) => {
        api.$('#phShots', b).onclick = () => { const asm = api.$('#phAsm', b).value; const pr = pickImages(true); close(null); done = pr.then(f => screenshotsFlow(f, asm)); };
        api.$('#phNamed', b).onclick = () => { const pr = pickImages(true); close(null); done = pr.then(importPhotos); };
      }});
    if (done) await done;
  }

  async function editPerson(person) {
    await api.photos.load();
    const isNew = !person; const p = person ? {...person} : {id: api.uid(), civilite: '', prenom: '', nom: ''};
    const congs = api.data.congregations.map(c => `<option value="${api.esc(c.nom)}">`).join('');
    let photo = api.photos.get(p.id), photoChanged = false;
    const body = `<form class="form-grid" onsubmit="return false">
      <div class="field wide"><span>Photo</span><div class="row" style="gap:10px;align-items:center">
        <img id="pPhoto" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;background:var(--line);${photo ? '' : 'display:none'}" src="${photo || ''}">
        <button type="button" class="btn" id="pPhotoAdd">${photo ? 'Changer la photo' : 'Ajouter une photo'}</button>
        <button type="button" class="btn" id="pPhotoDel" ${photo ? '' : 'style="display:none"'}>Retirer</button></div></div>
      <label class="field"><span>Civilité</span><select name="civilite"><option value=""></option>${['Frère', 'Sœur'].map(v => `<option ${p.civilite === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Prénom</span><input type="text" name="prenom" value="${api.esc(p.prenom)}"></label>
      <label class="field"><span>Nom</span><input type="text" name="nom" value="${api.esc(p.nom)}"></label>
      <label class="field"><span>Date de naissance</span><input type="date" name="naissance" value="${api.esc(p.naissance)}" max="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field"><span>Date de baptême</span><input type="date" name="bapteme" value="${api.esc(p.bapteme)}" max="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field"><span>Fonction</span><select name="fonction"><option value=""></option>${FONCTIONS.map(v => `<option ${p.fonction === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Statut</span><select name="statut">${STATUTS.map(([v, l]) => `<option value="${v}" ${(p.statut || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Portable</span><input type="tel" name="telephone" value="${api.esc(p.telephone)}"></label>
      <label class="field"><span>Fixe</span><input type="tel" name="fixe" value="${api.esc(p.fixe)}"></label>
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
      api.data.persons = api.data.persons.filter(x => x.id !== p.id); api.save(); await api.photos.set(p.id, null); api.toast('Personne supprimée'); return 'deleted';
    }});
    actions.push({label: 'Annuler', value: null}, {label: 'Enregistrer', kind: 'primary', onClick: async b => {
      const f = api.$('form', b), err = api.$('#pErr', b);
      for (const k of ['civilite', 'prenom', 'nom', 'naissance', 'bapteme', 'fonction', 'statut', 'assemblee', 'telephone', 'fixe', 'email', 'adresse', 'cp', 'ville', 'notes']) p[k] = f[k].value.trim();
      if (p.statut === 'PNB' && p.bapteme) { err.textContent = 'Un PNB n’est pas baptisé : retirez la date de baptême ou changez le statut.'; err.classList.remove('hidden'); return false; }
      if (p.naissance && p.bapteme && p.bapteme < p.naissance) { err.textContent = 'La date de baptême est antérieure à la date de naissance.'; err.classList.remove('hidden'); return false; }
      p.nom = p.nom.toUpperCase();
      if (!p.prenom && !p.nom) { err.textContent = 'Indiquez au moins un prénom ou un nom.'; err.classList.remove('hidden'); return false; }
      if (!emailOk(p.email)) { err.textContent = 'L’adresse mail semble mal formée (vérifiez les points et le @).'; err.classList.remove('hidden'); return false; }
      const dup = api.data.persons.find(x => x.id !== p.id && sameP(x, p));
      if (dup && !await api.confirm('Doublon possible', `${fullName(dup)} existe déjà dans l’annuaire (${dup.assemblee || 'sans assemblée'}). Enregistrer quand même ?`, 'Enregistrer')) return false;
      ensureCongregation(p.assemblee);
      if (isNew) api.data.persons.push(p); else Object.assign(person, p);
      if (photoChanged) await api.photos.set(p.id, photo);
      api.save(); api.toast(isNew ? 'Personne ajoutée' : 'Fiche enregistrée'); return 'saved';
    }});
    return api.modal({title: isNew ? 'Nouvelle personne' : fullName(p), body, actions, onMount: b => {
      api.$('[name=prenom]', b).focus();
      const img = api.$('#pPhoto', b), del = api.$('#pPhotoDel', b), add = api.$('#pPhotoAdd', b);
      add.onclick = async () => { const [f] = await pickImages(false); if (!f) return; try { photo = await resizePhoto(f); photoChanged = true; img.src = photo; img.style.display = ''; del.style.display = ''; add.textContent = 'Changer la photo'; } catch { api.toast('Cette image n’a pas pu être lue.', 'error'); } };
      del.onclick = () => { photo = null; photoChanged = true; img.style.display = 'none'; del.style.display = 'none'; add.textContent = 'Ajouter une photo'; };
    }});
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
    ['nom', /^nom$|nom de famille/], ['civilite', /^(f s|f|civilite|frere soeur|titre)$/], ['fixe', /fixe|domicile/], ['telephone', /\btel\b|telephone|portable|mobile|gsm/],
    ['fonction', /^(fonction|fct|a ass|attribution|role|privilege)$/], ['assemblee', /assemblee|congregation/], ['naissance', /date de naiss|naissance|ne le/], ['bapteme', /jour bapt|date de bapt|date bapt|bapteme le/], ['bapteme', /bapteme|bapt/], ['cp', /^cp$|code postal/], ['ville', /^ville$|commune|localite/], ['adresse', /adresse/]
  ];
  // Fiches présentées à la verticale (« Nom : DUPONT » ou « Nom » | « DUPONT » sur deux colonnes, une fiche après l'autre) :
  // on les transforme en tableau classique, une ligne par personne.
  const LABELS = [['nom', /^nom( de famille)?$/], ['prenom', /^prenoms?$/], ['nom_complet', /^(nom et prenom|nom prenom|prenom nom|nom complet|proclamateur)$/], ['adresse', /^adresse$/], ['cp', /^(cp|code postal|cp ville|cp et ville|code postal ville|code postal et ville)$/], ['ville', /^(ville|commune)$/], ['fixe', /^(fixe|tel fixe|telephone fixe|domicile|tel domicile)$/], ['telephone', /^(tel|telephone|portable|mobile|gsm|tel portable)$/], ['email', /^(mail|e mail|email|courriel)$/], ['naissance', /^(date de naissance|naissance|ne le|nee le)$/], ['bapteme', /^(date de bapteme|bapteme|baptise le|baptisee le)$/], ['fonction', /^(fonction|privilege)$/], ['assemblee', /^(assemblee|congregation)$/]];
  const HEAD_OF = {nom: 'Nom', prenom: 'Prénom', nom_complet: 'Nom et prénom', adresse: 'Adresse', cp: 'Code postal', ville: 'Ville', telephone: 'Portable', fixe: 'Fixe', email: 'Mail', naissance: 'Date de naissance', bapteme: 'Date de baptême', fonction: 'Fonction', assemblee: 'Assemblée'};
  function verticalToTable(sheet) {
    const cells = [];
    for (const r of sheet.rows) {
      const c = r.map(x => x ?? '').filter(x => String(x).trim() !== '');
      if (!c.length) { cells.push(null); continue; }
      let lab = String(c[0]).trim(), val = c[1];
      const m = /^([^:]{2,30}?)\s*:\s*(.*)$/.exec(lab); if (m && c.length === 1) { lab = m[1]; val = m[2]; } else lab = lab.replace(/\s*:$/, '');
      const key = (LABELS.find(([, re]) => re.test(api.norm(lab))) || [])[0];
      cells.push(key ? {key, val: val ?? ''} : {other: true});
    }
    const labelled = cells.filter(x => x && x.key).length, filled = cells.filter(Boolean).length;
    if (labelled < 6 || labelled / filled < 0.5) return sheet;   // pas une présentation en fiches
    const keys = [], recs = []; let cur = null;
    const first = cells.find(x => x && x.key)?.key;
    for (const x of cells) {
      if (!x || !x.key) continue;
      if (!cur || x.key === first || x.key in cur) { cur = {}; recs.push(cur); }
      cur[x.key] = x.val; if (!keys.includes(x.key)) keys.push(x.key);
    }
    return {name: sheet.name + ' (fiches)', rows: [keys.map(k => HEAD_OF[k]), ...recs.map(r => keys.map(k => r[k] ?? ''))]};
  }
  const TARGETS = [{key: 'nom_complet', label: 'Prénom et nom dans une seule colonne'}, ...FIELDS.filter(f => f.key !== 'notes')];

  async function importFlow(onDone, mode = 'import') {
    const compare = mode === 'compare';
    const file = await api.pickFile('.xlsx,.xlsm,.csv,.tsv,.pdf,.docx,.txt'); if (!file) return;
    let sheets;
    try { sheets = await App.files.readTable(file); } catch (e) { return api.toast('Lecture impossible : ' + e.message, 'error'); }
    sheets = sheets.filter(s => s.rows.some(r => r.some(c => String(c).trim()))).map(verticalToTable);
    if (!sheets.length) return api.toast('Le fichier ne contient aucune donnée.', 'error');
    // Ligne des titres = celle des 20 premières qui contient le plus de titres reconnus (pas d'@ ni de longs textes).
    const isTitle = c => { const t = String(c ?? '').trim(); return t && t.length < 40 && !/@|\d{4,}/.test(t) && GUESS.some(([, re]) => re.test(api.norm(t))); };
    const detectHeader = rows => { let best = -1, score = 0; for (let i = 0; i < Math.min(rows.length, 20); i++) { const n = rows[i].filter(isTitle).length; if (n > score) { score = n; best = i; } } return best; };

    const result = await api.modal({title: compare ? 'Mettre à jour l’annuaire depuis un fichier' : 'Importer dans l’annuaire', wide: true, body: `
      ${compare ? '<div class="notice small">Choisissez la feuille et vérifiez les colonnes : l’étape suivante compare le fichier avec l’annuaire et vous laisse valider chaque changement.</div>' : ''}
      <div class="stack"><p class="muted small" style="margin:0">Fichier : ${api.esc(file.name)}</p>
      <div class="form-grid"><label class="field"><span>${sheets.length > 1 && /\.(pdf|docx|txt)$/i.test(file.name) ? 'Méthode de lecture' : 'Feuille'}</span><select id="impSheet">${sheets.map((s, i) => { const base = file.name.replace(/\.[^.]+$/, ''), n = s.name.startsWith(base + ' — ') ? s.name.slice(base.length + 3) : s.name; return `<option value="${i}">${api.esc(n.charAt(0).toUpperCase() + n.slice(1))}${/\(\d+ (personnes|proclamateurs)\)/.test(n) ? '' : ` (${s.rows.length} lignes)`}</option>`; }).join('')}</select></label>
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
          pick('telephone', v => /^(\+33\s?|0)[67]([ .-]?\d{2}){4}$/.test(v));
          pick('fixe', v => /^(\+33\s?|0)[1-59]([ .-]?\d{2}){4}$/.test(v));
          pick('telephone', v => /^(\+33\s?|0)[1-9]([ .-]?\d{2}){4}$/.test(v));
          // Dates sans titre reconnu : la plus ancienne est la naissance, l'autre le baptême
          if (!('naissance' in guess) || !('bapteme' in guess)) {
            const dc = cols.filter(c => !used.has(c.i) && share(c.i, v => !!parseDate(isNaN(v) ? v : Number(v))) >= 0.6)
              .map(c => { const ys = vals(c.i).map(v => parseDate(isNaN(v) ? v : Number(v))).filter(Boolean).map(d => +d.slice(0, 4)).sort((a, b) => a - b); return {i: c.i, med: ys[Math.floor(ys.length / 2)]}; })
              .filter(c => c.med > 1900).sort((a, b) => a.med - b.med);
            if (dc.length >= 2) { if (!('naissance' in guess)) { guess.naissance = dc[0].i; used.add(dc[0].i); } if (!('bapteme' in guess)) { guess.bapteme = dc[1].i; used.add(dc[1].i); } }
            else if (dc.length === 1 && ('bapteme' in guess) && !('naissance' in guess)) { guess.naissance = dc[0].i; used.add(dc[0].i); }
            else if (dc.length === 1 && ('naissance' in guess) && !('bapteme' in guess)) { guess.bapteme = dc[0].i; used.add(dc[0].i); }
          }
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
            // Vous-même (profil dans Paramètres), souvent en tête des listes comme responsable de circonscription
            const me = api.data.settings?.profil || {};
            nom = nom.replace(/^RC\s+|\s+RC$/, ''); prenom = prenom.replace(/^RC\s+|\s+RC$/, '');
            if (me.nom && me.prenom && api.norm(nom) === api.norm(me.nom) && api.norm(prenom) === api.norm(me.prenom)) continue;
            // Titres et lignes de texte (« Assemblée de … – liste 2026 », « Total », « Page 2 ») : pas une personne
            if (/\b(liste|assemblee|congregation|page|total|groupe|mise a jour)\b/.test(api.norm(prenom + ' ' + nom)) || (prenom + ' ' + nom).length > 45) continue;
            // Lignes de totaux ou de titres (« Total », « Assistance »…) : un seul mot et aucune autre information.
            if ((!prenom || !nom) && !['telephone', 'email', 'adresse', 'naissance', 'bapteme'].some(k => map[k] !== undefined && String(r[map[k]] ?? '').trim())) continue;
            const raw = k => map[k] === undefined ? '' : r[map[k]];
            // Adresse complète dans une seule cellule (« 2 rue … 14123 Ifs », parfois sur plusieurs lignes), ou « CP Ville » ensemble
            let adr = get('adresse').replace(/\s*\n\s*/g, ' '), cpv = get('cp'), vil = get('ville');
            const mA = !cpv && /^(.*?)[,\s]*\b(\d{2}) ?(\d{3})\b\s*(.*)$/.exec(adr);
            if (mA && /[a-zà-ÿ]/i.test(mA[1])) { adr = mA[1].replace(/[,\s-]+$/, ''); cpv = mA[2] + mA[3]; if (!vil) vil = mA[4].replace(/\bcedex\b.*$/i, '').trim(); }
            const mC = /^(\d{2}) ?(\d{3})\s+(.+)$/.exec(cpv); if (mC) { cpv = mC[1] + mC[2]; if (!vil) vil = mC[3].trim(); }
            const mV = !cpv && /^(\d{2}) ?(\d{3})\s+(.+)$/.exec(vil); if (mV) { cpv = mV[1] + mV[2]; vil = mV[3].trim(); }
            // Assemblée laissée vide sous une cellule fusionnée : on reprend celle du dessus.
            let cong = get('assemblee'); if (map.assemblee !== undefined) { if (cong) lastCong = cong; else cong = lastCong; }
            // Portables (06, 07) et fixes rangés chacun à sa place, même s'ils sont mélangés dans une colonne
            const tl = App.files.telsIn(get('telephone') + ' ' + get('fixe'));
            const tel = tl.mob[0] || (!tl.fixe.length ? get('telephone') : ''), fixe = tl.fixe[0] || (!tl.mob.length && !tl.fixe.length ? get('fixe') : '');
            people.push({civilite: civ(get('civilite')), prenom, nom: nom.toUpperCase(), naissance: parseDate(raw('naissance')), bapteme: parseDate(raw('bapteme')), fonction: fct(get('fonction')), assemblee: cong || api.$('#impCong', b).value.trim().toUpperCase(), telephone: tel, fixe,
              email: get('email').replace(/,/g, '.').replace(/\s+/g, ''), adresse: adr, cp: cpv, ville: vil ? vil.toUpperCase() : ''});
          }
          // Dédoublonnage dans le fichier lui-même puis contre l'annuaire.
          const unique = [];
          for (const p of people) { const q = unique.find(x => sameP(x, p)); if (q) { for (const f in p) if (!q[f] && p[f]) q[f] = p[f]; } else unique.push(p); }
          const existing = indexOf(api.data.persons);
          const toAdd = unique.filter(p => !existing.has(p)), toMerge = unique.filter(p => existing.has(p));
          const badMail = unique.filter(p => !emailOk(p.email)).length;
          const mapped = new Set(Object.keys(map)); if (map.nom_complet !== undefined) mapped.add('prenom').add('nom');
          if (api.$('#impCong', b).value.trim()) mapped.add('assemblee');
          for (const k of ['cp', 'ville', 'telephone', 'fixe']) if (unique.some(p => p[k])) mapped.add(k);
          b._plan = unique.length ? {toAdd, toMerge, existing, unique, mapped} : null;
          api.$('#impPrev', b).innerHTML = `<div class="notice small">${unique.length} personne(s) lue(s) : <strong>${toAdd.length} nouvelle(s)</strong>, ${toMerge.length} déjà présente(s)${compare ? '' : ' (les champs vides seront complétés)'}${people.length > unique.length ? `, ${people.length - unique.length} doublon(s) dans le fichier fusionné(s)` : ''}${badMail ? `, <span style="color:var(--warn)">${badMail} mail(s) à vérifier</span>` : ''}.
              <br>Coordonnées trouvées : <strong>${unique.filter(p => p.email).length}</strong> mail(s) · <strong>${unique.filter(p => p.telephone).length}</strong> portable(s) · <strong>${unique.filter(p => p.fixe).length}</strong> fixe(s) · <strong>${unique.filter(p => p.adresse || p.cp).length}</strong> adresse(s).
              ${sheets.length > 1 ? `<br><span class="muted">Le résultat ne convient pas ? Essayez une autre ${/\.(pdf|docx|txt)$/i.test(file.name) ? 'méthode de lecture' : 'feuille ou la lecture par blocs'} dans la liste ci-dessus.</span>` : ''}</div>
            <div class="table-wrap" style="margin-top:10px;max-height:220px"><table class="list"><tr><th>Nom</th><th>Prénom</th><th>Naissance</th><th>Baptême</th><th>Fonction</th><th>Portable</th><th>Fixe</th><th>Mail</th><th>Adresse</th><th>CP</th><th>Ville</th></tr>
            ${unique.slice(0, 8).map(p => `<tr><td>${api.esc(p.nom)}</td><td>${api.esc(p.prenom)}</td><td>${fmtDate(p.naissance)}</td><td>${fmtDate(p.bapteme)}</td><td>${api.esc(p.fonction)}</td><td style="white-space:nowrap">${api.esc(p.telephone)}</td><td style="white-space:nowrap">${api.esc(p.fixe)}</td><td>${api.esc(p.email)}</td><td>${api.esc(p.adresse)}</td><td>${api.esc(p.cp)}</td><td>${api.esc(p.ville)}</td></tr>`).join('')}</table></div>
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
  const COMPARED = ['civilite', 'naissance', 'bapteme', 'fonction', 'statut', 'telephone', 'fixe', 'email', 'adresse', 'cp', 'ville', 'assemblee'];
  const labelOf = k => (FIELDS.find(f => f.key === k) || {label: k}).label;
  const shown = (k, v) => (k === 'naissance' || k === 'bapteme') ? fmtDate(v) : k === 'statut' ? (v ? v : 'Proclamateur') : (v || '');
  function same(k, a, b) {
    a = String(a || ''); b = String(b || '');
    if (k === 'telephone' || k === 'fixe') return a.replace(/\D/g, '').replace(/^33/, '0') === b.replace(/\D/g, '').replace(/^33/, '0');
    if (k === 'email') return a.trim().toLowerCase() === b.trim().toLowerCase();
    return api.norm(a) === api.norm(b);
  }

  async function compareFlow(unique, mapped, fileName, opts = {}) {
    // champs où une valeur vide du fichier est une vraie information (fiche S-21 : pas de case « Ancien » cochée = pas ancien)
    const explicit = opts.explicit || new Set();
    const fields = COMPARED.filter(k => mapped.has(k));
    const congs = [...new Set(unique.map(p => api.norm(p.assemblee)).filter(Boolean))];
    const byKey = indexOf(api.data.persons), fileIdx = indexOf(unique);
    const nouveaux = unique.filter(p => !byKey.has(p));
    const modifs = [];
    for (const p of unique) {
      const q = byKey.find(p); if (!q) continue;
      const changes = fields.filter(k => p[k] !== undefined && !same(k, q[k], p[k])).map(k => ({k, old: q[k] || '', val: p[k] || '', kind: !q[k] ? 'ajout' : !p[k] && !explicit.has(k) ? 'vide' : 'modif'}));
      if (changes.length) modifs.push({person: q, changes});
    }
    const inScope = q => !congs.length || congs.includes(api.norm(q.assemblee));
    const absents = api.data.persons.filter(q => inScope(q) && !fileIdx.has(q));
    const identiques = unique.length - nouveaux.length - modifs.length;
    const scopeTxt = congs.length ? `assemblée${congs.length > 1 ? 's' : ''} ${[...new Set(unique.map(p => p.assemblee).filter(Boolean))].join(', ')}` : 'tout l’annuaire';

    const kindTxt = {ajout: 'complété', modif: 'modifié', vide: 'absent du fichier'};
    const body = `<div class="stack">
      <div class="notice small">${api.esc(opts.what || `Fichier « ${fileName} »`)} comparé avec ${api.esc(scopeTxt)}.
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
          <td class="muted">${api.esc(shown(c.k, c.old)) || '—'}</td><td><strong>${api.esc(shown(c.k, c.val)) || (explicit.has(c.k) ? 'aucune' : '(vide)')}</strong></td></tr>`).join('')).join('')}</table></div>
        <p class="small muted" style="margin:0">Les champs vides dans le fichier ne sont pas cochés : par défaut, l’information de l’annuaire est conservée.</p>` : ''}
      ${absents.length ? `<h3 style="margin:8px 0 0;font-size:15px">${opts.absentTitle || 'Dans l’annuaire mais absentes du fichier'} (${absents.length})</h3>
        <p class="small muted" style="margin:0">${opts.absentNote || 'Elles ont peut-être déménagé ou changé d’assemblée.'} Cochez seulement celles à supprimer de l’annuaire.</p>
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

  /* ---------- Fiches S-21 (activité du proclamateur) ---------- */
  // Plusieurs fichiers, un dossier entier ou un ZIP : chaque fichier est copié en mémoire (Safari) avant lecture.
  function pickFiles(accept, dir) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = accept; if (dir) { i.webkitdirectory = true; i.setAttribute('webkitdirectory', ''); }
      i.style.display = 'none'; document.body.appendChild(i);
      const done = v => { res(v); setTimeout(() => i.remove(), 0); };
      i.addEventListener('change', async () => { const out = [];
        for (const f of i.files) { if (!/\.(pdf|zip)$/i.test(f.name)) continue; try { out.push(new File([await f.arrayBuffer()], f.webkitRelativePath || f.name, {type: f.type})); } catch (e) { api.toast(`${f.name} illisible : ${e.message}`, 'error'); } }
        done(out); });
      i.addEventListener('cancel', () => done(null));
      i.click();
    });
  }
  async function s21Flow(onDone) {
    const dirOk = 'webkitdirectory' in document.createElement('input') && !/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    const how = await api.modal({title: 'Mettre à jour l’annuaire avec les fiches S-21', body: `<div class="stack">
      <p style="margin:0">Les fiches <strong>S-21 « Activité du proclamateur »</strong> donnent pour chaque proclamateur : frère ou sœur, date de naissance, date de baptême, ancien ou assistant, pionnier permanent ou spécial.</p>
      <p style="margin:0">Une date de naissance <strong>sans date de baptême</strong> indique un <strong>PNB</strong>.</p>
      <p class="small muted" style="margin:0">Choisissez ${dirOk ? 'le dossier qui contient les fiches, ou ' : ''}les fichiers PDF (vous pouvez en sélectionner plusieurs à la fois ; un fichier ZIP est accepté aussi). L’étape suivante compare avec l’annuaire et vous laisse valider chaque changement.</p></div>`,
      // Safari n'ouvre la fenêtre de choix que si elle est demandée pendant le clic lui-même : on l'ouvre donc ici, sans attendre.
      actions: [{label: 'Annuler', value: null},
        {label: dirOk ? 'Choisir des fichiers' : 'Choisir les fichiers', kind: dirOk ? '' : 'primary', onClick: () => ({p: pickFiles('.pdf,.zip,application/pdf,application/zip', false)})},
        ...(dirOk ? [{label: 'Choisir un dossier', kind: 'primary', onClick: () => ({p: pickFiles('', true)})}] : [])]});
    if (!how) return;
    const picked = await how.p;
    if (!picked || !picked.length) return api.toast('Aucun fichier PDF choisi.', 'error');
    // ZIP : on en sort les PDF
    const pdfs = [];
    for (const f of picked) {
      if (/\.zip$/i.test(f.name)) { try { const z = await App.files.unzip(await f.arrayBuffer()); for (const n of z.names.filter(n => /\.pdf$/i.test(n) && !/(^|\/)__MACOSX\//.test(n))) pdfs.push(new File([await z.bytes(n)], n.split('/').pop(), {type: 'application/pdf'})); } catch (e) { api.toast(`${f.name} : ${e.message}`, 'error'); } }
      else pdfs.push(f);
    }
    api.toast(`Lecture de ${pdfs.length} fichier(s)…`);
    const cards = [], ignored = [];
    for (const f of pdfs) {
      try { const c = await App.files.readS21(f); if (c.length) cards.push(...c); else ignored.push(f.name.split('/').pop()); }
      catch (e) { ignored.push(`${f.name.split('/').pop()} (${e.message})`); }
    }
    if (!cards.length) return api.modal({title: 'Fiches S-21', body: `<p>Aucune fiche S-21 reconnue dans ${pdfs.length} fichier(s).</p>${ignored.length ? `<p class="small muted">${ignored.map(api.esc).join('<br>')}</p>` : ''}`, actions: [{label: 'Fermer', kind: 'primary'}]});

    // Une personne peut avoir plusieurs fiches (plusieurs années) : la plus récente donne fonction et statut
    const byKey = new Map();
    for (const c of cards) {
      const k = api.norm(`${c.prenom} ${c.nom}`), prev = byKey.get(k);
      if (!prev) { byKey.set(k, {...c}); continue; }
      const newer = (c.annee || '0') >= (prev.annee || '0') ? c : prev, older = newer === c ? prev : c;
      byKey.set(k, {...older, ...newer, naissance: newer.naissance || older.naissance, bapteme: newer.bapteme || older.bapteme});
    }
    const list = [...byKey.values()].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
    const statutS21 = c => c.ps ? 'PS' : c.pp ? 'PP' : c.naissance && !c.bapteme ? 'PNB' : c.bapteme ? '' : undefined;
    // Assemblée proposée : celle des personnes déjà connues, sinon le titre de la fiche
    const idx = indexOf(api.data.persons), votes = {};
    for (const c of list) { const q = idx.find({prenom: c.prenom, nom: c.nom}); const a = q?.assemblee || c.asm; if (a) votes[a] = (votes[a] || 0) + 1; }
    const guess = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const act = c => c.participe == null ? '' : `${c.participe}/12 mois${c.pa ? ` · ${c.pa} PA` : ''}${c.heures ? ` · ${c.heures} h` : ''}${c.annee ? ` (${c.annee})` : ''}`;
    const nPNB = list.filter(c => statutS21(c) === 'PNB').length;

    const asm = await api.modal({title: `Fiches S-21 lues : ${list.length} proclamateur(s)`, wide: true, body: `<div class="stack">
      <div class="notice small"><strong>${list.length}</strong> fiche(s) lue(s) dans ${pdfs.length} fichier(s)${nPNB ? ` · <strong>${nPNB}</strong> PNB (date de naissance sans baptême)` : ''}${ignored.length ? ` · ${ignored.length} fichier(s) sans fiche S-21 ignoré(s)` : ''}.</div>
      <label class="field"><span>Assemblée de ces proclamateurs</span><input type="text" id="s21Asm" list="s21AsmL" value="${api.esc(guess)}" placeholder="Nom de l’assemblée"><datalist id="s21AsmL">${api.data.congregations.map(c => `<option value="${api.esc(c.nom)}">`).join('')}</datalist></label>
      <div class="table-wrap" style="max-height:340px"><table class="list"><tr><th>Nom</th><th>Prénom</th><th></th><th>Naissance</th><th>Baptême</th><th>Statut</th><th>Fonction</th><th>Activité</th></tr>
      ${list.map(c => { const st = statutS21(c); return `<tr><td><strong>${api.esc(c.nom)}</strong></td><td>${api.esc(c.prenom)}</td><td>${c.homme ? 'Frère' : c.femme ? 'Sœur' : ''}</td><td>${api.esc(c.naissance)}</td><td>${api.esc(c.bapteme)}</td>
        <td>${st ? `<span class="pill ${st === 'PNB' ? 'warn' : ''}">${st}</span>` : st === '' ? 'Proclamateur' : '<span class="muted">?</span>'}</td><td>${c.ancien ? 'Ancien' : c.assistant ? 'Assistant' : ''}</td><td class="small">${act(c)}</td></tr>`; }).join('')}</table></div>
      ${ignored.length ? `<details class="small muted"><summary>Fichiers ignorés (${ignored.length})</summary>${ignored.map(api.esc).join('<br>')}</details>` : ''}</div>`,
      actions: [{label: 'Annuler', value: null}, {label: 'Comparer avec l’annuaire…', kind: 'primary', onClick: b => { const v = api.$('#s21Asm', b).value.trim().toUpperCase(); if (!v) { api.toast('Indiquez l’assemblée.', 'error'); return false; } return v; }}]});
    if (!asm) return;
    const unique = list.map(c => ({civilite: c.homme ? 'Frère' : c.femme ? 'Sœur' : '', prenom: c.prenom, nom: c.nom.toUpperCase(), naissance: parseDate(c.naissance), bapteme: parseDate(c.bapteme),
      fonction: c.ancien ? 'Ancien' : c.assistant ? 'Assistant' : '', statut: statutS21(c), assemblee: asm}));
    const mapped = new Set(['civilite', 'naissance', 'bapteme', 'fonction', 'statut']);
    if (await compareFlow(unique, mapped, `${pdfs.length} fiche(s) S-21`, {what: `${list.length} fiche(s) S-21`, explicit: new Set(['fonction', 'statut']),
      absentTitle: 'Dans l’annuaire mais sans fiche S-21', absentNote: 'Leur fiche manque peut-être dans le dossier, ou elles ont quitté l’assemblée.'}) && onDone) onDone();
  }

  /* ---------- Assemblées ---------- */
  // Suppression : l'assemblée seule, les coordonnées de ses membres, ou l'assemblée avec toutes ses fiches.
  const CONTACT_FIELDS = ['adresse', 'cp', 'ville', 'telephone', 'fixe', 'email'];
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
        <div class="row"><button class="btn" id="aImp" title="Excel, CSV, PDF, Word ou texte : noms, prénoms, mails, portables, fixes et adresses sont repérés automatiquement">Importer une liste</button><button class="btn" id="aCmp">Mettre à jour depuis un fichier</button><button class="btn" id="aS21" title="Dates de naissance et de baptême, PNB, ancien, assistant, pionnier : d'après un dossier de fiches S-21">Fiches S-21</button><button class="btn" id="aDup">Doublons</button><button class="btn" id="aPho" title="Ajouter des photos en nombre : fichiers nommés « NOM Prénom »">Photos</button>
        <button class="btn primary" id="aAdd">${tab === 'personnes' ? '+ Personne' : '+ Assemblée'}</button></div></div>
        <div class="tabs"><button data-tab="personnes" class="${tab === 'personnes' ? 'active' : ''}">Personnes (${d.persons.length})</button>
        <button data-tab="assemblees" class="${tab === 'assemblees' ? 'active' : ''}">Assemblées (${d.congregations.length})</button></div>
        <div id="aBody"></div>`;
      const body = api.$('#aBody', el);
      if (tab === 'personnes') {
        body.innerHTML = `<div class="row" style="margin-bottom:12px"><input type="search" id="aQ" placeholder="Rechercher (nom, assemblée, mail…)" value="${api.esc(q)}" style="max-width:340px">
          <select id="aF" style="max-width:260px"><option value="">Toutes les assemblées</option>${[...d.congregations].sort((a, b) => a.nom.localeCompare(b.nom)).map(c => `<option ${filt === c.nom ? 'selected' : ''}>${api.esc(c.nom)}</option>`).join('')}</select>
          <select id="aFct" style="max-width:220px"><option value="">Tous</option>
            <optgroup label="Fonction">${FONCTIONS.map(v => `<option value="f:${v}" ${ffct === 'f:' + v ? 'selected' : ''}>${v}s</option>`).join('')}<option value="aucune" ${ffct === 'aucune' ? 'selected' : ''}>Sans fonction</option></optgroup>
            <optgroup label="Statut">${['PNB', 'PP', 'PS'].map(v => `<option value="s:${v}" ${ffct === 's:' + v ? 'selected' : ''}>${v === 'PP' ? 'PP (pionniers permanents)' : v === 'PS' ? 'PS (pionniers spéciaux)' : 'PNB (non baptisés)'}</option>`).join('')}</optgroup>
            <optgroup label="Responsabilités"><option value="comite" ${ffct === 'comite' ? 'selected' : ''}>Comité de service (CCA, secrétaire, resp. prédication)</option>${['CCA', 'Secrétaire', 'Resp. Prédication', 'CLH'].map(v => `<option value="r:${v}" ${ffct === 'r:' + v ? 'selected' : ''}>${v}</option>`).join('')}</optgroup></select>
          <span class="small muted" id="aCount"></span></div>
          <div id="aComite" style="margin-bottom:10px"></div>
          <div class="table-wrap"><table class="list"><thead><tr><th style="width:48px"></th><th>Nom</th><th>Prénom</th><th>Naissance</th><th>Baptême</th><th>Fonction</th><th>Portable</th><th>Mail</th><th>Adresse</th><th>CP</th><th>Ville</th></tr></thead><tbody id="aRows"></tbody></table></div>`;
        // Photo (ou initiales) en tête de ligne
        const avatar = p => { const ph = api.photos.get(p.id);
          return ph ? `<img src="${ph}" alt="" loading="lazy" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block">`
            : `<div style="width:40px;height:40px;border-radius:50%;background:var(--line,#e5e7eb);color:var(--muted,#6b7280);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:600">${api.esc(((p.prenom || '')[0] || '') + ((p.nom || '')[0] || '')).toUpperCase()}</div>`; };
        let statutOf = () => '';
        const draw = () => {
          const nq = api.norm(q);
          // statut de pionnier : le plus récent noté dans l'analyse de la circonscription
          const circ = api.moduleData('circonscription', {cycles: [], suivi: {}}), cyc = [...(circ.cycles || [])].sort((a, b) => b.code.localeCompare(a.code));
          // à défaut, le statut de la fiche (lu sur les S-21)
          statutOf = p => { for (const c of cyc) { const e = circ.suivi?.[c.id]?.[p.id]; if (e && e.statut !== undefined) return e.statut || ''; } return ['PNB', 'PP', 'PS'].includes(p.statut) ? p.statut : ''; };
          const okF = p => !ffct ? true : ffct === 'aucune' ? !p.fonction : ffct.startsWith('f:') ? p.fonction === ffct.slice(2)
            : ffct.startsWith('s:') ? statutOf(p) === ffct.slice(2) : ffct.startsWith('r:') ? (p.resp || []).includes(ffct.slice(2)) : ffct === 'comite' ? COMITE.some(r => (p.resp || []).includes(r)) : true;
          const rows = d.persons.filter(p => (!filt || api.norm(p.assemblee) === api.norm(filt)) && okF(p) && (!nq || api.norm(Object.values(p).join(' ')).includes(nq)))
            .sort((a, b) => (ffct === 'comite' ? (a.assemblee || '').localeCompare(b.assemblee || '', 'fr') || comRang(a) - comRang(b) : 0) || (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr'));
          const cnt = api.$('#aCount', el); if (cnt) cnt.textContent = `${rows.length} personne(s)`;
          // Comité de service : assemblée par assemblée, les rôles qui manquent
          const cw = api.$('#aComite', el);
          if (cw) { const asms = (filt ? [filt] : d.congregations.map(c => c.nom)).filter(Boolean);
            const manques = asms.map(a => [a, COMITE.filter(r => !d.persons.some(p => api.norm(p.assemblee) === api.norm(a) && (p.resp || []).includes(r)))]).filter(x => x[1].length);
            cw.innerHTML = ffct === 'comite' && manques.length ? `<div class="notice small">Comité de service incomplet : ${manques.map(([a, m]) => `<strong>${api.esc(a)}</strong> (${m.map(r => COM_LIB[r]).join(', ')} non renseigné${m.length > 1 ? 's' : ''})`).join(' · ')}.<br><span class="muted">Les responsabilités se renseignent dans la fiche de chaque frère, ou d’après l’organigramme de l’assemblée (Circonscription).</span></div>` : ''; }
          const age = iso => { const n = yearsSince(iso); return iso ? `${fmtDate(iso)}<div class="small muted">${n} an${n > 1 ? 's' : ''}</div>` : ''; };
          api.$('#aRows', el).innerHTML = rows.map(p => `<tr class="click" data-id="${p.id}"><td style="padding:4px 6px">${avatar(p)}</td><td><strong>${api.esc((p.nom || '').toUpperCase())}</strong>${p.assemblee ? `<div class="small muted">${api.esc(p.assemblee)}</div>` : ''}</td>
            <td>${api.esc(p.prenom)}</td><td>${age(p.naissance)}</td><td>${age(p.bapteme)}</td><td>${p.fonction ? `<span class="pill ${p.fonction === 'Ancien' ? 'ok' : ''}">${api.esc(p.fonction)}</span>` : ''}${statutOf(p) ? ` <span class="pill ${statutOf(p) === 'PNB' ? 'warn' : ''}">${api.esc(statutOf(p))}</span>` : ''}${ffct === 'comite' ? COMITE.filter(r => (p.resp || []).includes(r)).map(r => ` <span class="pill ok">${api.esc(r)}</span>`).join('') : ''}</td><td style="white-space:nowrap">${api.esc(p.telephone)}${p.fixe ? `<div class="small muted">${api.esc(p.fixe)}</div>` : ''}</td>
            <td>${p.email ? `<a href="mailto:${api.esc(p.email)}" onclick="event.stopPropagation()">${api.esc(p.email)}</a>` : ''}${emailOk(p.email) ? '' : ' <span class="pill warn">à vérifier</span>'}</td>
            <td>${api.esc(p.adresse)}</td><td>${api.esc(p.cp)}</td><td>${api.esc(p.ville)}</td></tr>`).join('')
            || `<tr><td colspan="11" class="muted">${d.persons.length ? 'Aucun résultat.' : 'L’annuaire est vide. Ajoutez une personne ou importez un fichier Excel.'}</td></tr>`;
        };
        draw(); api.photos.load().then(() => { if (api.$('#aRows', el)) draw(); });   // les photos arrivent juste après (déchiffrement)
        api.$('#aQ', el).addEventListener('input', e => { q = e.target.value; draw(); });
        api.$('#aF', el).addEventListener('change', e => { filt = e.target.value; draw(); });
        api.$('#aFct', el).addEventListener('change', e => { ffct = e.target.value; draw(); });
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
      api.$('#aPho', el).addEventListener('click', async () => { await photosMenu(); render(); });
      api.$('#aImp', el).addEventListener('click', () => importFlow(render));
      api.$('#aCmp', el).addEventListener('click', () => importFlow(render, 'compare'));
      api.$('#aS21', el).addEventListener('click', () => s21Flow(render));
    }
    render();
  }

  return {mount, editPerson, resizePhoto, importPhotos, fullName, keyOf, findByName, splitName, ensureCongregation, emailOk, parseDate, fmtDate, yearsSince};
})();

App.registerSkill({
  id: 'annuaire', name: 'Annuaire', icon: '👥', group: 'socle', order: 1,
  description: 'Personnes et assemblées, partagées par tous les skills.',
  mount: el => App.annuaire.mount(el)
});
