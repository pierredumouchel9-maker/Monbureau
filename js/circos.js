'use strict';
/* Plusieurs circonscriptions dans la même application.
   La circonscription active occupe les emplacements habituels (annuaire, assemblées, Circonscription, Itinéraire, Territoires,
   documents d'assemblée). Les autres sont rangées, complètes, dans data.circos (chiffrées et synchronisées comme le reste) :
   en changer range l'active et ressort l'autre, sans rien perdre. Leurs photos restent dans le même coffre de photos,
   sous des clés « arch:<id>:<personne> ». Le profil, les modèles de courriers, le coffre et les réglages sont communs. */
App.circoArchive = (() => {
  const api = App.api, MODS = ['circonscription', 'itineraire', 'territoires', 'reunionpp', 'emr'], SIX_MOIS = 182 * 864e5;
  const list = () => (api.data.circos ??= []);
  const active = () => { const c = (api.data.settings.circo ??= {code: '', nom: ''}); c.id ??= api.uid(); return c; };
  const label = c => [c.code, c.nom].filter(Boolean).join(' — ') || 'Circonscription sans nom';

  // Range la circonscription active dans data.circos et vide les emplacements
  async function park() {
    const d = api.data, a = active();
    const docs = Object.fromEntries(api.docs.list().filter(x => x.kind !== 's302form').map(({id, ...m}) => [id, m]));
    const snap = {id: a.id, code: a.code || '', nom: a.nom || '', entete: d.settings.profil.entete || '', persons: d.persons, congregations: d.congregations,
      modules: Object.fromEntries(MODS.filter(m => d.modules[m]).map(m => [m, d.modules[m]])), docs, rangeeLe: new Date().toISOString()};
    for (const id of Object.keys(docs)) delete d.docs[id];
    d.persons = []; d.congregations = []; for (const m of MODS) delete d.modules[m];
    await api.photos.remap(k => k.startsWith('arch:') ? k : `arch:${snap.id}:${k}`);
    list().push(snap);
    return snap;
  }
  // Ressort une circonscription rangée
  async function unpark(id) {
    const d = api.data, i = list().findIndex(x => x.id === id); if (i < 0) throw new Error('circonscription introuvable');
    const e = list()[i];
    d.persons = e.persons || []; d.congregations = e.congregations || [];
    for (const [m, v] of Object.entries(e.modules || {})) d.modules[m] = v;
    d.docs ??= {}; Object.assign(d.docs, e.docs || {});
    d.settings.circo = {id: e.id, code: e.code, nom: e.nom}; if (e.entete) d.settings.profil.entete = e.entete;
    const pre = `arch:${e.id}:`; await api.photos.remap(k => k.startsWith(pre) ? k.slice(pre.length) : k);
    list().splice(i, 1);
  }
  const refresh = () => { if (location.hash === '#/accueil') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/accueil'; };

  async function switchTo(id) {
    const e = list().find(x => x.id === id); if (!e) return;
    await api.flush(); await park(); await unpark(id); api.save(); await api.flush();
    api.toast(`Circonscription ${label(e)} ouverte`); refresh();
  }
  async function createNew({code, nom, entete, keepLetter}) {
    const d = api.data;
    if (keepLetter) {   // la dernière lettre aux anciens devient le modèle de départ de la nouvelle circonscription
      const ys = (d.modules.itineraire?.annees || []).slice().sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
      let last = null; for (const A of ys) for (const h of ['A', 'B']) if (A.lettres?.[h]?.avec) last = A.lettres[h].avec;
      if (last) { let t = d.templates.find(x => x.role === 'itin-cour'); if (!t) { t = {id: api.uid(), role: 'itin-cour', name: 'Lettre aux anciens', category: 'Semaine spéciale'}; d.templates.push(t); } t.body = last; t.updated = new Date().toISOString(); }
    }
    await api.flush(); const old = await park();
    // vos lettres de la réunion des pionniers (orateurs, invitation) servent de point de départ à la nouvelle circonscription
    const lastR = (old.modules?.reunionpp?.reunions || []).filter(r => r.lettres && Object.keys(r.lettres).length).at(-1);
    if (lastR) d.modules.reunionpp = {reunions: [], lettresDepart: JSON.parse(JSON.stringify(lastR.lettres))};
    d.settings.circo = {id: api.uid(), code, nom}; if (entete !== undefined) d.settings.profil.entete = entete;
    api.save(); await api.flush(); refresh();
  }
  // Suppression définitive d'une circonscription rangée (documents compris, sur tous les appareils synchronisés)
  async function remove(id) {
    const d = api.data, i = list().findIndex(x => x.id === id); if (i < 0) return;
    const e = list()[i];
    for (const [docId, m] of Object.entries(e.docs || {})) { d.docs[docId] = m; try { await api.docs.remove(docId); } catch (err) { console.warn(err); } }
    const pre = `arch:${e.id}:`; await api.photos.remap(k => k.startsWith(pre) ? null : k);
    list().splice(i, 1); api.save(); await api.flush();
  }
  const recent = e => Date.now() - new Date(e.rangeeLe || 0) < SIX_MOIS;
  // Choix de la circonscription dans la barre latérale (seulement s'il y en a plusieurs)
  function navSelect() {
    if (!api.data) return '';
    const a = active();
    if (!list().length) return a.code || a.nom ? `<div class="small muted" style="margin:-4px 12px 10px;font-weight:600" title="Circonscription">${api.esc(label(a))}</div>` : '';
    return `<select id="navCirco" title="Changer de circonscription" style="margin:0 10px 8px;width:calc(100% - 20px);font-size:13px;padding:4px 6px">
      <option value="">${api.esc(label(a))}</option>${list().map(e => `<option value="${e.id}">${api.esc(label(e))}</option>`).join('')}</select>`;
  }
  function bindNav(nav) {
    const s = nav.querySelector('#navCirco'); if (!s) return;
    s.addEventListener('change', async () => { const id = s.value; if (!id) return; s.disabled = true; try { await switchTo(id); } catch (e) { api.toast('Changement impossible : ' + e.message, 'error'); } });
  }
  return {list, active, label, switchTo, createNew, remove, recent, navSelect, bindNav, banner() {}};
})();

// Nom de la circonscription pour les documents produits : « Circonscription NM01 — Normandie 01 »
App.circoNom = () => { const c = App.api.data?.settings?.circo || {}, t = [c.code, c.nom].filter(Boolean).join(' — '); return t ? `Circonscription ${t}` : ''; };
App.circoPied = () => App.circoNom() ? ` · ${App.circoNom()}` : '';
