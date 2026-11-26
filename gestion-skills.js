'use strict';
/* Gestionnaire de skills : liste les modules installés, permet d'activer ou masquer les skills métier.
   Pour ajouter un skill : créer js/skills/mon-skill.js qui appelle App.registerSkill({...}) et l'ajouter à index.html. */
App.registerSkill({
  id: 'skills', name: 'Skills', icon: '🧩', group: 'socle', order: 89, position: 'bas',
  description: 'Modules installés.',
  mount(el, api) {
    const draw = () => {
      const all = api.skills;
      el.innerHTML = `<div class="page-head"><div><h1>Skills</h1><p>Chaque skill est un module indépendant qui s’appuie sur le socle (annuaire, modèles, stockage chiffré).</p></div></div>
        <h2 style="font-size:16px">Skills métier</h2>
        <div class="table-wrap"><table class="list"><thead><tr><th>Skill</th><th>Version</th><th>État</th><th></th></tr></thead><tbody>
        ${all.filter(s => s.group !== 'socle').map(s => `<tr><td><strong>${s.icon} ${api.esc(s.name)}</strong><div class="small muted">${api.esc(s.description)}</div></td>
          <td>${api.esc(s.version)}</td>
          <td>${s.status !== 'actif' ? '<span class="pill">à venir</span>' : api.isEnabled(s) ? '<span class="pill ok">actif</span>' : '<span class="pill">masqué</span>'}</td>
          <td>${s.status === 'actif' ? `<button class="btn small" data-toggle="${s.id}">${api.isEnabled(s) ? 'Masquer' : 'Activer'}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <h2 style="font-size:16px;margin-top:24px">Socle</h2>
        <div class="table-wrap"><table class="list"><thead><tr><th>Module</th><th>Rôle</th></tr></thead><tbody>
        ${all.filter(s => s.group === 'socle').map(s => `<tr><td><strong>${s.icon} ${api.esc(s.name)}</strong></td><td class="small">${api.esc(s.description)}</td></tr>`).join('')}
        </tbody></table></div>`;
      el.onclick = e => {
        const b = e.target.closest('[data-toggle]'); if (!b) return;
        const d = api.data.skills.disabled; d[b.dataset.toggle] = !d[b.dataset.toggle]; api.save(); api.refreshNav(); draw();
      };
    };
    draw();
  }
});
