'use strict';
App.registerSkill({
  id: 'accueil', name: 'Accueil', icon: '🏠', group: 'socle', order: 0,
  description: 'Vue d’ensemble et rappels.',
  mount(el, api) {
    const d = api.data, s = d.settings, p = s.profil;
    const days = s.lastBackup ? Math.floor((Date.now() - new Date(s.lastBackup)) / 864e5) : null;
    const backupNotice = days === null
      ? `<div class="notice warn">Aucune sauvegarde n’a encore été faite. <a href="#/sauvegarde">Faire une sauvegarde chiffrée</a></div>`
      : days > 30 ? `<div class="notice warn">Dernière sauvegarde il y a ${days} jours. <a href="#/sauvegarde">Faire une sauvegarde</a></div>` : '';
    const profilNotice = !p.nom ? `<div class="notice">Renseignez votre nom et vos coordonnées dans <a href="#/parametres">Paramètres</a> : ils servent dans l’en-tête de vos lettres.</div>` : '';
    const metier = api.skills.filter(x => x.group !== 'socle');
    el.innerHTML = `
      <div class="page-head"><div><h1>Bonjour${p.prenom ? ' ' + api.esc(p.prenom) : ''}</h1>
      <p>${s.circo?.code || s.circo?.nom ? `Circonscription <strong>${api.esc([s.circo.code, s.circo.nom].filter(Boolean).join(' — '))}</strong> · ${api.data.congregations.length} assemblée(s) · ` : ''}Toutes vos données sont chiffrées sur cet appareil.</p></div></div>
      <div class="stack">
        ${backupNotice}${profilNotice}${(() => { const L = App.itineraire ? App.itineraire.alerts() : []; if (!L.length) return '';
          return `<div class="notice danger"><strong>⚠ Courriers à envoyer (visites dans moins de 6 semaines)</strong><ul style="margin:6px 0 0 18px;padding:0">${L.map(x => `<li><strong>${api.esc(x.r.asm || x.r.libelle)}</strong> — semaine du ${x.s.toLocaleDateString('fr-FR')} (dans ${x.jours} j) : ${x.manque.join(' et ')}</li>`).join('')}</ul><a href="#/itineraire">Ouvrir l’itinéraire</a></div>`; })()}
        <div class="grid">
          <a class="card" href="#/annuaire" style="text-decoration:none;color:inherit"><div class="muted small">Annuaire</div><div class="stat">${d.persons.length}</div><div class="small muted">personnes · ${d.congregations.length} assemblées</div></a>
          <a class="card" href="#/modeles" style="text-decoration:none;color:inherit"><div class="muted small">Modèles</div><div class="stat">${d.templates.length}</div><div class="small muted">modèles de documents</div></a>
          <a class="card" href="#/coffre" style="text-decoration:none;color:inherit"><div class="muted small">Coffre</div><div class="stat">🔐</div><div class="small muted">codes d’accès, déverrouillage séparé</div></a>
          <a class="card" href="#/sauvegarde" style="text-decoration:none;color:inherit"><div class="muted small">Dernière sauvegarde</div><div class="stat" style="font-size:18px;padding:8px 0">${s.lastBackup ? api.dateCourte(s.lastBackup) : 'Jamais'}</div></a>
        </div>
        <h2 style="margin:12px 0 0;font-size:18px">Skills</h2>
        <div class="grid">${metier.map(x => `
          <a class="card" href="#/${x.id}" style="text-decoration:none;color:inherit">
            <div class="row" style="justify-content:space-between"><strong>${x.icon} ${api.esc(x.name)}</strong>
            <span class="pill ${x.status === 'actif' ? 'ok' : ''}">${x.status === 'actif' ? 'actif' : 'à venir'}</span></div>
            <p class="small muted" style="margin:6px 0 0">${api.esc(x.description)}</p></a>`).join('')}
        </div>
      </div>`;
  }
});
