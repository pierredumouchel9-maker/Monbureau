'use strict';
/* Coffre : codes d'alarme, Wi-Fi, Zoom… chiffrés à part, avec un second déverrouillage.
   Le coffre se referme dès qu'on quitte cette page ou que l'application se verrouille. */
App.registerSkill({
  id: 'coffre', name: 'Coffre', icon: '🔐', group: 'socle', order: 3,
  description: 'Codes d’accès chiffrés séparément, second déverrouillage.',
  mount(el, api) {
    const V = api.vault;
    const CATS = ['Alarme', 'Wi-Fi', 'Zoom', 'Cadenas', 'Autre'];

    function lockedView() {
      el.innerHTML = `<div class="page-head"><div><h1>Coffre</h1><p>Les codes sont chiffrés à part et demandent un second déverrouillage.</p></div></div>
        <form class="card stack" style="max-width:420px" onsubmit="return false">
          <label class="field"><span>Mot de passe maître</span><input type="password" id="cPw" autocomplete="current-password"></label>
          <div class="notice danger small hidden" id="cErr"></div>
          <button class="btn primary" id="cOpen">Ouvrir le coffre</button></form>`;
      const go = async () => {
        const btn = api.$('#cOpen', el); btn.disabled = true; btn.textContent = 'Un instant…';
        try { await V.open(api.$('#cPw', el).value); openView(); }
        catch { btn.disabled = false; btn.textContent = 'Ouvrir le coffre'; const e = api.$('#cErr', el); e.textContent = 'Mot de passe incorrect.'; e.classList.remove('hidden'); }
      };
      api.$('#cOpen', el).addEventListener('click', go);
      api.$('#cPw', el).focus();
    }

    async function edit(entry) {
      const isNew = !entry; const v = entry ? {...entry} : {id: api.uid(), titre: '', categorie: 'Alarme', assemblee: '', identifiant: '', secret: '', notes: ''};
      const r = await api.modal({title: isNew ? 'Nouveau code' : v.titre, body: `<form class="form-grid" onsubmit="return false">
        <label class="field"><span>Intitulé</span><input type="text" name="titre" value="${api.esc(v.titre)}" placeholder="Ex. : Salle du Royaume de …"></label>
        <label class="field"><span>Type</span><select name="categorie">${CATS.map(c => `<option ${v.categorie === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>Assemblée</span><input type="text" name="assemblee" list="cCong" value="${api.esc(v.assemblee)}"><datalist id="cCong">${api.data.congregations.map(c => `<option value="${api.esc(c.nom)}">`).join('')}</datalist></label>
        <label class="field"><span>Identifiant / réseau / n° Zoom</span><input type="text" name="identifiant" value="${api.esc(v.identifiant)}" autocomplete="off"></label>
        <label class="field wide"><span>Code / mot de passe</span><input type="text" name="secret" class="secret" value="${api.esc(v.secret)}" autocomplete="off" spellcheck="false"></label>
        <label class="field wide"><span>Remarques</span><textarea name="notes" rows="2">${api.esc(v.notes)}</textarea></label></form>`,
        actions: [...(isNew ? [] : [{label: 'Supprimer', kind: 'danger', onClick: async () => {
          if (!await api.confirm('Supprimer', `Supprimer « ${v.titre} » du coffre ?`, 'Supprimer', true)) return false;
          const i = V.entries.findIndex(x => x.id === v.id); V.entries.splice(i, 1); return 'ok'; }}]),
          {label: 'Annuler', value: null}, {label: 'Enregistrer', kind: 'primary', onClick: b => {
            const f = api.$('form', b); for (const k of ['titre', 'categorie', 'assemblee', 'identifiant', 'secret', 'notes']) v[k] = f[k].value.trim();
            if (!v.titre) return false;
            if (isNew) V.entries.push(v); else Object.assign(entry, v); return 'ok'; }}],
        onMount: b => api.$('[name=titre]', b).focus()});
      if (r) { await V.save(); api.toast('Coffre enregistré'); openView(); }
    }

    function openView() {
      const groups = {};
      for (const e of V.entries) (groups[e.assemblee || 'Sans assemblée'] ??= []).push(e);
      el.innerHTML = `<div class="page-head"><div><h1>Coffre <span class="pill ok">ouvert</span></h1><p>Il se refermera dès que vous quitterez cette page.</p></div>
        <div class="row"><button class="btn" id="cClose">Refermer</button><button class="btn primary" id="cAdd">+ Code</button></div></div>
        ${Object.keys(groups).sort().map(g => `<h2 style="font-size:16px;margin:18px 0 8px">${api.esc(g)}</h2>
          <div class="table-wrap"><table class="list"><thead><tr><th>Intitulé</th><th>Type</th><th>Identifiant</th><th>Code</th><th></th></tr></thead><tbody>
          ${groups[g].sort((a, b) => a.titre.localeCompare(b.titre)).map(e => `<tr><td><strong>${api.esc(e.titre)}</strong>${e.notes ? `<div class="small muted">${api.esc(e.notes)}</div>` : ''}</td>
            <td>${api.esc(e.categorie)}</td><td class="secret">${api.esc(e.identifiant)}</td>
            <td class="secret" data-secret="${e.id}">••••••</td>
            <td><div class="row"><button class="btn small" data-show="${e.id}">Afficher</button><button class="btn small" data-copy="${e.id}">Copier</button><button class="btn small" data-edit="${e.id}">Modifier</button></div></td></tr>`).join('')}
          </tbody></table></div>`).join('') || '<p class="muted">Le coffre est vide.</p>'}`;
      api.$('#cClose', el).addEventListener('click', () => { V.forget(); lockedView(); });
      api.$('#cAdd', el).addEventListener('click', () => edit());
      el.onclick = async e => {
        const t = e.target.closest('[data-show],[data-copy],[data-edit]'); if (!t) return;
        const entry = V.entries.find(x => x.id === (t.dataset.show || t.dataset.copy || t.dataset.edit));
        if (t.dataset.show) { const c = api.$(`[data-secret="${entry.id}"]`, el); const hidden = c.textContent === '••••••'; c.textContent = hidden ? entry.secret : '••••••'; t.textContent = hidden ? 'Masquer' : 'Afficher'; }
        if (t.dataset.copy) { try { await navigator.clipboard.writeText(entry.secret); api.toast('Code copié (pensez à vider le presse-papiers)'); } catch { api.toast('Copie impossible sur cet appareil', 'error'); } }
        if (t.dataset.edit) edit(entry);
      };
    }

    V.isOpen ? openView() : lockedView();
  }
});
