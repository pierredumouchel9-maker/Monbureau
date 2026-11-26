'use strict';
/* Préparation d'un mail avec pièce jointe : rien ne part sans l'utilisateur.
   « Partager » ouvre Mail/Gmail avec le PDF joint (adresses copiées dans le presse-papiers) ;
   « Ouvrir la messagerie » prépare le mail adressé et télécharge le PDF à joindre. */
App.mailer = (() => {
  const api = App.api;
  const KEY = ['CCA', 'Secrétaire', 'Resp. Prédication'];
  // asm : assemblée ; defaults : responsabilités cochées par défaut
  async function open({asm, blob, fileName, subject, body, defaults = ['CCA']}) {
    const ck = s => api.norm(s).replace(/\bst\b/g, 'saint').replace(/[^a-z0-9]/g, '');
    const fn = p => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
    const rank = p => { const i = KEY.findIndex(r => (p.resp || []).includes(r)); return i < 0 ? 9 : i; };
    const cand = api.data.persons.filter(p => p.email && ck(p.assemblee || '') === ck(asm || '') && (rank(p) < 9 || p.fonction === 'Ancien'))
      .sort((a, b) => rank(a) - rank(b) || String(a.nom).localeCompare(String(b.nom), 'fr'));
    const file = new File([blob], fileName, {type: blob.type || 'application/pdf'});
    const canShare = !!(navigator.canShare && navigator.canShare({files: [file]}));
    const html = `<p class="small muted" style="margin-top:0">📕 <strong>${api.esc(fileName)}</strong></p>
      <div class="small" style="margin-bottom:4px"><strong>Destinataires</strong> (adresses de l’annuaire)</div>
      ${cand.length ? `<div style="max-height:180px;overflow:auto;border:1px solid var(--line,#e2e4e8);border-radius:6px;padding:4px 8px">${cand.map(p => `<label class="row small" style="gap:6px;padding:2px 0"><input type="checkbox" data-to="${api.esc(p.email)}" ${(p.resp || []).some(r => defaults.includes(r)) ? 'checked' : ''}> ${api.esc(fn(p))} <span class="muted">${api.esc((p.resp || []).filter(r => KEY.includes(r)).join(', ') || p.fonction || '')} · ${api.esc(p.email)}</span></label>`).join('')}</div>`
        : `<p class="small muted">Aucun ancien de ${api.esc(asm || '')} n’a d’adresse mail dans l’annuaire.</p>`}
      <label class="field" style="margin-top:8px"><span>Autres adresses (séparées par des virgules)</span><input type="text" id="mOther"></label>
      <label class="field"><span>Objet</span><input type="text" id="mSubj" value="${api.esc(subject)}"></label>
      <label class="field"><span>Message</span><textarea id="mBody" rows="6">${api.esc(body)}</textarea></label>
      <p class="small muted" style="margin:6px 0 0">${canShare ? '« Partager avec la pièce jointe » ouvre Mail ou Gmail avec le PDF joint ; les adresses sont copiées : collez-les dans « À ». ' : ''}« Ouvrir la messagerie » prépare le mail et télécharge le PDF : joignez-le avant d’envoyer.</p>`;
    const read = el => ({to: [...api.$$('input[data-to]:checked', el).map(i => i.dataset.to), ...api.$('#mOther', el).value.split(/[,;\s]+/).filter(x => /@/.test(x))],
      subj: api.$('#mSubj', el).value, body: api.$('#mBody', el).value});
    return api.modal({title: 'Envoyer par mail', body: html, wide: true, actions: [
      {label: 'Annuler', value: null},
      {label: 'Ouvrir la messagerie', onClick: el => { const m = read(el); api.download(fileName, blob);
        setTimeout(() => location.href = `mailto:${m.to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(m.subj)}&body=${encodeURIComponent(m.body)}`, 600); return 'mailto'; }},
      ...(canShare ? [{label: 'Partager avec la pièce jointe', kind: 'primary', onClick: el => { const m = read(el);
        if (m.to.length && navigator.clipboard) navigator.clipboard.writeText(m.to.join(', ')).catch(() => {});
        navigator.share({files: [file], title: m.subj, text: m.body}).then(() => api.toast(m.to.length ? 'Adresses copiées : collez-les dans « À » avant d’envoyer.' : 'Partage ouvert'))
          .catch(e => { if (e.name !== 'AbortError') api.toast('Partage impossible : ' + e.message, 'error'); });
        return 'share'; }}] : [])]});
  }
  return {open};
})();
