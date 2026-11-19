/* Mon Bureau — moteur de modèles (champs de fusion) et génération de PDF.
   Les modèles sont du HTML simple (paragraphes, titres, listes, gras, italique,
   alignement) contenant des champs {{cle}}. Le PDF est produit sur l'appareil
   avec pdf-lib (polices Helvetica standard, format A4). */
'use strict';

App.fields = (() => {
  const groups = [];
  function register(id, label, fields, resolve) {
    const g = groups.find(x => x.id === id);
    if (g) { g.fields = fields; g.resolve = resolve; } else groups.push({id, label, fields, resolve});
  }
  // Valeurs de tous les champs pour un contexte donné ({person, ...}).
  function values(ctx = {}) {
    const out = {};
    for (const g of groups) { try { Object.assign(out, g.resolve(ctx) || {}); } catch (e) { console.warn(e); } }
    return out;
  }
  function label(key) { for (const g of groups) { const f = g.fields.find(x => x.key === key); if (f) return f.label; } return key; }
  return {groups, register, values, label};
})();

// Champs fournis par le socle.
App.fields.register('personne', 'Destinataire', [
  {key: 'civilite', label: 'Civilité'}, {key: 'prenom', label: 'Prénom'}, {key: 'nom', label: 'Nom'},
  {key: 'nom_complet', label: 'Prénom Nom'}, {key: 'assemblee', label: 'Assemblée'},
  {key: 'telephone', label: 'Portable'}, {key: 'email', label: 'Mail'},
  {key: 'naissance', label: 'Date de naissance'}, {key: 'age', label: 'Âge'}, {key: 'bapteme', label: 'Date de baptême'}, {key: 'annees_bapteme', label: 'Années depuis le baptême'}, {key: 'fonction', label: 'Fonction'},
  {key: 'adresse', label: 'Adresse'}, {key: 'cp', label: 'Code postal'}, {key: 'ville', label: 'Ville'}
], ({person: p}) => p ? {
  civilite: p.civilite || '', prenom: p.prenom || '', nom: (p.nom || '').toUpperCase(),
  nom_complet: [p.prenom, (p.nom || '').toUpperCase()].filter(Boolean).join(' '),
  assemblee: p.assemblee || '', telephone: p.telephone || '', email: p.email || '',
  adresse: p.adresse || '', cp: p.cp || '', ville: p.ville || '',
  naissance: App.annuaire.fmtDate(p.naissance), age: p.naissance ? App.annuaire.yearsSince(p.naissance) + ' ans' : '',
  bapteme: App.annuaire.fmtDate(p.bapteme), annees_bapteme: p.bapteme ? App.annuaire.yearsSince(p.bapteme) + ' ans' : '', fonction: p.fonction || ''
} : {});
App.fields.register('expediteur', 'Expéditeur (vous)', [
  {key: 'exp_prenom', label: 'Mon prénom'}, {key: 'exp_nom', label: 'Mon nom'}, {key: 'exp_fonction', label: 'Ma fonction'},
  {key: 'exp_telephone', label: 'Mon téléphone'}, {key: 'exp_email', label: 'Mon mail'}, {key: 'exp_entete', label: 'En-tête'}
], () => {
  const p = App.api.data?.settings?.profil || {};
  return {exp_prenom: p.prenom, exp_nom: (p.nom || '').toUpperCase(), exp_fonction: p.fonction, exp_telephone: p.telephone, exp_email: p.email, exp_entete: p.entete};
});
App.fields.register('dates', 'Dates', [{key: 'date_jour', label: 'Date du jour'}], () => ({date_jour: App.api.dateLongue()}));

App.pdf = (() => {
  const {esc} = App.api;
  const merge = (html, values) => html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => k in values ? esc(values[k] ?? '') : m);

  // Caractères encodables avec les polices standard (WinAnsi) ; les autres sont remplacés.
  const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const REPL = {' ': ' ', ' ': ' ', ' ': ' ', '⚫': '•', '●': '•', '◦': '•', '✓': 'v', '‐': '-', '‑': '-', '−': '-'};
  function clean(s) {
    let out = '';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (REPL[ch] !== undefined) out += REPL[ch];
      else if ((c >= 32 && c <= 126) || (c >= 161 && c <= 255) || EXTRA.includes(ch)) out += ch;
      else if (c === 9) out += ' ';
      // les autres (émojis, sélecteurs de variante…) sont ignorés
    }
    return out;
  }

  // Transforme le HTML en blocs : {type, align, size, runs:[{text,bold,italic}|{br:true}], indent, bullet}
  function toBlocks(html) {
    const root = document.createElement('div'); root.innerHTML = html;
    const blocks = [];
    const BLOCK = /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/;
    function alignOf(el) { const a = (el.style && el.style.textAlign) || el.getAttribute?.('align') || ''; return /center|right|justify/.test(a) ? a : 'left'; }
    function collect(node, style, runs) {
      if (node.nodeType === 3) { if (node.nodeValue) runs.push({text: node.nodeValue.replace(/\s+/g, ' '), ...style}); return; }
      if (node.nodeType !== 1) return;
      if (node.tagName === 'BR') { runs.push({br: true}); return; }
      const s = {...style};
      const fw = node.style?.fontWeight;
      if (/^(B|STRONG)$/.test(node.tagName) || fw === 'bold' || Number(fw) >= 600) s.bold = true;
      if (/^(I|EM)$/.test(node.tagName) || node.style?.fontStyle === 'italic') s.italic = true;
      for (const ch of node.childNodes) collect(ch, s, runs);
    }
    function walk(node, ctx) {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 1 && (ch.tagName === 'UL' || ch.tagName === 'OL')) {
          let n = 0; for (const li of ch.children) { n++; const runs = []; collect(li, {}, runs); blocks.push({align: 'left', size: 11, runs, indent: 18, bullet: ch.tagName === 'OL' ? n + '.' : '•'}); }
        } else if (ch.nodeType === 1 && BLOCK.test(ch.tagName)) {
          const hasBlockChild = [...ch.children].some(c => BLOCK.test(c.tagName) || c.tagName === 'UL' || c.tagName === 'OL');
          if (hasBlockChild) { walk(ch, ctx); continue; }
          const runs = []; collect(ch, ch.tagName.startsWith('H') ? {bold: true} : {}, runs);
          const size = ch.tagName === 'H1' ? 18 : ch.tagName === 'H2' ? 15 : ch.tagName === 'H3' ? 12.5 : 11;
          blocks.push({align: alignOf(ch), size, runs});
        } else {
          const runs = []; collect(ch, {}, runs);
          if (runs.some(r => r.br || r.text.trim())) blocks.push({align: 'left', size: 11, runs});
        }
      }
    }
    walk(root, {});
    return blocks;
  }

  async function render(html, {title = 'Document'} = {}) {
    const {PDFDocument, StandardFonts, rgb} = window.PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(title); doc.setCreator('Mon Bureau'); doc.setProducer('Mon Bureau');
    const fonts = {
      r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold),
      i: await doc.embedFont(StandardFonts.HelveticaOblique), bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique)
    };
    const fontOf = r => fonts[(r.bold ? 'b' : '') + (r.italic ? 'i' : '') || 'r'];
    const W = 595.28, H = 841.89, M = 56, maxW = W - 2 * M;
    let page = doc.addPage([W, H]), y = H - M;
    const newPage = () => { page = doc.addPage([W, H]); y = H - M; };

    for (const blk of toBlocks(html)) {
      const size = blk.size, lh = size * 1.38, indent = blk.indent || 0, width = maxW - indent;
      // Découpe en mots en conservant la mise en forme.
      const lines = [[]]; let lineW = 0;
      const pushWord = (word, r) => {
        const f = fontOf(r), w = f.widthOfTextAtSize(word, size);
        const isSpace = word === ' ';
        if (!isSpace && lineW + w > width && lines.at(-1).length) {
          while (lines.at(-1).length && lines.at(-1).at(-1).text === ' ') lines.at(-1).pop();
          lines.push([]); lineW = 0;
        }
        if (isSpace && !lines.at(-1).length) return;
        lines.at(-1).push({text: word, font: f, w}); lineW += w;
      };
      const runs = blk.runs.slice();
      if (runs.length && runs.at(-1).br) runs.pop(); // un <br> final ne crée pas de ligne (convention des navigateurs)
      for (const r of runs) {
        if (r.br) { lines.at(-1).hard = true; lines.push([]); lineW = 0; continue; }   // ligne finie par un retour : jamais justifiée
        for (const part of clean(r.text).split(/( )/)) if (part) pushWord(part, r);
      }
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        while (line.length && line.at(-1).text === ' ') line.pop();
        if (y - lh < M) newPage();
        const total = line.reduce((s, p) => s + p.w, 0);
        let x = M + indent;
        if (blk.align === 'center') x += (width - total) / 2; else if (blk.align === 'right') x += width - total;
        if (li === 0 && blk.bullet) page.drawText(blk.bullet, {x: M + 4, y: y - size, size, font: fonts.r, color: rgb(0.12, 0.13, 0.16)});
        let gap = 0;
        if (blk.align === 'justify' && li < lines.length - 1 && !line.hard) { const spaces = line.filter(p => p.text === ' ').length; if (spaces) gap = (width - total) / spaces; }
        for (const p of line) {
          if (p.text !== ' ') page.drawText(p.text, {x, y: y - size, size, font: p.font, color: rgb(0.12, 0.13, 0.16)});
          x += p.w + (p.text === ' ' ? gap : 0);
        }
        y -= lh;
      }
      y -= size * 0.45; // espace après le paragraphe
    }
    return doc.save();
  }

  const fileName = s => clean(String(s)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'document';
  return {merge, render, toBlocks, fileName, clean};
})();
