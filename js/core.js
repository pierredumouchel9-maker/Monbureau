/* Mon Bureau — socle : chiffrement, stockage, verrouillage, navigation, skills.
   Toutes les données restent sur l'appareil, chiffrées en AES-GCM 256 bits.
   La clé est dérivée du mot de passe maître (PBKDF2-SHA-256, 600 000 itérations)
   et n'existe qu'en mémoire tant que l'application est déverrouillée. */
'use strict';

const App = (() => {
  const VERSION = '0.33.6';
  const ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  /* ---------- Outils ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  // Normalise un texte pour comparer sans accents ni majuscules (« Éric » = « Eric »).
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dateLongue = (d = new Date()) => `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
  const dateCourte = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}); };

  function b64(buf) {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

  /* ---------- IndexedDB (clé → valeur) ---------- */
  let dbPromise = null;
  function idb() {
    if (!dbPromise) dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open('mon-bureau', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }
  async function kv(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode); const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  const kvGet = k => kv('readonly', s => s.get(k));
  const kvSet = (k, v) => kv('readwrite', s => s.put(v, k));
  const kvClear = () => kv('readwrite', s => s.clear());

  /* ---------- Chiffrement ---------- */
  async function deriveKey(password, salt, iterations = ITERATIONS) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify(obj)));
    return {iv: b64(iv), ct: b64(ct)};
  }
  async function open(key, box) {
    const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(box.iv)}, key, unb64(box.ct));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- État ---------- */
  let key = null;        // clé de la base, en mémoire seulement
  let data = null;       // base déchiffrée, en mémoire seulement
  let meta = null;       // sels et paramètres (non secrets)
  let saveTimer = null, saving = Promise.resolve();

  function emptyData() {
    return {
      version: 1,
      settings: {autoLockMin: 5, lockOnHide: true, lastBackup: null,
        profil: {prenom: '', nom: '', fonction: '', telephone: '', email: '', entete: '', epouse: ''}},
      persons: [], congregations: [], templates: [], docs: {},
      skills: {disabled: {}},
      modules: {}
    };
  }

  /* ---------- Photos (trombinoscope) : stockées à part, chiffrées avec la même clé, chargées à la demande ---------- */
  let photos = null, photosLoading = null;
  const photoApi = {
    get ready() { return photos !== null; },
    async load() {
      if (photos) return photos; if (!key) return {};
      return photosLoading ??= (async () => { const box = await kvGet('photos'); photos = box ? await open(key, box) : {}; photosLoading = null; return photos; })();
    },
    get(id) { return photos ? photos[id] || null : null; },
    count() { return photos ? Object.keys(photos).filter(k => !k.startsWith('arch:')).length : 0; },
    // renomme ou retire des photos en une seule écriture (circonscription mise de côté : clés « arch:<id>:<personne> »)
    async remap(fn) { await photoApi.load(); const out = {}; for (const [k, v] of Object.entries(photos)) { const k2 = fn(k); if (k2) out[k2] = v; } photos = out; await kvSet('photos', await seal(key, photos)); emit('saved'); },
    async clear() { photos = {}; await kvSet('photos', await seal(key, photos)); emit('saved'); },
    async set(id, dataUrl) { await photoApi.load(); if (dataUrl) photos[id] = dataUrl; else delete photos[id]; await kvSet('photos', await seal(key, photos)); emit('saved'); },
    async setMany(map) { await photoApi.load(); Object.assign(photos, map); await kvSet('photos', await seal(key, photos)); emit('saved'); },
    async prune(ids) { await photoApi.load(); let n = 0; for (const id of Object.keys(photos)) if (!ids.has(id)) { delete photos[id]; n++; } if (n) await kvSet('photos', await seal(key, photos)); return n; }
  };

  /* ---------- Documents joints (organigrammes, groupes de prédication…) ----------
     Un enregistrement chiffré par document (kv « doc:<id> »), lu seulement à l'ouverture ;
     la liste (nom, type, taille, assemblée…) est dans data.docs. */
  async function sealBytes(k, bytes) { const iv = crypto.getRandomValues(new Uint8Array(12)); return {iv: b64(iv), ct: b64(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, bytes))}; }
  async function openBytes(k, box) { return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(box.iv)}, k, unb64(box.ct))); }
  const MIME = {pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png'};
  const docKeys = () => kv('readonly', s => s.getAllKeys()).then(ks => ks.filter(k => typeof k === 'string' && k.startsWith('doc:')).map(k => k.slice(4)));
  const docApi = {
    list(filter = {}) { return Object.entries(data?.docs || {}).map(([id, d]) => ({id, ...d})).filter(d => Object.entries(filter).every(([k, v]) => d[k] === v)); },
    async add(file, info = {}) {
      const bytes = new Uint8Array(await file.arrayBuffer()), id = uid(), ext = (file.name.split('.').pop() || '').toLowerCase();
      await kvSet('doc:' + id, await sealBytes(key, bytes));
      (data.docs ??= {})[id] = {...info, name: file.name, type: file.type || MIME[ext] || 'application/octet-stream', size: bytes.length, date: new Date().toISOString()};
      save(); return id;
    },
    async available(id) { return !!(await kvGet('doc:' + id)); },
    async blob(id) { const box = await kvGet('doc:' + id); if (!box) return null; return new Blob([await openBytes(key, box)], {type: data.docs?.[id]?.type || 'application/octet-stream'}); },
    async remove(id) { if (data.docs) delete data.docs[id]; (data.docsRemoved ??= {})[id] = new Date().toISOString(); await kv('readwrite', s => s.delete('doc:' + id)); save(); }
  };
  // Accès bruts (déjà chiffrés) pour la synchronisation et la sauvegarde
  const docBox = id => kvGet('doc:' + id), putDocBox = (id, box) => kvSet('doc:' + id, box), delDocBox = id => kv('readwrite', s => s.delete('doc:' + id));
  async function docBoxes() { const out = {}; for (const id of await docKeys()) out[id] = await docBox(id); return out; }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saving = saving.then(writeNow).catch(e => toast('Échec de l’enregistrement : ' + e.message, 'error')); }, 300);
  }
  async function writeNow() { if (key && data) { await kvSet('data', await seal(key, data)); emit('saved'); } }
  // Petits événements internes (utilisés par la synchronisation)
  const listeners = {};
  function on(ev, fn) { (listeners[ev] ??= []).push(fn); }
  function emit(ev, ...a) { for (const fn of listeners[ev] || []) { try { fn(...a); } catch (e) { console.warn(e); } } }
  async function flush() { clearTimeout(saveTimer); await saving; await writeNow(); }

  /* ---------- Verrouillage ---------- */
  let lastActivity = Date.now(), hiddenAt = null, lockTimer = null;
  const HIDE_GRACE_MS = 30000; // délai de grâce en arrière-plan (sélecteur de fichier, appel…)

  function touch() { lastActivity = Date.now(); }
  function checkIdle() {
    if (!key) return;
    const min = data?.settings?.autoLockMin || 5;
    if (Date.now() - lastActivity > min * 60000) lock('Verrouillée après inactivité.');
  }
  function onVisibility() {
    if (!key) return;
    if (document.hidden) hiddenAt = Date.now();
    else {
      if (data?.settings?.lockOnHide && hiddenAt && Date.now() - hiddenAt > HIDE_GRACE_MS) lock('Verrouillée pendant votre absence.');
      hiddenAt = null; checkIdle();
    }
  }

  async function lock(message) {
    if (key) { try { await flush(); } catch (e) {} emit('locking'); }
    key = null; data = null; photos = null; vault.forget();
    clearInterval(lockTimer);
    $$('dialog[open]').forEach(d => d.close());
    $('#main').innerHTML = ''; $('#sidebar').innerHTML = '';
    $('#app').classList.add('hidden');
    renderLock(message);
  }

  async function unlockWith(password) {
    const k = await deriveKey(password, unb64(meta.salt), meta.iterations);
    const box = await kvGet('data');
    data = await open(k, box);           // échoue si le mot de passe est faux
    key = k;
    migrate();
    afterUnlock();
  }

  async function createVault(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const vaultSalt = crypto.getRandomValues(new Uint8Array(16));
    meta = {app: 'mon-bureau', v: 1, iterations: ITERATIONS, salt: b64(salt), vaultSalt: b64(vaultSalt), created: new Date().toISOString()};
    key = await deriveKey(password, salt);
    data = emptyData();
    seedDefaults();
    const vkey = await deriveKey(password, vaultSalt);
    await kvSet('meta', meta);
    await kvSet('vault', await seal(vkey, {entries: []}));
    await writeNow();
    afterUnlock();
  }

  async function changePassword(oldPw, newPw) {
    const k = await deriveKey(oldPw, unb64(meta.salt), meta.iterations);
    await open(k, await kvGet('data')); // vérifie l'ancien mot de passe
    const oldVk = await deriveKey(oldPw, unb64(meta.vaultSalt), meta.iterations);
    const vaultData = await open(oldVk, await kvGet('vault'));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const vaultSalt = crypto.getRandomValues(new Uint8Array(16));
    const newMeta = {...meta, iterations: ITERATIONS, salt: b64(salt), vaultSalt: b64(vaultSalt)};
    const newKey = await deriveKey(newPw, salt);
    const newVk = await deriveKey(newPw, vaultSalt);
    const dataBox = await seal(newKey, data);
    const vaultBox = await seal(newVk, vaultData);
    const oldPhotos = await kvGet('photos'), photosBox = oldPhotos ? await seal(newKey, await open(k, oldPhotos)) : null;
    const docs = {}; for (const id of await docKeys()) docs[id] = await sealBytes(newKey, await openBytes(k, await docBox(id)));
    await kv('readwrite', s => { s.put(newMeta, 'meta'); s.put(dataBox, 'data'); s.put(vaultBox, 'vault'); if (photosBox) s.put(photosBox, 'photos'); for (const [id, b] of Object.entries(docs)) s.put(b, 'doc:' + id); });
    meta = newMeta; key = newKey; vault.forget(); emit('saved');
  }

  function migrate() {
    const base = emptyData();
    for (const k of Object.keys(base)) if (data[k] === undefined) data[k] = base[k];
    data.settings = {...base.settings, ...data.settings, profil: {...base.settings.profil, ...(data.settings.profil || {})}};
  }

  /* ---------- Coffre (second déverrouillage) ---------- */
  const vault = (() => {
    let vkey = null, vdata = null;
    return {
      get isOpen() { return !!vdata; },
      get entries() { return vdata ? vdata.entries : []; },
      async open(password) {
        const k = await deriveKey(password, unb64(meta.vaultSalt), meta.iterations);
        vdata = await open(k, await kvGet('vault')); vkey = k;
      },
      async save() { if (vkey && vdata) { await kvSet('vault', await seal(vkey, vdata)); emit('saved'); } },
      forget() { vkey = null; vdata = null; }
    };
  })();

  /* ---------- Écran de verrouillage ---------- */
  function renderLock(message) {
    const el = $('#lock'); el.classList.remove('hidden');
    const first = !meta;
    el.innerHTML = `
      <form class="lock-card stack" autocomplete="off">
        <img class="lock-logo" src="icon.svg" alt="">
        <div><h1>Mon Bureau</h1>
        <p>${first ? 'Bienvenue. Choisissez un mot de passe maître : il chiffre toutes vos données sur cet appareil.' : 'Saisissez votre mot de passe maître pour déverrouiller.'}</p></div>
        ${message ? `<div class="notice">${esc(message)}</div>` : ''}
        <label class="field"><span>Mot de passe maître</span><input type="password" name="pw" required minlength="${first ? 10 : 1}" autocomplete="${first ? 'new-password' : 'current-password'}" autofocus></label>
        ${first ? `<label class="field"><span>Confirmer le mot de passe</span><input type="password" name="pw2" required autocomplete="new-password"></label>
        <div class="notice warn small"><strong>Important :</strong> au moins 10 caractères. Si vous l’oubliez, personne ne pourra récupérer vos données, sauf à partir d’une sauvegarde dont vous connaissez le mot de passe.</div>` : ''}
        <div class="notice danger small hidden" id="lockErr"></div>
        <button class="btn primary" type="submit">${first ? 'Créer mon espace chiffré' : 'Déverrouiller'}</button>
        ${first ? `<button class="btn" type="button" id="restoreBtn">Restaurer une sauvegarde</button>` : ''}
        <p class="small muted" style="margin:0">Version ${VERSION} · données chiffrées sur cet appareil uniquement</p>
      </form>`;
    const form = $('form', el), err = $('#lockErr', el);
    const showErr = m => { err.textContent = m; err.classList.remove('hidden'); };
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const pw = form.pw.value, btn = $('button[type=submit]', form);
      if (first) {
        if (pw.length < 10) return showErr('Le mot de passe doit contenir au moins 10 caractères.');
        if (pw !== form.pw2.value) return showErr('Les deux mots de passe ne sont pas identiques.');
      }
      btn.disabled = true; btn.textContent = 'Un instant…';
      try { first ? await createVault(pw) : await unlockWith(pw); }
      catch (e) { if (first) console.error(e); btn.disabled = false; btn.textContent = first ? 'Créer mon espace chiffré' : 'Déverrouiller'; showErr(first ? 'Erreur : ' + e.message : 'Mot de passe incorrect.'); form.pw.select(); }
    });
    const rb = $('#restoreBtn', el);
    if (rb) rb.addEventListener('click', () => App.backup.restoreFlow());
    setTimeout(() => form.pw.focus(), 50);
  }

  function afterUnlock() {
    $('#lock').classList.add('hidden'); $('#lock').innerHTML = '';
    $('#app').classList.remove('hidden');
    touch(); clearInterval(lockTimer); lockTimer = setInterval(checkIdle, 15000);
    renderNav(); route();
    emit('unlocked');
  }

  /* ---------- Synchronisation : échange des enregistrements déjà chiffrés ---------- */
  async function getBoxes() {
    if (key) await flush();
    const [m, d, v, ph] = await Promise.all([kvGet('meta'), kvGet('data'), kvGet('vault'), kvGet('photos')]);
    return {meta: m, data: d, vault: v, photos: ph || null};
  }
  // Remplace les données de cet appareil par celles reçues (même mot de passe, même sel), sans déverrouiller à nouveau
  async function adoptRemote(file) {
    if (!key) throw new Error('verrouillé');
    const d = await open(key, file.data);
    clearTimeout(saveTimer); await saving.catch(() => {});
    await kv('readwrite', s => { s.put(file.data, 'data'); s.put(file.vault, 'vault'); if (file.photos) s.put(file.photos, 'photos'); else s.delete('photos'); });
    // Un document présent ici mais absent de la version reçue (perdu lors d'un conflit) : on le garde, sauf s'il a été retiré exprès
    const prev = data?.docs || {}, held = new Set(await docKeys()); let kept = 0;
    data = d; photos = null; vault.forget();
    // (sauf les documents d'une circonscription mise de côté : ils sont rangés avec elle)
    const parked = new Set((data.circos || []).flatMap(a => Object.keys(a.docs || {})));
    for (const [id, m] of Object.entries(prev)) if (held.has(id) && !data.docs?.[id] && !data.docsRemoved?.[id] && !parked.has(id)) { (data.docs ??= {})[id] = m; kept++; }
    if (kept) save();
    renderNav(); route();
  }

  /* ---------- Skills ---------- */
  const skills = [];
  function registerSkill(def) {
    const s = {group: 'metier', status: 'actif', order: 50, version: '1.0', description: '', ...def};
    skills.push(s); skills.sort((a, b) => a.order - b.order);
  }
  const isEnabled = s => s.status === 'actif' && (s.group === 'socle' || !data.skills.disabled[s.id]);
  const moduleData = (id, init = {}) => (data.modules[id] ??= init);

  /* ---------- Navigation ---------- */
  function renderNav() {
    const nav = $('#sidebar');
    const current = (location.hash.slice(2) || 'accueil').split('/')[0];
    const link = s => `<a class="nav ${s.id === current ? 'active' : ''} ${s.status !== 'actif' ? 'soon' : ''}" href="#/${s.id}">
        <span class="ico">${s.icon || '•'}</span>${esc(s.name)}${s.status !== 'actif' ? '<span class="tag">bientôt</span>' : ''}</a>`;
    const socle = skills.filter(s => s.group === 'socle' && !s.hidden);
    const metier = skills.filter(s => s.group !== 'socle' && (s.status !== 'actif' || isEnabled(s)));
    nav.innerHTML = `<div class="brand"><img src="icon.svg" alt="">Mon Bureau</div>${App.circoArchive ? App.circoArchive.navSelect() : ''}
      ${socle.filter(s => s.position !== 'bas').map(link).join('')}
      <div class="group">Skills</div>${metier.map(link).join('') || '<span class="small muted" style="padding:4px 10px">Aucun skill actif</span>'}
      <div class="spacer"></div>
      ${socle.filter(s => s.position === 'bas').map(link).join('')}
      <a class="nav" href="#" data-action="lock"><span class="ico">🔒</span>Verrouiller</a>`;
    if (App.circoArchive) App.circoArchive.bindNav(nav);
  }
  function route() {
    if (!key) return;
    const [id, ...rest] = (location.hash.slice(2) || 'accueil').split('/');
    const s = skills.find(x => x.id === id) || skills.find(x => x.id === 'accueil');
    const old = $('#main'); const main = old.cloneNode(false); old.replaceWith(main); // repart d'un conteneur sans écouteurs
    $('#sidebar').classList.remove('open');
    renderNav();
    if (s.id !== 'coffre') vault.forget(); // quitter le coffre le referme
    try { s.mount(main, api, rest); } catch (e) { console.error(e); main.innerHTML = `<div class="notice danger">Erreur dans le skill « ${esc(s.name)} » : ${esc(e.message)}</div>`; }
    main.scrollTop = 0; window.scrollTo(0, 0);
  }

  /* ---------- Interface ---------- */
  function toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3000);
  }
  // Boîte de dialogue : renvoie une promesse résolue par la valeur passée à close().
  function modal({title, body, actions = [{label: 'Fermer', value: null}], wide = false, onMount}) {
    return new Promise(resolve => {
      const d = document.createElement('dialog');
      if (wide) d.style.width = 'min(1000px,96vw)';
      d.innerHTML = `<div class="d-head"><h2>${esc(title)}</h2><button class="btn ghost" data-x aria-label="Fermer">✕</button></div>
        <div class="d-body"></div><div class="d-foot"></div>`;
      const bodyEl = $('.d-body', d);
      if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
      const foot = $('.d-foot', d);
      let result = null;
      const close = v => { result = v; d.close(); };
      actions.forEach(a => {
        const b = document.createElement('button'); b.className = 'btn ' + (a.kind || ''); b.textContent = a.label;
        b.addEventListener('click', async () => {
          if (a.onClick) { const r = await a.onClick(bodyEl, close); if (r === false) return; if (r !== undefined) return close(r); }
          close(a.value);
        });
        foot.appendChild(b);
      });
      $('[data-x]', d).addEventListener('click', () => close(null));
      d.addEventListener('close', () => { d.remove(); resolve(result); });
      document.body.appendChild(d); d.showModal();
      if (onMount) onMount(bodyEl, close);
    });
  }
  const confirmBox = (title, text, okLabel = 'Confirmer', danger = false) =>
    modal({title, body: `<p>${esc(text)}</p>`, actions: [{label: 'Annuler', value: false}, {label: okLabel, value: true, kind: danger ? 'danger' : 'primary'}]});
  function askPassword(title, text) {
    return modal({title, body: `<form class="stack" onsubmit="return false"><p>${esc(text)}</p><label class="field"><span>Mot de passe maître</span><input type="password" name="pw" autocomplete="current-password"></label></form>`,
      actions: [{label: 'Annuler', value: null}, {label: 'Valider', kind: 'primary', onClick: b => $('input', b).value || false}],
      onMount: (b, close) => { const i = $('input', b); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); close(i.value); } }); }});
  }
  function download(name, blobOrBytes, type = 'application/octet-stream') {
    const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], {type});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function pickFile(accept) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
      i.style.display = 'none'; document.body.appendChild(i);
      const done = v => { res(v); setTimeout(() => i.remove(), 0); };
      // Safari (iPhone, iPad, Mac) : le fichier devient illisible une fois le champ retiré de la page
      // (« The object can not be found here ») → on le copie en mémoire avant de retirer le champ.
      i.addEventListener('change', async () => { const f = i.files[0]; if (!f) return done(null);
        try { done(new File([await f.arrayBuffer()], f.name, {type: f.type, lastModified: f.lastModified})); }
        catch (e) { toast('Fichier illisible : ' + e.message + '. S’il est dans iCloud ou Dropbox, téléchargez-le d’abord sur l’appareil.', 'error'); done(null); } });
      i.addEventListener('cancel', () => done(null));
      i.click();
    });
  }

  /* ---------- API offerte aux skills ---------- */
  const api = {
    get data() { return data; },
    save, flush, moduleData, toast, modal, confirm: confirmBox, askPassword, download, pickFile,
    esc, uid, norm, $, $$, dateLongue, dateCourte,
    navigate: h => { location.hash = h; },
    refreshNav: () => renderNav(),
    get vault() { return vault; },
    photos: photoApi,
    docs: docApi,
    get meta() { return meta; },
    changePassword, lock,
    get skills() { return skills; }, isEnabled
  };

  /* ---------- Démarrage ---------- */
  async function start() {
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action="lock"]'); if (a) { e.preventDefault(); lock(); }
    });
    $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, touch, {passive: true, capture: true}));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', () => { if (key) writeNow(); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).catch(() => {});
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    try { meta = await kvGet('meta'); }
    catch (e) { document.body.innerHTML = `<p style="padding:24px">Le stockage local est indisponible dans ce navigateur (${esc(e.message)}).</p>`; return; }
    renderLock();
  }

  /* ---------- Contenu de départ ---------- */
  function seedDefaults() {
    data.templates.push({
      id: uid(), name: 'Lettre type', category: 'Général', updated: new Date().toISOString(),
      body: `<p style="text-align:left"><b>{{exp_entete}}</b></p><p>{{exp_prenom}} {{exp_nom}} – {{exp_telephone}} – {{exp_email}}</p><p><br></p>` +
        `<p style="text-align:right">Le {{date_jour}}</p><p><br></p><p><b>Objet : </b>…</p><p><br></p>` +
        `<p>{{civilite}} {{prenom}} {{nom}}</p><p>{{assemblee}}</p><p><br></p><p>Cher {{prenom}},</p>` +
        `<p>Votre texte ici. Les champs entre accolades sont remplacés automatiquement pour chaque personne.</p><p><br></p>` +
        `<p>Reçois ma profonde affection fraternelle,</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p>`
    });
  }

  // Remplacement de toute la base (utilisé par la restauration).
  async function replaceAll(records) {
    // Oublier les données en mémoire : sinon l'enregistrement automatique (minuterie ou fermeture de page)
    // réécrirait les anciennes données par-dessus celles qu'on vient de restaurer.
    clearTimeout(saveTimer); await saving.catch(() => {}); key = null; data = null; photos = null;
    await kv('readwrite', s => { s.clear(); for (const [k, v] of Object.entries(records)) s.put(v, k); });
  }

  return {VERSION, start, registerSkill, api, kvGet, kvSet, kvClear, replaceAll, deriveKey, open, unb64, on, getBoxes, adoptRemote, docKeys, docBox, putDocBox, delDocBox, docBoxes,
          get meta() { return meta; }, set meta(m) { meta = m; }, renderLock};
})();

/* Coller dans une lettre : le texte prend la police, la taille et la couleur de l'endroit où il est collé
   (la mise en forme du document d'origine — Word, mail, site — n'est pas reprise). */
document.addEventListener('paste', e => {
  const ed = e.target.closest && e.target.closest('[contenteditable="true"]');
  if (!ed || !e.clipboardData) return;
  const txt = e.clipboardData.getData('text/plain');
  if (!txt) return;
  e.preventDefault();
  const lines = txt.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '').split('\n');
  lines.forEach((l, i) => { if (i) document.execCommand('insertParagraph'); if (l) document.execCommand('insertText', false, l.replace(/\t/g, ' ')); });
}, true);

/* « Uniformiser » : le texte sélectionné reprend la police, la taille et la couleur du paragraphe
   (gras, italique, souligné et alignement sont conservés). Sans sélection : le paragraphe où se trouve le curseur. */
window.uniformiser = function (ed) {
  const sel = getSelection(); if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return;
  const rg = sel.getRangeAt(0);
  const blockOf = n => { while (n && n !== ed && !(n.nodeType === 1 && /^(P|LI|DIV|H\d)$/.test(n.tagName))) n = n.parentNode; return n && n !== ed ? n : null; };
  const roots = rg.collapsed ? [blockOf(rg.startContainer)].filter(Boolean) : [ed];
  for (const root of roots) {
    for (const x of [...root.querySelectorAll('span,font')]) {
      if (x.dataset.champ !== undefined || x.dataset.f !== undefined || x.contentEditable === 'false') continue;
      if (!rg.collapsed && !rg.intersectsNode(x)) continue;
      ['font-family', 'font-size', 'color', 'background', 'background-color', 'line-height', 'letter-spacing'].forEach(k => x.style.removeProperty(k));
      if (x.tagName === 'FONT' || !x.getAttribute('style')) x.replaceWith(...x.childNodes);
    }
    for (const b of root === ed ? ed.querySelectorAll('p,li,div,h1,h2,h3') : [root]) if (rg.collapsed || rg.intersectsNode(b)) { b.style.removeProperty('font-family'); b.style.removeProperty('color'); }
  }
  ed.dispatchEvent(new Event('input', {bubbles: true}));
};
