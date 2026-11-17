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
            <label class="field wide"><span>En-tête des lettres</span><input type="text" name="entete" value="${api.esc(p.entete)}" placeholder="Ex. : CIRCONSCRIPTION …"></label>
          </div>
          <div><button class="btn primary" id="pSave">Enregistrer le profil</button></div></form>

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
