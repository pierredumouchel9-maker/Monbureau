'use strict';
/* Synchronisation par Dropbox.
   Seuls des enregistrements DÉJÀ CHIFFRÉS (base, coffre, photos) sont envoyés : Dropbox ne peut pas les lire.
   L'application n'a accès qu'à son propre dossier (Applications › <nom de l'app Dropbox>).
   Connexion OAuth « PKCE » sans serveur : on colle le code affiché par Dropbox.
   État local (non secret, propre à l'appareil) : kv 'syncState' ; autorisation Dropbox : kv 'syncAuth'. */
App.dropbox = (() => {
  const api = App.api, FILE = '/monbureau.sync';
  const AUTH = 'https://www.dropbox.com/oauth2/authorize', TOKEN = 'https://api.dropboxapi.com/oauth2/token';
  let access = null, pushTimer = null, busy = null;

  const getAuth = async () => (await App.kvGet('syncAuth')) || {};
  const setAuth = a => App.kvSet('syncAuth', a);
  const getState = async () => (await App.kvGet('syncState')) || {};
  const setState = async patch => { const s = {...(await getState()), ...patch}; await App.kvSet('syncState', s); return s; };
  const device = () => /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone / iPad' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Ordinateur';
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function connected() { const a = await getAuth(); return !!(a.appKey && a.refresh); }

  /* ----- Connexion ----- */
  // Doit être appelé pendant le clic (ouverture d'un nouvel onglet)
  function authStart(appKey) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const win = window.open('about:blank', '_blank');
    return (async () => {
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      await setAuth({...(await getAuth()), appKey: appKey.trim(), verifier});
      const url = `${AUTH}?client_id=${encodeURIComponent(appKey.trim())}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&token_access_type=offline`;
      if (win) win.location = url; else location.assign(url);
    })();
  }
  async function authFinish(code) {
    const a = await getAuth();
    const r = await fetch(TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({code: code.trim(), grant_type: 'authorization_code', code_verifier: a.verifier, client_id: a.appKey})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || 'code refusé par Dropbox');
    access = {token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000};
    await setAuth({appKey: a.appKey, refresh: j.refresh_token, account: j.account_id || ''});
    await setState({rev: undefined, dirty: true, error: ''});
  }
  async function disconnect() { access = null; await setAuth({}); await setState({rev: undefined, error: '', lastSync: null}); }

  async function token() {
    if (access && access.exp > Date.now()) return access.token;
    const a = await getAuth(); if (!a.refresh) throw new Error('Dropbox n’est pas connecté');
    const r = await fetch(TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: a.refresh, client_id: a.appKey})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || 'connexion Dropbox expirée : reconnectez Dropbox');
    access = {token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000};
    return access.token;
  }

  /* ----- Appels Dropbox ----- */
  async function remoteMeta() {
    const r = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {method: 'POST', headers: {Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json'}, body: JSON.stringify({path: FILE})});
    if (r.status === 409) return null;   // pas encore de fichier
    if (!r.ok) throw new Error('Dropbox : ' + r.status);
    return r.json();
  }
  async function download() {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', {method: 'POST', headers: {Authorization: 'Bearer ' + await token(), 'Dropbox-API-Arg': JSON.stringify({path: FILE})}});
    if (!r.ok) throw new Error('Dropbox (lecture) : ' + r.status);
    return JSON.parse(await r.text());
  }
  async function upload(rev) {
    const b = await App.getBoxes();
    const file = {format: 'mon-bureau-sync', version: 1, updatedAt: new Date().toISOString(), device: device(), app: App.VERSION,
      meta: {salt: b.meta.salt, vaultSalt: b.meta.vaultSalt, iterations: b.meta.iterations}, data: b.data, vault: b.vault, photos: b.photos};
    const mode = rev ? {'.tag': 'update', update: rev} : 'add';
    const r = await fetch('https://content.dropboxapi.com/2/files/upload', {method: 'POST', headers: {Authorization: 'Bearer ' + await token(),
      'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({path: FILE, mode, mute: true})}, body: JSON.stringify(file)});
    if (r.status === 409) return {conflict: true};
    if (!r.ok) throw new Error('Dropbox (envoi) : ' + r.status);
    const j = await r.json(); return {rev: j.rev};
  }

  /* ----- Synchronisation ----- */
  function sync(opts = {}) { return busy ??= run(opts).finally(() => { busy = null; }); }
  async function run({quiet = false} = {}) {
    if (!(await connected())) return;
    let st = await getState();
    try {
      const rm = await remoteMeta();
      if (!rm) {                                   // premier envoi
        const up = await upload(null); if (up.conflict) return run({quiet});
        st = await setState({rev: up.rev, dirty: false, lastSync: new Date().toISOString(), error: ''});
      } else if (rm.rev === st.rev) {             // Dropbox n'a pas changé
        if (st.dirty) { const up = await upload(st.rev); if (up.conflict) return run({quiet}); await setState({rev: up.rev, dirty: false, lastSync: new Date().toISOString(), error: ''}); }
        else await setState({lastSync: new Date().toISOString(), error: ''});
      } else {                                     // Dropbox a changé depuis la dernière synchronisation
        const file = await download();
        if (file.meta.salt !== App.meta.salt) return otherPassword(file, rm.rev);
        if (st.dirty || st.rev === undefined) {
          const choice = await conflict(file, st);
          if (choice === 'local') { const up = await upload(rm.rev); if (up.conflict) return run({quiet}); await setState({rev: up.rev, dirty: false, lastSync: new Date().toISOString(), error: ''}); }
          else if (choice === 'remote') { await App.adoptRemote(file); await setState({rev: rm.rev, dirty: false, lastSync: new Date().toISOString(), error: ''}); api.toast('Données reçues de Dropbox'); }
          return;
        }
        await App.adoptRemote(file);
        await setState({rev: rm.rev, dirty: false, lastSync: new Date().toISOString(), error: ''});
        if (!quiet) api.toast(`Données mises à jour depuis ${file.device || 'un autre appareil'}`);
      }
      if (!quiet) api.toast('Synchronisé avec Dropbox');
    } catch (e) {
      await setState({error: e.message});
      if (!quiet) api.toast('Synchronisation impossible : ' + e.message, 'error');
    }
  }
  async function conflict(file, st) {
    const fmt = d => d ? api.dateCourte(d) + ' ' + new Date(d).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) : '—';
    return api.modal({title: 'Deux versions différentes', actions: [{label: 'Plus tard', value: null}, {label: 'Garder cet appareil', value: 'local'}, {label: 'Prendre la version Dropbox', kind: 'primary', value: 'remote'}],
      body: `<p>Les données ont été modifiées <strong>sur cet appareil</strong> et <strong>sur ${api.esc(file.device || 'un autre appareil')}</strong> depuis la dernière synchronisation.</p>
        <ul class="small"><li>Version Dropbox : envoyée le ${fmt(file.updatedAt)} depuis ${api.esc(file.device || '—')}</li><li>Cet appareil : dernière synchronisation le ${fmt(st.lastSync)}</li></ul>
        <p class="small">Choisissez la version à garder : l’autre sera remplacée. Pour ne rien perdre, faites d’abord une sauvegarde (menu Sauvegarde).</p>`});
  }
  // Les données Dropbox ont été chiffrées avec un autre mot de passe (autre appareil configuré à part, ou mot de passe changé)
  async function otherPassword(file, rev) {
    const pw = await api.askPassword('Données Dropbox', `Les données de Dropbox (envoyées depuis ${file.device || 'un autre appareil'}) utilisent un autre mot de passe. Saisissez ce mot de passe pour les récupérer sur cet appareil : elles remplaceront les données actuelles, et ce mot de passe deviendra celui de cet appareil.`);
    if (!pw) return;
    try { const k = await App.deriveKey(pw, App.unb64(file.meta.salt), file.meta.iterations); await App.open(k, file.data); }
    catch { return api.toast('Mot de passe incorrect pour les données Dropbox.', 'error'); }
    const meta = {...App.meta, salt: file.meta.salt, vaultSalt: file.meta.vaultSalt, iterations: file.meta.iterations};
    const auth = await getAuth();
    await App.replaceAll({meta, data: file.data, vault: file.vault, ...(file.photos ? {photos: file.photos} : {}), syncAuth: auth, syncState: {rev, dirty: false, lastSync: new Date().toISOString()}});
    api.toast('Données Dropbox récupérées'); setTimeout(() => location.reload(), 600);
  }

  // Envoi automatique quelques secondes après chaque enregistrement, et à la mise en arrière-plan
  App.on('saved', async () => {
    if (!(await connected())) return;
    await setState({dirty: true});
    clearTimeout(pushTimer); pushTimer = setTimeout(() => sync({quiet: true}), 8000);
  });
  App.on('unlocked', () => { setTimeout(() => sync({quiet: true}), 500); });
  App.on('locking', () => { clearTimeout(pushTimer); sync({quiet: true}); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); getState().then(s => { if (s.dirty) sync({quiet: true}); }); } });

  /* ----- Carte « Synchronisation » des Paramètres ----- */
  async function card(el) {
    const a = await getAuth(), st = await getState(), on = !!(a.appKey && a.refresh);
    const fmt = d => d ? api.dateCourte(d) + ' à ' + new Date(d).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) : 'jamais';
    el.innerHTML = `<strong>Synchronisation entre vos appareils (Dropbox)</strong>
      <p class="small muted" style="margin:0">Les données sont envoyées <strong>déjà chiffrées</strong> avec votre mot de passe : Dropbox ne peut pas les lire. L’application n’accède qu’à son propre dossier dans votre Dropbox.</p>
      ${on ? `<p class="small" style="margin:0">✅ Connecté · dernière synchronisation : <strong>${fmt(st.lastSync)}</strong>${st.dirty ? ' · modifications en attente d’envoi' : ''}${st.error ? `<br><span style="color:var(--danger)">Dernier problème : ${api.esc(st.error)}</span>` : ''}</p>
        <div class="row"><button class="btn primary" id="dbSync">Synchroniser maintenant</button><button class="btn" id="dbOff">Déconnecter</button></div>`
      : `<details class="small"><summary style="cursor:pointer"><strong>Créer l’accès Dropbox (une seule fois, sur un ordinateur)</strong></summary><ol style="margin:6px 0 0 18px;padding:0">
          <li>Ouvrez <strong>dropbox.com/developers/apps</strong> et connectez-vous à votre compte Dropbox.</li>
          <li>« Create app » : <strong>Scoped access</strong>, puis <strong>App folder</strong>, nom libre (ex. « MonBureau-Pierre »).</li>
          <li>Onglet <strong>Permissions</strong> : cochez <code>files.metadata.read</code>, <code>files.content.write</code> et <code>files.content.read</code>, puis « Submit ».</li>
          <li>Onglet <strong>Settings</strong> : copiez l’<strong>App key</strong> et collez-la ci-dessous.</li></ol></details>
        <label class="field" style="max-width:360px"><span>App key Dropbox</span><input id="dbKey" value="${api.esc(a.appKey || '')}" autocomplete="off" spellcheck="false"></label>
        <div class="row"><button class="btn primary" id="dbGo">1. Autoriser dans Dropbox</button></div>
        <label class="field" style="max-width:360px"><span>2. Code affiché par Dropbox</span><input id="dbCode" autocomplete="off" spellcheck="false"></label>
        <div class="row"><button class="btn" id="dbOk">Valider le code</button></div>
        <p class="small muted" style="margin:0">Sur chaque autre appareil (iPhone, Android…), restaurez d’abord une sauvegarde, puis connectez Dropbox avec la même App key.</p>`}`;
    if (on) {
      api.$('#dbSync', el).onclick = async () => { await sync(); card(el); };
      api.$('#dbOff', el).onclick = async () => { if (await api.confirm('Déconnecter Dropbox', 'Cet appareil ne se synchronisera plus. Le fichier reste dans votre Dropbox.', 'Déconnecter', true)) { await disconnect(); card(el); } };
    } else {
      api.$('#dbGo', el).onclick = () => { const k = api.$('#dbKey', el).value.trim(); if (!k) return api.toast('Collez d’abord l’App key', 'error'); authStart(k); };
      api.$('#dbOk', el).onclick = async () => {
        const c = api.$('#dbCode', el).value.trim(); if (!c) return api.toast('Collez le code affiché par Dropbox', 'error');
        try { await authFinish(c); api.toast('Dropbox connecté'); await sync(); card(el); }
        catch (e) { api.toast('Connexion refusée : ' + e.message, 'error'); }
      };
    }
  }
  return {sync, card, connected, authStart, authFinish, disconnect};
})();
