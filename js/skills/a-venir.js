'use strict';
/* Emplacements des skills prévus au cahier des charges (remplacés au fil des étapes). */
[
  {id: 'assemblee', name: 'Assemblée', icon: '🎤', order: 10, etape: 2, description: 'Lettres de participation (7 modèles), programmes, envoi par Gmail.'},
  {id: 'ecole', name: 'École / Ateliers', icon: '🎓', order: 11, etape: 3, description: 'Attributions des devoirs, compteurs, fiches, plannings.'},
  {id: 'territoires', name: 'Territoires S-13', icon: '🗺️', order: 13, etape: 4, description: 'Analyse automatique des formulaires S-13.'},
  {id: 'bibliotheque', name: 'Bibliothèque', icon: '📚', order: 14, etape: 5, description: 'Lecture et étude de vos EPUB et PDF.'}
].forEach(s => App.registerSkill({
  ...s, status: 'bientot', version: '—',
  mount(el, api) {
    el.innerHTML = `<div class="page-head"><div><h1>${s.icon} ${api.esc(s.name)}</h1><p>${api.esc(s.description)}</p></div></div>
      <div class="notice">Ce skill est prévu à l’étape ${s.etape} du cahier des charges. Il utilisera l’annuaire, les modèles et le stockage chiffré du socle.</div>`;
  }
}));
