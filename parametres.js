'use strict';
App.registerSkill({
  id: 'parametres', name: 'Paramètres', icon: '⚙️', group: 'socle', order: 91, position: 'bas',
  description: 'Profil, verrouillage, mot de passe.',
  mount(el, api) {
    const s = api.data.settings, p = s.profil;
    el.innerHTML = `<div class="page-head"><div><h1>Paramètres</h1></div></div>
      <div class="stack" style="max-width:820px">
        <form class="card stack" id="fProfil" onsubmit="return false"><strong>Mon profil (expéditeur des lettres)</strong>
          <div class="form-grid">
            <label class="field"><span>Prénom</span><input type="text" name="prenom" value="${api.esc(p.prenom)}"></label>
            <label class="field"><span>Nom</span><input type="text" name="nom" value="${api.esc(p.nom)}"></label>
            <label class="field"><span>Fonction</span><input type="text" name="fonction" value="${api.esc(p.fonction)}"></label>
            <label class="field"><span>Téléphone</span><input type="tel" name="telephone" value="${api.esc(p.telephone)}"></label>
            <label class="field"><span>Mail</span><input type="email" name="email" value="${api.esc(p.email)}"></label>
            <label class="field"><span>Prénom de mon épouse</span><input type="text" name="epouse" value="${api.esc(p.epouse || '')}" placeholder="pour son programme de prédication"></label>
            <label class="field wide"><span>En-tête des lettres</span><input type="text" name="entete" value="${api.esc(p.entete)}" placeholder="Ex. : CIRCONSCRIPTION …"></label>
          </div>
          <div><button class="btn primary" id="pSave">Enregistrer le profil</button></div></form>

        <div class="card stack" id="cCirco"></div>

        <div class="card stack"><strong>Verrouillage</strong>
          <label class="field" style="max-width:320px"><span>Verrouiller après une inactivité de</span>
            <select id="sIdle">${[1, 2, 5, 10, 15, 30].map(m => `<option value="${m}" ${s.autoLockMin === m ? 'selected' : ''}>${m} minute${m > 1 ? 's' : ''}</option>`).join('')}</select></label>
          <label class="row small"><input type="checkbox" id="sHide" ${s.lockOnHide ? 'checked' : ''}> Verrouiller quand l’application reste plus de 30 secondes en arrière-plan</label>
        </div>

        <div class="card stack" id="cSync"></div>

        <form class="card stack" id="fPw" onsubmit="return false"><strong>Changer le mot de passe maître</strong>
          <div class="form-grid">
            <label class="field"><span>Mot de passe actuel</span><input type="password" name="old" autocomplete="current-password"></label>
            <label class="field"><span>Nouveau mot de passe (10 caractères min.)</span><input type="password" name="n1" autocomplete="new-password"></label>
            <label class="field"><span>Confirmer</span><input type="password" name="n2" autocomplete="new-password"></label>
          </div>
          <div><button class="btn" id="pwBtn">Changer le mot de passe</button></div></form>

        <div class="card stack"><strong>Informations</strong>
          <p class="small muted" style="margin:0">Version ${App.VERSION} · Chiffrement AES-GCM 256 bits · Clé dérivée par PBKDF2-SHA-256 (${(api.meta.iterations || 0).toLocaleString('fr-FR')} itérations) · Espace créé le ${api.dateCourte(api.meta.created)}</p></div>

        <div class="card stack" style="border-color:var(--danger)"><strong style="color:var(--danger)">Zone sensible</strong>
          <p class="small muted" style="margin:0">Efface définitivement toutes les données de cet appareil. Faites d’abord une sauvegarde.</p>
          <div><button class="btn danger" id="wipe">Effacer toutes les données</button></div></div>
      </div>`;
    if (App.dropbox) App.dropbox.card(api.$('#cSync', el));
    circoCard(api.$('#cCirco', el), api);
    api.$('#pSave', el).addEventListener('click', () => {
      const f = api.$('#fProfil', el); for (const k of Object.keys(p)) if (f[k]) p[k] = f[k].value.trim();
      api.save(); api.toast('Profil enregistré');
    });
    api.$('#sIdle', el).addEventListener('change', e => { s.autoLockMin = Number(e.target.value); api.save(); api.toast('Réglage enregistré'); });
    api.$('#sHide', el).addEventListener('change', e => { s.lockOnHide = e.target.checked; api.save(); api.toast('Réglage enregistré'); });
    api.$('#pwBtn', el).addEventListener('click', async () => {
      const f = api.$('#fPw', el), btn = api.$('#pwBtn', el);
      if (f.n1.value.length < 10) return api.toast('Le nouveau mot de passe doit contenir au moins 10 caractères.', 'error');
      if (f.n1.value !== f.n2.value) return api.toast('Les deux nouveaux mots de passe sont différents.', 'error');
      btn.disabled = true; btn.textContent = 'Chiffrement en cours…';
      try { await api.flush(); await api.changePassword(f.old.value, f.n1.value); f.reset(); api.toast('Mot de passe changé. Pensez à refaire une sauvegarde.'); }
      catch { api.toast('Mot de passe actuel incorrect.', 'error'); }
      btn.disabled = false; btn.textContent = 'Changer le mot de passe';
    });
    api.$('#wipe', el).addEventListener('click', async () => {
      const r = await api.modal({title: 'Effacer toutes les données', body: `<p>Cette action est irréversible. Tapez <strong>EFFACER</strong> pour confirmer.</p><input type="text" id="wTxt">`,
        actions: [{label: 'Annuler', value: false}, {label: 'Effacer', kind: 'danger', onClick: b => api.$('#wTxt', b).value === 'EFFACER' ? true : false}]});
      if (!r) return;
      await App.kvClear(); App.meta = null; location.hash = ''; location.reload();
    });
  }
});

/* ---------- Mes circonscriptions : la circonscription active, les autres (rangées, complètes), création d'une nouvelle ---------- */
function circoCard(box, api) {
  const C = App.circoArchive, d = api.data, a = C.active();
  const nCyc = (d.modules.circonscription?.cycles || []).length, nDocs = api.docs.list().filter(x => x.kind !== 's302form').length;
  const others = C.list();
  box.innerHTML = `<strong>Mes circonscriptions</strong>
    <div class="form-grid">
      <label class="field"><span>Code de la circonscription ouverte</span><input type="text" id="ciCode" value="${api.esc(a.code)}" placeholder="Ex. : NM01"></label>
      <label class="field"><span>Nom</span><input type="text" id="ciNom" value="${api.esc(a.nom)}" placeholder="Ex. : Normandie 01"></label>
    </div>
    <p class="small muted" style="margin:0">${d.congregations.length} assemblée(s) · ${d.persons.length} personne(s) dans l’annuaire · ${nCyc} cycle(s) d’analyse · ${nDocs} document(s) d’assemblée</p>
    <div class="row"><button class="btn primary" id="ciSave">Enregistrer</button><span style="flex:1"></span><button class="btn" id="ciNew">+ Nouvelle circonscription…</button></div>
    ${others.length ? `<div class="stack" style="gap:6px"><strong class="small">Autres circonscriptions (toutes leurs données sont conservées)</strong>
      ${others.map(e => `<div class="row small" style="border-top:1px solid var(--line);padding-top:6px"><span style="flex:1"><strong>${api.esc(C.label(e))}</strong> — ${(e.congregations || []).length} assemblée(s), ${(e.persons || []).length} personne(s), ${(e.modules?.circonscription?.cycles || []).length} cycle(s) · rangée le ${api.dateCourte(e.rangeeLe)}</span>
        <button class="btn" data-open="${e.id}">Ouvrir</button><button class="btn danger" data-del="${e.id}">Supprimer…</button></div>`).join('')}
      <span class="small muted">On passe aussi d’une circonscription à l’autre avec la liste en haut de la barre latérale.</span></div>` : ''}`;
  api.$('#ciSave', box).addEventListener('click', () => { a.code = api.$('#ciCode', box).value.trim().toUpperCase(); a.nom = api.$('#ciNom', box).value.trim(); api.save(); api.toast('Circonscription enregistrée'); App.api.navigate('#/parametres'); circoCard(box, api); });
  api.$('#ciNew', box).addEventListener('click', () => newCirco(api));
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; await C.switchTo(b.dataset.open); }));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const e = C.list().find(x => x.id === b.dataset.del); if (!e) return;
    const word = (e.code || 'SUPPRIMER').toUpperCase();
    const ok = await api.modal({title: `Supprimer ${C.label(e)}`, body: `<div class="stack">
      ${C.recent(e) ? `<div class="notice warn small">Cette circonscription a été rangée il y a moins de 6 mois (le ${api.dateCourte(e.rangeeLe)}).</div>` : ''}
      <p style="margin:0">L’annuaire, les cycles d’analyse, l’itinéraire, les analyses S-13, les documents et les photos de <strong>${api.esc(C.label(e))}</strong> seront effacés définitivement, sur tous vos appareils synchronisés.</p>
      <p class="small" style="margin:0">Conseil : faites d’abord une sauvegarde (Sauvegarde › Télécharger) pour en garder une trace.</p>
      <label class="field" style="max-width:300px"><span>Pour confirmer, tapez <strong>${api.esc(word)}</strong></span><input type="text" id="dOk" autocomplete="off"></label></div>`,
      actions: [{label: 'Annuler', value: false}, {label: 'Supprimer définitivement', kind: 'danger', onClick: bx => api.$('#dOk', bx).value.trim().toUpperCase() === word}]});
    if (!ok) return;
    await C.remove(e.id); api.toast(`${C.label(e)} supprimée`); App.api.navigate('#/parametres'); circoCard(box, api);
  }));
}

async function newCirco(api) {
  const C = App.circoArchive, d = api.data, a = C.active(), cur = C.label(a);
  const hasLetter = !!(d.modules.itineraire?.annees || []).some(A => A.lettres && Object.values(A.lettres).some(L => L?.avec));
  const r = await api.modal({title: 'Nouvelle circonscription', wide: true, body: `<div class="stack">
    <p style="margin:0"><strong>${api.esc(cur)}</strong> est rangée avec toutes ses données (annuaire, cycles d’analyse, itinéraire, S-13, documents, photos). Vous pourrez la rouvrir à tout moment.</p>
    <p class="small muted" style="margin:0">La nouvelle circonscription démarre vide. Votre profil, les modèles de courriers et de publipostage, le formulaire S-302, le coffre et les réglages sont communs à toutes.</p>
    <div class="form-grid">
      <label class="field"><span>Code</span><input type="text" id="nCode" placeholder="Ex. : NM02"></label>
      <label class="field"><span>Nom</span><input type="text" id="nNom" placeholder="Ex. : Normandie 02"></label>
      <label class="field wide"><span>En-tête des lettres</span><input type="text" id="nEnt" value="${api.esc(d.settings.profil.entete || '')}"></label>
    </div>
    ${hasLetter ? `<label class="row small"><input type="checkbox" id="kLet" checked> Reprendre ma dernière lettre aux anciens comme modèle de départ</label>` : ''}
    <div class="err small hidden" style="color:var(--danger)" id="nErr"></div></div>`,
    actions: [{label: 'Annuler', value: null}, {label: 'Créer la circonscription', kind: 'primary', onClick: b => {
      const v = {code: api.$('#nCode', b).value.trim().toUpperCase(), nom: api.$('#nNom', b).value.trim(), entete: api.$('#nEnt', b).value.trim(), keepLetter: !!api.$('#kLet', b)?.checked};
      if (!v.code && !v.nom) { const e = api.$('#nErr', b); e.textContent = 'Indiquez le code ou le nom de la nouvelle circonscription.'; e.classList.remove('hidden'); return false; }
      if ([a, ...C.list()].some(x => x.code && x.code === v.code)) { const e = api.$('#nErr', b); e.textContent = `La circonscription ${v.code} existe déjà.`; e.classList.remove('hidden'); return false; }
      return v; }}]});
  if (!r) return;
  try { await C.createNew(r); api.toast(`Circonscription ${C.label(r)} créée — ${cur} est rangée`); }
  catch (e) { api.toast('Création impossible : ' + e.message, 'error'); }
}
