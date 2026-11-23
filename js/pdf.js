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
App.fields.register('dates', 'Dates', [{key: 'date_jour', label: 'Date du jour'}, {key: 'date_jour_complet', label: 'Date du jour (avec le jour)'}], () => ({date_jour: App.api.dateLongue(), date_jour_complet: new Date().toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}));

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

  /* Transforme le HTML en blocs : {align, size, runs, indent, bullet, bg, rule, before}.
     Runs : texte {text, bold, italic, underline, color, bg, size} · {br} · {img, w, h} · cellules de largeur fixe {cellStart}/{cellEnd: largeur}.
     Mise en forme reconnue : gras, italique, souligné, couleur du texte, surlignage, taille (pt/px), alignement,
     retrait (margin-left / padding-left), fond de paragraphe, filet bas (border-bottom), espace avant (margin-top),
     images (data:), tabulations par <span style="display:inline-block;width:…">. */
  const toPt = v => { const m = /([\d.]+)\s*(pt|px|em|cm|mm)?/.exec(String(v || '')); if (!m) return 0; const n = +m[1];
    return m[2] === 'px' ? n * .75 : m[2] === 'em' ? n * 11 : m[2] === 'cm' ? n * 28.35 : m[2] === 'mm' ? n * 2.835 : n; };
  const colorOf = v => { if (!v || v === 'transparent' || /^rgba\(.*,\s*0\)$/.test(v)) return null; let m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v); if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim()); if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1]; return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16) / 255); }
    return {red: [.85, 0, 0], yellow: [1, 1, 0], black: [0, 0, 0], blue: [0, 0, .8], green: [0, .5, 0]}[v.trim()] || null; };
  function toBlocks(html) {
    const root = document.createElement('div'); root.innerHTML = html;
    const blocks = [];
    const BLOCK = /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/;
    function alignOf(el) { const a = (el.style && el.style.textAlign) || el.getAttribute?.('align') || ''; return /center|right|justify/.test(a) ? a : 'left'; }
    function collect(node, style, runs) {
      if (node.nodeType === 3) { if (node.nodeValue) runs.push({text: node.nodeValue.replace(/\s+/g, ' '), ...style}); return; }
      if (node.nodeType !== 1) return;
      if (node.tagName === 'BR') { runs.push({br: true}); return; }
      if (node.tagName === 'IMG') { const src = node.getAttribute('src') || ''; if (/^data:image\/(png|jpe?g)/i.test(src)) {
        const w = toPt(node.style.width) || (+node.getAttribute('width') || 0) * .75 || 100, h = toPt(node.style.height) || (+node.getAttribute('height') || 0) * .75 || 0;
        runs.push({img: src, w, h}); } return; }
      const s = {...style}, st = node.style || {};
      const fw = st.fontWeight;
      if (/^(B|STRONG)$/.test(node.tagName) || fw === 'bold' || Number(fw) >= 600) s.bold = true;
      if (fw === 'normal' || fw === '400') s.bold = false;
      if (/^(I|EM)$/.test(node.tagName) || st.fontStyle === 'italic') s.italic = true;
      if (node.tagName === 'U' || /underline/.test(st.textDecoration || st.textDecorationLine || '')) s.underline = true;
      if (node.tagName === 'MARK') s.bg = [1, 1, 0];
      const c = colorOf(st.color || node.getAttribute?.('color')); if (c) s.color = c;
      const b = colorOf(st.backgroundColor); if (b && node.tagName !== 'P' && node.tagName !== 'DIV') s.bg = b;
      if (st.fontSize) s.size = toPt(st.fontSize);
      const cell = st.display === 'inline-block' && st.width;
      if (cell) runs.push({cellStart: true});
      for (const ch of node.childNodes) collect(ch, s, runs);
      if (cell) runs.push({cellEnd: toPt(st.width)});
    }
    function blockStyle(el) { const st = el.style || {};
      // cadre complet (border: 1px solid …) : paragraphe encadré
      const box = /solid|double/.test(st.borderTopStyle || '') && /solid|double/.test(st.borderLeftStyle || '') ? (colorOf(st.borderTopColor) || [0, 0, 0]) : null;
      return {box, bg: colorOf(st.backgroundColor), rule: !box && /solid|double/.test(st.borderBottom || st.borderBottomStyle || ''), before: toPt(st.marginTop), ind: toPt(st.marginLeft) + toPt(st.paddingLeft), size: st.fontSize ? toPt(st.fontSize) : 0}; }
    function walk(node, ind, dsz = 11) {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 1 && (ch.tagName === 'UL' || ch.tagName === 'OL')) {
          const bs = blockStyle(ch); let n = 0;
          for (const li of ch.children) {
            n++; const hasBlockChild = [...li.children].some(c => BLOCK.test(c.tagName));
            const lbs = blockStyle(li), runs = [];
            if (hasBlockChild) { const first = li.firstElementChild; collect(BLOCK.test(first.tagName) ? first : li, {}, runs);
              blocks.push({align: alignOf(li), size: lbs.size || bs.size || dsz, runs, indent: ind + bs.ind + 18, bullet: ch.tagName === 'OL' ? n + '.' : '•'});
              const rest = document.createElement('div'); for (const c of [...li.childNodes].slice([...li.childNodes].indexOf(first) + 1)) rest.appendChild(c.cloneNode(true)); walk(rest, ind + bs.ind + 18, lbs.size || bs.size || dsz); }
            else { collect(li, {}, runs); blocks.push({align: alignOf(li), size: lbs.size || bs.size || dsz, runs, indent: ind + bs.ind + 18, bullet: ch.tagName === 'OL' ? n + '.' : '•', bg: lbs.bg, before: lbs.before}); }
          }
        } else if (ch.nodeType === 1 && BLOCK.test(ch.tagName)) {
          const bs = blockStyle(ch);
          const hasBlockChild = [...ch.children].some(c => BLOCK.test(c.tagName) || c.tagName === 'UL' || c.tagName === 'OL');
          if (hasBlockChild) { const start = blocks.length; walk(ch, ind + bs.ind, bs.size || dsz); if (bs.bg) for (const b of blocks.slice(start)) b.bg ??= bs.bg; continue; }
          const runs = []; collect(ch, ch.tagName.startsWith('H') ? {bold: true} : {}, runs);
          const size = bs.size || (ch.tagName === 'H1' ? 18 : ch.tagName === 'H2' ? 15 : ch.tagName === 'H3' ? 12.5 : dsz);
          blocks.push({align: alignOf(ch), size, runs, indent: ind + bs.ind, bg: bs.bg, box: bs.box, rule: bs.rule, before: bs.before});
        } else {
          const runs = []; collect(ch, {}, runs);
          if (runs.some(r => r.br || r.img || (r.text && r.text.trim()))) blocks.push({align: 'left', size: dsz, runs, indent: ind});
        }
      }
    }
    walk(root, 0);
    return blocks;
  }

  async function render(html, {title = 'Document', margin = 56} = {}) {
    const {PDFDocument, StandardFonts, rgb} = window.PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(title); doc.setCreator('Mon Bureau'); doc.setProducer('Mon Bureau');
    const fonts = {
      r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold),
      i: await doc.embedFont(StandardFonts.HelveticaOblique), bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique)
    };
    const fontOf = r => fonts[(r.bold ? 'b' : '') + (r.italic ? 'i' : '') || 'r'];
    const imgs = new Map();
    const imgOf = async src => { if (!imgs.has(src)) { const bytes = Uint8Array.from(atob(src.split(',')[1]), c => c.charCodeAt(0)); imgs.set(src, /png/i.test(src.slice(0, 20)) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)); } return imgs.get(src); };
    const INK = [0.12, 0.13, 0.16], col = c => rgb(...(c || INK));
    const mm = /data-marge="(\d+(?:\.\d+)?)"/.exec(html); if (mm) margin = +mm[1];   // marge propre au modèle
    const W = 595.28, H = 841.89, M = margin, maxW = W - 2 * M;
    let page = doc.addPage([W, H]), y = H - M;
    const newPage = () => { page = doc.addPage([W, H]); y = H - M; };

    for (const blk of toBlocks(html)) {
      const size = blk.size, indent = blk.indent || 0, width = maxW - indent;
      // Découpe en morceaux (mots, espaces, images, blancs de tabulation) en conservant la mise en forme
      const lines = [[]]; let lineW = 0; const cells = [];
      const push = p => {
        const isSpace = p.text === ' ';
        if (!isSpace && lineW + p.w > width && lines.at(-1).length) {
          while (lines.at(-1).length && lines.at(-1).at(-1).text === ' ') lines.at(-1).pop();
          lines.push([]); lineW = 0; for (const c of cells) c.start = 0;
        }
        if (isSpace && !lines.at(-1).length) return;
        lines.at(-1).push(p); lineW += p.w;
      };
      const runs = blk.runs.slice();
      if (runs.length && runs.at(-1).br) runs.pop(); // un <br> final ne crée pas de ligne (convention des navigateurs)
      for (const r of runs) {
        if (r.br) { lines.at(-1).hard = true; lines.push([]); lineW = 0; continue; }   // ligne finie par un retour : jamais justifiée
        if (r.cellStart) { cells.push({start: lineW}); continue; }
        if (r.cellEnd !== undefined) { const c = cells.pop(); if (c && lineW - c.start < r.cellEnd) push({text: '', w: r.cellEnd - (lineW - c.start), sz: size, spacer: true}); continue; }
        if (r.img) { const im = await imgOf(r.img), w = Math.min(r.w, width), h = r.h || w * im.height / im.width; push({img: im, w, h, sz: h / 1.15}); continue; }
        const sz = r.size || size, f = fontOf(r);
        for (const part of clean(r.text).split(/( )/)) if (part) push({text: part, font: f, w: f.widthOfTextAtSize(part, sz), sz, color: r.color, bg: r.bg, ul: r.underline});
      }
      for (const l of lines) while (l.length && l.at(-1).text === ' ') l.pop();
      const lhOf = l => Math.max(size, ...l.map(p => p.sz || size)) * 1.3;
      const blockH = lines.reduce((a, l) => a + lhOf(l), 0);
      y -= blk.before || 0;
      if ((blk.bg || blk.box) && y - blockH < M && blockH < H - 2 * M) newPage();
      if (blk.bg || blk.box) page.drawRectangle({x: M + indent - 3, y: y - blockH - 2, width: width + 6, height: blockH + 3, ...(blk.bg ? {color: col(blk.bg)} : {}), ...(blk.box ? {borderColor: col(blk.box), borderWidth: .8} : {})});
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li], lh = lhOf(line), base = Math.max(size, ...line.map(p => p.sz || size));
        if (y - lh < M) newPage();
        const total = line.reduce((s, p) => s + p.w, 0);
        let x = M + indent;
        if (blk.align === 'center') x += (width - total) / 2; else if (blk.align === 'right') x += width - total;
        if (li === 0 && blk.bullet) { if (blk.bullet === '•') page.drawCircle({x: M + indent - 11, y: y - base * .68, size: base * .26, color: col()}); else page.drawText(blk.bullet, {x: M + indent - 16, y: y - base, size, font: fonts.r, color: col()}); }
        let gap = 0;
        if (blk.align === 'justify' && li < lines.length - 1 && !line.hard) { const spaces = line.filter(p => p.text === ' ').length; if (spaces) gap = (width - total) / spaces; }
        line.forEach((p, k) => {
          const pw = p.w + (p.text === ' ' ? gap : 0), yb = y - base;
          if (p.bg) page.drawRectangle({x, y: yb - p.sz * .25, width: pw, height: p.sz * 1.18, color: col(p.bg)});
          if (p.img) page.drawImage(p.img, {x, y: yb - p.h * .15, width: p.w, height: p.h});
          else if (p.text && p.text !== ' ') page.drawText(p.text, {x, y: yb, size: p.sz, font: p.font, color: col(p.color)});
          const nextUl = line[k + 1]?.ul;
          if (p.ul && (p.text !== ' ' || nextUl)) page.drawLine({start: {x, y: yb - p.sz * .14}, end: {x: x + pw, y: yb - p.sz * .14}, thickness: Math.max(.5, p.sz * .055), color: col(p.color)});
          x += pw;
        });
        y -= lh;
      }
      if (blk.rule) page.drawLine({start: {x: M + indent, y: y + size * .1}, end: {x: M + indent + width, y: y + size * .1}, thickness: .8, color: col()});
      y -= size * 0.45; // espace après le paragraphe
    }
    return doc.save();
  }

  const fileName = s => clean(String(s)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'document';
  return {merge, render, toBlocks, fileName, clean};
})();
