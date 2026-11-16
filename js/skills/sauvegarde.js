'use strict';
/* Sauvegardes : le fichier exporté contient les données déjà chiffrées (base + coffre).
   Il ne peut être ouvert qu'avec le mot de passe maître en vigueur au moment de la sauvegarde. */
App.backup = (() => {
  const api = App.api;

  async function exportBackup() {
    await api.flush();
    const [meta, data, vault] = await Promise.all([App.kvGet('meta'), App.kvGet('data'), App.kvGet('vault')]);
    const file = {format: 'mon-bureau-sauvegarde', version: 1, exportedAt: new Date().toISOString(), app: App.VERSION, meta, data, vault};
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    api.download(`MonBureau-sauvegarde-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.monbureau`, new Blob([JSON.stringify(file)], {type: 'application/json'}));
    api.data.settings.lastBackup = file.exportedAt; api.save();
    api.toast('Sauvegarde chiffrée téléchargée');
  }

  // Restauration : fonctionne depuis l'écran d'accueil (premier lancement) ou depuis la page Sauvegarde.
  // Le sélecteur de fichier doit s'ouvrir pendant le clic lui-même : Safari (Mac, iPhone) le bloque
  // sans rien afficher s'il est ouvert après une attente. On accepte tous les fichiers, le contenu est vérifié ensuite.
  async function restoreFlow(picked) {
    const f = await (picked || api.pickFile('')); if (!f) return;
    let file;
    try { file = JSON.parse(await f.text()); if (file.format !== 'mon-bureau-sauvegarde') throw 0; }
    catch { return api.toast('Ce fichier n’est pas une sauvegarde Mon Bureau.', 'error'); }
    const pw = await api.askPassword('Restaurer la sauvegarde', `Sauvegarde du ${api.dateCourte(file.exportedAt)}. Saisissez le mot de passe maître utilisé à ce moment-là. Les données actuelles de cet appareil seront remplacées.`);
    if (!pw) return;
    try {
      const k = await App.deriveKey(pw, App.unb64(file.meta.salt), file.meta.iterations);
      await App.open(k, file.data); // vérifie le mot de passe
    } catch { return api.toast('Mot de passe incorrect pour cette sauvegarde.', 'error'); }
    await App.replaceAll({meta: file.meta, data: file.data, vault: file.vault});
    api.toast('Sauvegarde restaurée');
    setTimeout(() => location.reload(), 600);
  }

  function mount(el) {
    const s = api.data.settings;
    el.innerHTML = `<div class="page-head"><div><h1>Sauvegarde</h1><p>Vos données n’existent que sur cet appareil : sauvegardez-les régulièrement.</p></div></div>
      <div class="grid">
        <div class="card stack"><strong>Sauvegarder</strong>
          <p class="small muted" style="margin:0">Télécharge un fichier <code>.monbureau</code> chiffré (annuaire, modèles, coffre, réglages). Rangez-le sur une clé USB ou dans votre cloud : sans le mot de passe, il est illisible.</p>
          <p class="small" style="margin:0">Dernière sauvegarde : <strong>${s.lastBackup ? api.dateCourte(s.lastBackup) : 'jamais'}</strong></p>
          <button class="btn primary" id="bExp">Télécharger une sauvegarde</button></div>
        <div class="card stack"><strong>Restaurer</strong>
          <p class="small muted" style="margin:0">Remplace toutes les données de cet appareil par celles d’une sauvegarde. Sert aussi à transférer vos données vers un autre appareil (Mac → iPhone, par exemple).</p>
          <button class="btn" id="bRes">Restaurer une sauvegarde…</button></div>
      </div>
      <div class="notice small" style="margin-top:16px">Le mot de passe de la sauvegarde est celui en vigueur au moment où elle a été faite. Après un changement de mot de passe, refaites une sauvegarde.</div>`;
    api.$('#bExp', el).addEventListener('click', exportBackup);
    api.$('#bRes', el).addEventListener('click', async () => {
      let picked = null;
      await api.modal({title: 'Restaurer', body: '<p>Les données actuelles de cet appareil seront remplacées par celles de la sauvegarde. Continuer ?</p>',
        actions: [{label: 'Annuler', value: false}, {label: 'Choisir le fichier', kind: 'danger', onClick: () => { picked = api.pickFile(''); return true; }}]});
      if (picked) restoreFlow(picked);
    });
  }
  return {mount, exportBackup, restoreFlow};
})();

App.registerSkill({
  id: 'sauvegarde', name: 'Sauvegarde', icon: '💾', group: 'socle', order: 90, position: 'bas',
  description: 'Sauvegarde et restauration chiffrées.',
  mount: el => App.backup.mount(el)
});
