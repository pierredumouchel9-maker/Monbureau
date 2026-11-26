'use strict';
/* Modèles de documents : éditeur avec champs de fusion, aperçu et génération de PDF (seul ou en lot). */
App.modeles = (() => {
  const api = App.api;
  const toEditor = html => html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => `<span class="field-chip" contenteditable="false" data-f="${k}">${api.esc(App.fields.label(k))}</span>`);
  function fromEditor(el) {
    const c = el.cloneNode(true);
    api.$$('.field-chip', c).forEach(s => s.replaceWith(document.createTextNode(`{{${s.dataset.f}}}`)));
    return c.innerHTML;
  }
  const personLabel = p => `${(p.nom || '').toUpperCase()} ${p.prenom || ''}${p.assemblee ? ' — ' + p.assemblee : ''}`;

  async function pdfFor(tpl, person, extra = {}) {
    const values = App.fields.values({person, ...extra});
    return App.pdf.render(App.pdf.merge(tpl.body, values), {title: tpl.name});
  }

  // Génération pour plusieurs personnes : un PDF chacun, regroupés dans un ZIP.
  async function batchFlow(tpl) {
    const persons = [...api.data.persons].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
    if (!persons.length) return api.toast('L’annuaire est vide.', 'error');
    const congs = [...new Set(persons.map(p => p.assemblee).filter(Boolean))].sort();
    const ids = await api.modal({title: `Générer « ${tpl.name} » pour plusieurs personnes`, body: `
      <div class="stack"><div class="row"><select id="bF" style="max-width:280px"><option value="">Toutes les assemblées</option>${congs.map(c => `<option>${api.esc(c)}</option>`).join('')}</select>
      <button class="btn small" id="bAll">Tout cocher</button><button class="btn small" id="bNone">Tout décocher</button></div>
      <div id="bList" style="max-height:360px;overflow:auto" class="stack"></div></div>`,
      actions: [{label: 'Annuler', value: null}, {label: 'Générer le ZIP', kind: 'primary', onClick: b => { const v = api.$$('input[type=checkbox]:checked', b).map(i => i.value); return v.length ? v : false; }}],
      onMount: b => {
        const draw = () => { const f = api.$('#bF', b).value; api.$('#bList', b).innerHTML = persons.filter(p => !f || p.assemblee === f).map(p => `<label class="row"><input type="checkbox" value="${p.id}"> ${api.esc(personLabel(p))}</label>`).join(''); };
        draw(); api.$('#bF', b).addEventListener('change', draw);
        api.$('#bAll', b).addEventListener('click', () => api.$$('#bList input', b).forEach(i => i.checked = true));
        api.$('#bNone', b).addEventListener('click', () => api.$$('#bList input', b).forEach(i => i.checked = false));
      }});
    if (!ids) return;
    api.toast(`Génération de ${ids.length} PDF…`);
    const entries = [], used = new Set();
    for (const id of ids) {
      const p = persons.find(x => x.id === id);
      let name = App.pdf.fileName(`${tpl.name} - ${p.prenom || ''} ${(p.nom || '').toUpperCase()}`) + '.pdf';
      while (used.has(name)) name = name.replace(/\.pdf$/, ' (2).pdf'); used.add(name);
      entries.push({name, bytes: await pdfFor(tpl, p)});
    }
    api.download(App.pdf.fileName(tpl.name) + '.zip', App.files.zip(entries));
    api.toast(`${entries.length} PDF générés`);
  }

  function editor(el, tpl) {
    const isNew = !api.data.templates.includes(tpl);
    const groups = App.fields.groups;
    el.innerHTML = `<div class="page-head"><div><h1>${isNew ? 'Nouveau modèle' : api.esc(tpl.name)}</h1><p>Les champs bleus sont remplacés automatiquement pour chaque personne.</p></div>
      <div class="row"><button class="btn" id="mBack">← Modèles</button><button class="btn primary" id="mSave">Enregistrer</button></div></div>
      <div class="stack">
        <div class="form-grid"><label class="field"><span>Nom du modèle</span><input type="text" id="mName" value="${api.esc(tpl.name)}"></label>
        <label class="field"><span>Catégorie</span><input type="text" id="mCat" value="${api.esc(tpl.category)}" list="mCats"><datalist id="mCats">${[...new Set(api.data.templates.map(t => t.category))].map(c => `<option value="${api.esc(c)}">`).join('')}</datalist></label></div>
        <div>
          <div class="editor-bar">
            <select id="mBlock" style="width:auto;padding:4px 8px"><option value="p">Texte</option><option value="h2">Grand titre</option><option value="h3">Sous-titre</option></select>
            <button class="btn" data-cmd="bold" title="Gras"><b>G</b></button><button class="btn" data-cmd="italic" title="Italique"><i>I</i></button>
            <button class="btn" data-cmd="justifyLeft" title="Aligner à gauche">⇤</button><button class="btn" data-cmd="justifyCenter" title="Centrer">↔</button>
            <button class="btn" data-cmd="justifyRight" title="Aligner à droite">⇥</button><button class="btn" data-uni title="Remet le texte sélectionné dans la police et la taille du modèle">Aa ✕</button><button class="btn" data-cmd="justifyFull" title="Justifier">☰</button>
            <button class="btn" data-cmd="insertUnorderedList" title="Liste à puces">• Liste</button><button class="btn" data-cmd="insertOrderedList" title="Liste numérotée">1. Liste</button>
            <button class="btn" data-cmd="undo" title="Annuler">↶</button><button class="btn" data-cmd="redo" title="Rétablir">↷</button>
            <select id="mField" style="width:auto;padding:4px 8px"><option value="">+ Insérer un champ</option>
              ${groups.map(g => `<optgroup label="${api.esc(g.label)}">${g.fields.map(f => `<option value="${f.key}">${api.esc(f.label)}</option>`).join('')}</optgroup>`).join('')}</select>
          </div>
          <div class="editor" id="mEd" contenteditable="true" spellcheck="true" lang="fr">${toEditor(tpl.body || '<p><br></p>')}</div>
        </div>
        <div class="card stack"><strong>Aperçu et PDF</strong>
          <div class="row"><select id="mPerson" style="max-width:360px"><option value="">— Choisir un destinataire —</option>
            ${[...api.data.persons].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')).map(p => `<option value="${p.id}">${api.esc(personLabel(p))}</option>`).join('')}</select>
            <button class="btn" id="mPrev">Aperçu</button><button class="btn" id="mPdf">Télécharger le PDF</button><button class="btn" id="mBatch">Générer pour plusieurs personnes…</button></div>
          <iframe class="preview-frame hidden" id="mFrame" title="Aperçu du PDF"></iframe>
        </div>
      </div>`;
    const ed = api.$('#mEd', el);
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('defaultParagraphSeparator', false, 'p');
    let range = null;
    document.addEventListener('selectionchange', function keep() {
      if (!document.body.contains(ed)) return document.removeEventListener('selectionchange', keep);
      const s = window.getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange();
    });
    const restore = () => { ed.focus(); if (range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); } };
    api.$$('[data-cmd]', el).forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); restore(); document.execCommand(b.dataset.cmd); }));
    api.$$('[data-uni]', el).forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); restore(); window.uniformiser(api.$('#mEd', el)); }));
    api.$('#mBlock', el).addEventListener('change', e => { restore(); document.execCommand('formatBlock', false, e.target.value); });
    api.$('#mField', el).addEventListener('change', e => {
      const k = e.target.value; if (!k) return; restore();
      document.execCommand('insertHTML', false, `<span class="field-chip" contenteditable="false" data-f="${k}">${api.esc(App.fields.label(k))}</span>&nbsp;`);
      e.target.value = '';
    });
    const current = () => ({...tpl, name: api.$('#mName', el).value.trim() || 'Sans titre', category: api.$('#mCat', el).value.trim() || 'Général', body: fromEditor(ed)});
    let dirty = false; ed.addEventListener('input', () => dirty = true);
    const save = () => {
      Object.assign(tpl, current(), {updated: new Date().toISOString()});
      if (!api.data.templates.includes(tpl)) api.data.templates.push(tpl);
      api.save(); dirty = false; api.toast('Modèle enregistré');
    };
    api.$('#mSave', el).addEventListener('click', save);
    api.$('#mBack', el).addEventListener('click', async () => {
      if (dirty && await api.confirm('Modifications non enregistrées', 'Enregistrer le modèle avant de quitter ?', 'Enregistrer')) save();
      api.navigate('#/modeles');
    });
    const person = () => api.data.persons.find(p => p.id === api.$('#mPerson', el).value);
    let lastUrl = null;
    api.$('#mPrev', el).addEventListener('click', async () => {
      try {
        const bytes = await pdfFor(current(), person());
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
        const f = api.$('#mFrame', el); f.src = lastUrl; f.classList.remove('hidden');
      } catch (e) { console.error(e); api.toast('Erreur PDF : ' + e.message, 'error'); }
    });
    api.$('#mPdf', el).addEventListener('click', async () => {
      const p = person(), t = current();
      api.download(App.pdf.fileName(`${t.name}${p ? ' - ' + p.prenom + ' ' + (p.nom || '').toUpperCase() : ''}`) + '.pdf', await pdfFor(t, p), 'application/pdf');
    });
    api.$('#mBatch', el).addEventListener('click', () => batchFlow(current()));
  }

  function list(el) {
    const tpls = api.data.templates;
    const cats = [...new Set(tpls.map(t => t.category || 'Général'))].sort();
    el.innerHTML = `<div class="page-head"><div><h1>Modèles</h1><p>Lettres et documents avec champs de fusion, modifiables à volonté.</p></div>
      <button class="btn primary" id="mNew">+ Nouveau modèle</button></div>
      ${cats.map(c => `<h2 style="font-size:16px;margin:18px 0 8px">${api.esc(c)}</h2><div class="grid">
        ${tpls.filter(t => (t.category || 'Général') === c).map(t => `<div class="card stack"><div><strong>${api.esc(t.name)}</strong>
          <div class="small muted">Modifié le ${api.dateCourte(t.updated)}</div></div>
          <div class="row"><a class="btn small primary" href="#/modeles/${t.id}">Modifier</a><button class="btn small" data-dup="${t.id}">Dupliquer</button><button class="btn small danger" data-del="${t.id}">Supprimer</button></div></div>`).join('')}</div>`).join('')
      || '<p class="muted">Aucun modèle.</p>'}`;
    api.$('#mNew', el).addEventListener('click', () => {
      const t = {id: api.uid(), name: 'Nouveau modèle', category: 'Général', body: '<p><br></p>', updated: new Date().toISOString()};
      api.data.templates.push(t); api.save(); api.navigate('#/modeles/' + t.id);
    });
    el.onclick = async e => {
      const dup = e.target.closest('[data-dup]'), del = e.target.closest('[data-del]');
      if (dup) { const t = tpls.find(x => x.id === dup.dataset.dup); tpls.push({...t, id: api.uid(), name: t.name + ' (copie)', updated: new Date().toISOString()}); api.save(); list(el); }
      if (del) { const t = tpls.find(x => x.id === del.dataset.del); if (await api.confirm('Supprimer', `Supprimer le modèle « ${t.name} » ?`, 'Supprimer', true)) { api.data.templates = tpls.filter(x => x !== t); api.save(); list(el); } }
    };
  }

  return {mount(el, _api, rest) { const t = rest[0] && api.data.templates.find(x => x.id === rest[0]); t ? editor(el, t) : list(el); }, pdfFor, batchFlow};
})();

App.registerSkill({
  id: 'modeles', name: 'Modèles', icon: '📝', group: 'socle', order: 2,
  description: 'Modèles de lettres et documents avec champs de fusion.',
  mount: (el, api, rest) => App.modeles.mount(el, api, rest)
});
