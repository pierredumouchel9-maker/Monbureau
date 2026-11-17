/* Mon Bureau — lecture de fichiers Excel (.xlsx) et CSV, création d'archives ZIP.
   Sans bibliothèque externe : le .xlsx est un ZIP de fichiers XML, décompressé
   avec DecompressionStream, intégré aux navigateurs récents. */
'use strict';

App.files = (() => {
  /* ---------- Lecture ZIP ---------- */
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buffer) {
    const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Fichier ZIP/Excel illisible.');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {}; const td = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true);
      const start = off + 30 + lnlen + lelen;
      files[name] = {method, data: u8.subarray(start, start + csize)};
      p += 46 + nlen + elen + clen;
    }
    return {
      names: Object.keys(files),
      async text(name) {
        const f = files[name]; if (!f) return null;
        const raw = f.method === 0 ? f.data : await inflateRaw(f.data);
        return new TextDecoder().decode(raw);
      }
    };
  }

  /* ---------- Excel ---------- */
  const colIndex = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const byTag = (node, tag) => [...node.getElementsByTagName(tag)];

  async function readXlsx(file) {
    const z = await unzip(await file.arrayBuffer());
    const shared = [];
    const ss = await z.text('xl/sharedStrings.xml');
    if (ss) for (const si of byTag(xml(ss), 'si')) shared.push(byTag(si, 't').map(t => t.textContent).join(''));
    const wb = xml(await z.text('xl/workbook.xml'));
    const rels = xml(await z.text('xl/_rels/workbook.xml.rels'));
    const relMap = {}; for (const r of byTag(rels, 'Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const sheets = [];
    for (const sh of byTag(wb, 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[rid] || ''; target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const text = await z.text('xl/' + target); if (!text) continue;
      const rows = [];
      for (const row of byTag(xml(text), 'row')) {
        const r = Number(row.getAttribute('r')) - 1; const cells = [];
        for (const c of byTag(row, 'c')) {
          const t = c.getAttribute('t'), v = byTag(c, 'v')[0]?.textContent;
          let val;
          if (t === 's') val = shared[Number(v)];
          else if (t === 'inlineStr') val = byTag(c, 't').map(x => x.textContent).join('');
          else if (t === 'b') val = v === '1';
          else if (t === 'str' || t === 'e') val = v ?? '';
          else val = v === undefined ? '' : (isNaN(Number(v)) ? v : Number(v));
          cells[colIndex(c.getAttribute('r'))] = val;
        }
        rows[r] = cells;
      }
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
      sheets.push({name: sh.getAttribute('name'), rows: rows.map(r => Array.from(r, x => x ?? ''))});
    }
    return sheets;
  }

  /* ---------- CSV ---------- */
  function readCsv(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return [{name: 'CSV', rows}];
  }

  /* ---------- PDF (texte) ---------- */
  // Reconstitue un tableau à partir des positions du texte : une ligne par hauteur,
  // des colonnes déduites des alignements verticaux répétés sur la page.
  async function readPdf(file) {
    const base = document.baseURI;
    const pdfjs = await import(new URL('lib/pdfjs/pdf.min.mjs', base).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs/pdf.worker.min.mjs', base).href;
    const doc = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise;
    const items = await pdfItems(doc);
    for (const reader of [readFichesS21, readFamilles, readContactsUrgence, readFichesEtiquettes, readFamillesCoteACote, readTableauAncre]) {
      try { const r = reader(items, file); if (r) return r; } catch (e) { console.warn('Lecture PDF', reader.name, e); }
    }
    const lines = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter(i => i.str && i.str.trim()).map(i => ({x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10, str: i.str}));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines = [];
      for (const it of items) {
        const l = pageLines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
        l ? l.items.push(it) : pageLines.push({y: it.y, items: [it]});
      }
      pageLines.sort((a, b) => b.y - a.y);
      for (const l of pageLines) {
        l.items.sort((a, b) => a.x - b.x);
        const cells = [];
        for (const it of l.items) {
          const c = cells.at(-1);
          const gap = c ? it.x - c.end : Infinity;
          if (c && gap < it.h * 0.7) { c.text += (gap > it.h * 0.12 ? ' ' : '') + it.str; c.end = it.x + it.w; }
          else cells.push({x: it.x, end: it.x + it.w, text: it.str});
        }
        lines.push({page: n, cells});
      }
      page.cleanup();
    }
    if (!lines.length) throw new Error('Ce PDF ne contient pas de texte lisible (document scanné ?). Seuls les PDF créés depuis un logiciel (Word, Excel…) peuvent être lus pour l’instant.');
    // Colonnes : regroupement des débuts de cellules proches.
    const xs = lines.flatMap(l => l.cells.map(c => c.x)).sort((a, b) => a - b);
    const cols = [];
    for (const x of xs) { const c = cols.at(-1); if (c && x - c.last <= 12) { c.last = x; c.n++; } else cols.push({start: x, last: x, n: 1}); }
    const starts = cols.map(c => c.start);
    const rows = lines.map(l => {
      const r = new Array(starts.length).fill('');
      for (const c of l.cells) {
        let idx = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= c.x + 1) idx = i;
        r[idx] = r[idx] ? r[idx] + ' ' + c.text : c.text;
      }
      return r.map(s => s.replace(/\s+/g, ' ').trim());
    });
    // Retire les colonnes toujours vides.
    const keep = starts.map((_, i) => rows.some(r => r[i]));
    return [{name: file.name.replace(/\.pdf$/i, '') + ` (PDF, ${doc.numPages} page${doc.numPages > 1 ? 's' : ''})`, rows: rows.map(r => r.filter((_, i) => keep[i]))}];
  }


  /* ---------- Outils communs aux listes PDF ---------- */
  // Tous les morceaux de texte de chaque page, avec position et caractère gras.
  async function pdfItems(doc) {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter(i => i.str && i.str.trim()).map(i => ({x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10, str: i.str, font: i.fontName, page: n}));
      await page.getOperatorList();   // charge les polices (gras, cases à cocher)
      for (const it of items) { try { const f = page.commonObjs.get(it.font); it.fname = (f && (f.name || f.loadedName)) || ''; } catch { it.fname = ''; } it.bold = /bold|black|heavy|semibold/i.test(it.fname); }
      pages.push(items); page.cleanup();
    }
    return pages;
  }
  // Regroupe des morceaux en lignes (du haut vers le bas), chaque ligne triée de gauche à droite.
  function toLines(items) {
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x), lines = [];
    for (const it of sorted) { const l = lines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35)); l ? l.items.push(it) : lines.push({y: it.y, items: [it]}); }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(); }
    return lines;
  }
  const fmtTel = t => { const d = String(t || '').replace(/\D/g, '').replace(/^33(?=[1-9])/, '0'); return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, '$1 ') : String(t || '').trim(); };
  function splitAdresse(a) {
    a = String(a || '').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
    // code postal répété (« 50600 "la Ruptière" 50600 Les Loges ») : on garde le dernier, on retire le premier de la rue
    const all = [...a.matchAll(/\b(\d{2}) ?(\d{3})\b/g)];
    if (all.length > 1 && all.every(x => x[1] + x[2] === all[0][1] + all[0][2])) a = a.slice(0, all[0].index) + a.slice(all[0].index + all[0][0].length);
    const m = a.trim().match(/^(.*?)[,\s-]*\b(\d{2}) ?(\d{3})\b\s*(.*)$/);
    if (!m) return {adresse: a.trim(), cp: '', ville: ''};
    let street = m[1].replace(/[,\s-]+$/, ''), ville = m[4].replace(/\bcedex\b.*$/i, '').replace(/^[,\s-]+/, '').trim();
    if (!street && ville) { street = ''; }
    return {adresse: street, cp: m[2] + m[3], ville: ville.toUpperCase()};
  }
  // « Prénom NOM » ou « NOM Prénom » : le nom est en majuscules ; sinon on s'aide du nom de famille connu.
  function splitNom(full, famille = '') {
    const toks = String(full || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const isUp = t => t.length > 1 && t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t);
    const up = toks.filter(isUp);
    if (up.length && up.length < toks.length) return {nom: up.join(' '), prenom: toks.filter(t => !isUp(t)).join(' ')};
    const fam = String(famille).replace(/[,(].*$/, '').trim().toLowerCase();
    if (fam) {
      const n = fam.split(' ').length, head = toks.slice(0, n).join(' ').toLowerCase(), tail = toks.slice(-n).join(' ').toLowerCase();
      if (head === fam) return {nom: toks.slice(0, n).join(' ').toUpperCase(), prenom: toks.slice(n).join(' ')};
      if (tail === fam) return {nom: toks.slice(-n).join(' ').toUpperCase(), prenom: toks.slice(0, -n).join(' ')};
    }
    return {nom: (toks[0] || '').toUpperCase(), prenom: toks.slice(1).join(' ')};
  }
  const pdfTitle = (pages, minX = 300) => { const p1 = pages[0], topY = Math.max(...p1.map(i => i.y)); return p1.filter(i => Math.abs(i.y - topY) < 4 && i.x > minX).sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim().toUpperCase(); };

  /* Fiches « Activité du proclamateur » (S-21) : une fiche par personne avec Nom, dates, cases Homme/Femme, Ancien/Assistant. */
  function readFichesS21(pages, file) {
    const cards = pages.filter(p => p.some(i => /^Nom\s*:/.test(i.str.trim())) && p.some(i => /ACTIVIT[ÉE] DU PROCLAMATEUR/i.test(i.str)));
    if (!cards.length) return null;
    const asm = pdfTitle(pages);
    const rows = [['Civilité', 'Nom', 'Prénom', 'Date de naissance', 'Date de baptême', 'Fonction', 'Assemblée']], seen = new Set();
    for (const p of cards) {
      const lines = toLines(p);
      const val = re => { const l = lines.find(l => re.test(l.text)); return l ? l.text.replace(re, '').trim() : ''; };
      const checked = label => { for (const l of lines) { const i = l.items.findIndex(it => it.str.trim() === label || it.str.trim().startsWith(label)); if (i > 0) { const box = l.items[i - 1]; if (/wingding|symbol/i.test(box.fname) || /^[þ¨]$/.test(box.str.trim())) return box.str.trim() === 'þ'; } } return false; };
      const full = val(/^Nom\s*:\s*/); if (!full || !full.split(' ').some(t => t.length > 1 && t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t))) continue;
      const {nom, prenom} = splitNom(full);
      const key = (nom + ' ' + prenom).toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      const date = re => (val(re).match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [''])[0];
      rows.push([checked('Homme') ? 'Frère' : checked('Femme') ? 'Sœur' : '', nom, prenom, date(/^Date de naissance\s*:\s*/), date(/^Date de bapt[êe]me\s*:?\s*/), checked('Ancien') ? 'Ancien' : checked('Assistant') ? 'Assistant' : '', asm]);
    }
    return rows.length > 1 ? [{name: `${file.name.replace(/\.pdf$/i, '')} — fiches S-21 (${rows.length - 1} proclamateurs)`, rows}] : null;
  }

  /* Liste « Famille | Adresse | Informations » (Cherbourg, Saint-Hilaire…) : une famille, son adresse, puis chaque membre avec téléphones et mail. */
  function readFamilles(pages, file) {
    const all = pages.flat();
    const hF = all.find(i => i.str.trim() === 'Famille'), hA = all.find(i => i.str.trim() === 'Adresse' && hF && Math.abs(i.y - hF.y) < 3 && i.page === hF.page);
    const hI = all.find(i => /Informations/.test(i.str) && hF && Math.abs(i.y - hF.y) < 3 && i.page === hF.page);
    if (!hF || !hA || !hI) return null;
    const xA = hA.x - 6, xI = Math.min(hI.x, ...all.filter(i => i.page === hI.page && Math.abs(i.y - hI.y) < 3 && i.x > hA.x + 40).map(i => i.x)) - 6;
    const asm = pdfTitle(pages);
    const people = [];
    let fam = null;
    for (const p of pages) {
      for (const l of toLines(p)) {
        const c1 = l.items.filter(i => i.x < xA).map(i => i.str).join(' ').trim(), c2 = l.items.filter(i => i.x >= xA && i.x < xI).map(i => i.str).join(' ').trim(), c3 = l.items.filter(i => i.x >= xI).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
        if (/^(Personne|Famille)\b/.test(l.text) || /Tous les groupes|Proclamateurs actifs|Imprim[ée]|NW ?S|Desktop/i.test(l.text) || /^Page \d|^\d+\s*\/\s*\d+$/.test(l.text)) continue;
        if (c1 && !/^\d+$/.test(c1)) { fam = {nom: c1, addr: [], cur: null}; }
        if (!fam) continue;
        if (c2) fam.addr.push(c2);
        if (!c3) continue;
        // fin d'un mail coupé sur deux lignes (« gmail.com »)
        if (!/\s/.test(c3) && /^[a-z0-9._-]+$/.test(c3) && /\./.test(c3) && fam.cur && fam.cur.mail && !/\.[a-z]{2,4}$/.test(fam.cur.mail)) { fam.cur.mail += c3; continue; }
        if (!/\s/.test(c3) && /^[a-z0-9._-]+$/.test(c3) && fam.cur) { if (fam.cur.mail) fam.cur.mail += c3; continue; }
        if (/@/.test(c3)) { if (fam.cur && !fam.cur.mail) fam.cur.mail = (c3.replace(/\s+/g, '').match(/[^\s()]+@[^\s()]+/) || [''])[0]; continue; }
        if (/\((m|f|t)\)/.test(c3) || /^[\d .+()-]{8,}$/.test(c3)) { if (fam.cur) { const m = c3.match(/\(m\)\s*([\d .+]{8,})/), f = c3.match(/\((f|t)\)\s*([\d .+]{8,})/); if (m && !fam.cur.tel) fam.cur.tel = fmtTel(m[1]); else if (f && !fam.cur.tel) fam.cur.tel = fmtTel(f[2]); } continue; }
        fam.cur = {full: c3, fam, tel: '', mail: ''}; people.push(fam.cur);
      }
    }
    if (!people.length) return null;
    const rows = [['Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville', 'Portable', 'Mail', 'Assemblée']];
    for (const p of people) {
      const {nom, prenom} = splitNom(p.full, p.fam.nom), a = splitAdresse(p.fam.addr.join(' '));
      rows.push([nom, prenom, a.adresse, a.cp, a.ville, p.tel, p.mail, asm]);
    }
    return [{name: `${file.name.replace(/\.pdf$/i, '')} — liste par familles (${people.length} personnes)`, rows}];
  }


  const DATE_RE = /(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})/g;
  const datesIn = t => [...String(t || '').matchAll(DATE_RE)].map(m => `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`);
  const pickTel = t => { const nums = (String(t || '').match(/(\+33\s?|0)[1-9](?:[ .\-]?\d{2}){4}/g) || []).map(fmtTel); return nums.find(n => /^0[67]/.test(n)) || nums[0] || ''; };
  const pickMail = t => (String(t || '').replace(/\s+(?=\S*@)|(?<=@\S*)\s+(?=[\w.-]+\.\w{2,}\b)/g, '').match(/[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/) || [''])[0];

  /* Fiches à étiquettes (Villedieu) : « Nom, Prénom » puis « ADRESSE: … », « EMAIL: … », « TÉLÉPHONE MOBILE: … ». */
  function readFichesEtiquettes(pages, file) {
    const all = pages.flat(); if (all.filter(i => /^ADRESSE\s*:/i.test(i.str.trim())).length < 5) return null;
    const people = []; let cur = null;
    for (const p of pages) for (const l of toLines(p)) {
      const t = l.text;
      const mA = /ADRESSE\s*:\s*(.*?)(\s+GROUPE\s*:.*)?$/i.exec(t), mE = /E-?MAIL\s*:\s*(\S+)/i.exec(t), mT = /T[ÉE]L[ÉE]PHONE\s+(MOBILE|FIXE|PORTABLE)?\s*:\s*(.+)$/i.exec(t);
      if (mA && cur) { cur.adr = mA[1]; continue; }
      if (mE && cur) { if (!cur.mail) cur.mail = mE[1]; continue; }
      if (mT && cur) { const n = fmtTel(mT[2]); if (!cur.tel || (/MOBILE|PORTABLE/i.test(mT[1] || '') && !/^0[67]/.test(cur.tel))) cur.tel = n; continue; }
      const mN = /^([^:,]{2,40}),\s*([^:]{1,40})$/.exec(t);
      if (mN && !/@|\d/.test(t)) { cur = {nom: mN[1].trim().toUpperCase(), prenom: mN[2].trim(), adr: '', mail: '', tel: ''}; people.push(cur); }
    }
    if (!people.length) return null;
    const asm = pdfTitle(pages, 0).replace(/\s*LISTE DE CONTACTS.*$/i, '');
    const rows = [['Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville', 'Portable', 'Mail', 'Assemblée']];
    for (const p of people) { const parts = p.adr.split(',').map(x => x.trim()), ci = parts.findIndex(x => /^\d{5}$/.test(x));
      const a = ci >= 0 ? {adresse: parts.slice(0, ci).join(', '), cp: parts[ci], ville: parts.slice(ci + 1).join(', ').toUpperCase()} : splitAdresse(p.adr);
      rows.push([p.nom, p.prenom, a.adresse, a.cp, a.ville, p.tel, p.mail, asm]); }
    return [{name: `${file.name.replace(/\.pdf$/i, '')} — fiches (${people.length} personnes)`, rows}];
  }

  /* Familles présentées sur deux blocs côte à côte (Granville) : NOM de famille et adresse à gauche, prénoms à droite du bloc. */
  function readFamillesCoteACote(pages, file) {
    const isFam = t => /^[A-ZÀ-Ý][A-ZÀ-Ý'\-]+( [A-ZÀ-Ý'\-]+)*( \(.*\))?$/.test(t) && !/\d/.test(t) && t.length > 1;
    const starts = {};
    for (const p of pages) for (const f of p) if (isFam(f.str.trim()) && f.str.trim().length > 2) starts[Math.round(f.x / 10)] = (starts[Math.round(f.x / 10)] || 0) + 1;
    const blocks = Object.entries(starts).filter(([, n]) => n >= 5).map(([k]) => +k * 10).sort((a, b) => a - b);
    if (blocks.length !== 2 || blocks[1] - blocks[0] < 300) return null;
    // un tableau avec une ligne de titres relève d'un autre lecteur
    const nrm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.:]/g, ' ').trim();
    if (toLines(pages[0]).slice(0, 25).some(l => l.items.filter(it => COLKEYS.some(([, re]) => re.test(nrm(it.str)))).length >= 3)) return null;
    const people = [];
    blocks.forEach((b0, bi) => {
      const hi = bi === 0 ? blocks[1] - 5 : 1e9, c2a = b0 + 112, c2b = b0 + 178;
      for (const p of pages) {
        let fam = null;
        for (const l of toLines(p.filter(i => i.x >= b0 - 5 && i.x < hi))) {
          if (/^page \d/i.test(l.text)) continue;
          const c1 = l.items.filter(i => i.x < c2a).map(i => i.str).join(' ').trim(), c2 = l.items.filter(i => i.x >= c2a && i.x < c2b).map(i => i.str).join(' ').trim();
          if (c1 && isFam(c1)) { fam = {nom: c1.replace(/\s*\(.*\)/, '').trim(), addr: [], prenoms: []}; people.push(fam); }
          else if (fam && c1) { if (/Salle du Royaume/i.test(c1)) fam.stop = true; if (!fam.stop && !/^Fixe/i.test(c1)) fam.addr.push(c1.replace(/\s*Fixe\d?$/i, '')); }
          if (fam && c2 && !fam.stop) { const clean = c2.split(' ').filter(t => !/@|\d/.test(t)).join(' '); fam.prenoms.push(...clean.split(/[,/]/).map(x => x.trim()).filter(x => x && !x.startsWith('(') && x.toLowerCase() !== 'prénom')); }
        }
      }
    });
    const rows = [['Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville']];
    for (const f of people) { const a = splitAdresse(f.addr.join(' ')); for (const pn of f.prenoms) rows.push([f.nom, pn, a.adresse, a.cp, a.ville]); }
    return rows.length > 1 ? [{name: `${file.name.replace(/\.pdf$/i, '')} — familles (${rows.length - 1} personnes)`, rows}] : null;
  }

  /* Tableau à ligne de titres dont les cellules débordent sur plusieurs lignes (Bayeux, Bougy, Saint-Lô, Ouistreham…) :
     colonnes lues sur la ligne de titres ; chaque ligne de texte est rattachée au nom le plus proche. */
  const COLKEYS = [['urgence', /urgen|contacter|appel|personne a|contact|survi|dpa|sac de/], ['mail', /mail|@|courriel/], ['naissance', /naiss/], ['bapteme', /bapt/],
    ['prenom', /^pr[eé]nom/], ['nomcomplet', /nom (et|&) pr[eé]nom|proclamateur/], ['nom', /^nom\b/], ['titre', /^titre$|civilit/], ['cp', /postal|^cp$/], ['ville', /^ville|commune/],
    ['tel', /t[eé]l|portable|mobile|phone/], ['adresse', /adresse/], ['fonction', /fonction|privil/], ['groupe', /groupe|pr[eé]dication/]];
  function readTableauAncre(pages, file) {
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.:]/g, ' ').replace(/\s+/g, ' ').trim();
    const firstLines = toLines(pages[0]).slice(0, 25);
    let hIdx = -1, best = 0;
    firstLines.forEach((l, i) => { const n = l.items.filter(it => COLKEYS.some(([, re]) => re.test(norm(it.str)))).length; if (n > best) { best = n; hIdx = i; } });
    if (best < 3) return null;
    // Titres sur plusieurs lignes : on prend les lignes voisines (± 12 pt) de la ligne principale
    const hl = firstLines[hIdx], hItems = firstLines.filter(l => l === hl || (Math.abs(l.y - hl.y) <= 12 && !/\d|@/.test(l.text))).flatMap(l => l.items);
    const clusters = [];
    for (const it of [...hItems].sort((a, b) => a.x - b.x)) { const c = clusters.find(c => Math.abs(c.x - it.x) <= 14 || (it.x >= c.x && it.x <= c.end + 3)); if (c) { c.words.push(it); c.end = Math.max(c.end, it.x + it.w); c.x = Math.min(c.x, it.x); } else clusters.push({x: it.x, end: it.x + it.w, words: [it]}); }
    clusters.sort((a, b) => a.x - b.x);
    let afterUrg = false;
    const cols = clusters.map(c => { const label = norm(c.words.sort((a, b) => b.y - a.y || a.x - b.x).map(w => w.str).join(' ')); let key = (COLKEYS.find(([, re]) => re.test(label)) || [])[0] || 'autre';
      if (key === 'urgence') afterUrg = true; else if (afterUrg && key !== 'mail') key = 'urgence'; return {x: c.x, mid: (c.x + c.end) / 2, key, label}; });
    const nameKeys = ['nomcomplet', 'nom'], nameCol = cols.find(c => nameKeys.includes(c.key)) || cols[0];
    if (!cols.some(c => ['adresse', 'tel', 'mail', 'naissance', 'cp', 'ville'].includes(c.key))) return null;
    const hdrY = Math.min(...hItems.map(i => i.y)), headWords = new Set(hItems.map(i => i.str.trim()));
    // Les titres sont souvent centrés au-dessus de colonnes alignées à gauche : on cherche les bords gauches
    // qui reviennent souvent dans les données, et chaque titre prend la colonne qui le contient.
    const dataLines = pages.flatMap((p, pi) => toLines(p).filter(l => !(pi === 0 && l.y >= hdrY - 1)));
    const edges = {};
    for (const l of dataLines) for (const it of l.items) { const k = Math.round(it.x / 4); edges[k] = (edges[k] || 0) + 1; }
    const thr = Math.max(3, dataLines.length * 0.12);
    const freq = Object.entries(edges).map(([k, n]) => [k * 4, n]).sort((a, b) => a[0] - b[0]);
    const starts = []; for (const [x, n] of freq) { if (n < thr) continue; const last = starts.at(-1); if (last !== undefined && x - last <= 8) continue; starts.push(x); }
    if (starts.length >= 2) {
      for (const c of cols) { let e = starts[0]; for (const x of starts) if (x <= c.mid) e = x; c.x0 = e; }
      // deux titres dans la même colonne de données : le second garde sa propre position
      cols.forEach((c, i) => { if (i && c.x0 <= cols[i - 1].x0) c.x0 = c.x - 4; });
      cols.forEach(c => c.x = Math.min(c.x, c.x0));
      cols.sort((a, b) => a.x - b.x);
    }
    const colOf = x => { let k = 0; for (let i = 0; i < cols.length; i++) if (cols[i].x <= x + 4) k = i; return k; };
    const titleCol = cols.findIndex(c => c.key === 'titre'), nIdx = cols.indexOf(nameCol);
    const rows = [];
    for (const p of pages) {
      const lines = toLines(p).filter(l => !(p === pages[0] && l.y >= hdrY - 1) && !l.items.every(i => headWords.has(i.str.trim())) && !/catastrophe|Salle du|Royaume|^page \d/i.test(l.text));
      const anchors = [];
      for (const l of lines) {
        const nameTxt = l.items.filter(i => colOf(i.x) === nIdx || (nIdx === 0 && colOf(i.x) === 0) || (cols[colOf(i.x)].key === 'prenom' && false)).map(i => i.str).join(' ').replace(/^\d+\s+/, '').trim();
        const hasTitle = titleCol >= 0 && l.items.some(i => colOf(i.x) === titleCol && /^(M|Mme|Mlle|Melle|M\.)\.?$/.test(i.str.trim()));
        const ok = titleCol >= 0 ? hasTitle : /^[A-ZÀ-Ý][\p{L}'’\-]+/u.test(nameTxt) && /[A-ZÀ-Ý]{2,}|^[A-ZÀ-Ý][a-zà-ÿ]+ [A-ZÀ-Ý]/.test(nameTxt) && !/\d|@/.test(nameTxt);
        if (ok) anchors.push({y: l.y, cells: {}});
      }
      if (!anchors.length) continue;
      const gaps = anchors.slice(1).map((a, i) => anchors[i].y - a.y).sort((a, b) => a - b), maxd = Math.max(4, (gaps[Math.floor(gaps.length / 2)] || 30) * 0.62);
      // Prénom écrit sous le nom (lignes de suite dans la colonne des noms) : chaque ligne appartient au nom au-dessus d'elle
      const below = lines.filter(l => !anchors.some(a => a.y === l.y) && l.items.some(i => colOf(i.x) === nIdx && /^[A-ZÀ-Ý][a-zà-ÿ]/.test(i.str.trim()))).length >= anchors.length * 0.3;
      for (const l of lines) {
        const a = below ? anchors.filter(x => x.y >= l.y - 4).sort((p, q) => p.y - q.y)[0] : anchors.reduce((b, x) => Math.abs(x.y - l.y) < Math.abs(b.y - l.y) ? x : b);
        if (!a || (!below && Math.abs(a.y - l.y) > maxd) || (below && a.y - l.y > Math.max(maxd * 2.5, 30))) continue;
        for (const it of l.items) { const k = cols[colOf(it.x)].key; if (k === 'urgence' || k === 'autre') continue; (a.cells[k] ??= []).push({y: it.y, x: it.x, s: it.str}); }
      }
      for (const a of anchors) {
        const cell = k => (a.cells[k] || []).sort((p, q) => q.y - p.y || p.x - q.x).map(c => c.s).join(' ').replace(/\s+/g, ' ').trim();
        let nom = cell('nom'), prenom = cell('prenom'), comp = cell('nomcomplet');
        if (comp && !nom) ({nom, prenom} = splitNom(comp.replace(/^\d+\s+/, '')));
        else if (nom && !prenom) ({nom, prenom} = splitNom(nom.replace(/^\d+\s+/, '')));
        else nom = nom.replace(/^\d+\s+/, '').toUpperCase();
        if (!nom) continue;
        let adr = cell('adresse'), cp = (cell('cp').match(/\d{5}/) || [''])[0], ville = cell('ville');
        if (!cp) { const s2 = splitAdresse([adr, ville].filter(Boolean).join(' ')); adr = s2.adresse; cp = s2.cp; ville = ville && !s2.ville ? ville : s2.ville; }
        let dn = datesIn(cell('naissance')), db = datesIn(cell('bapteme'));
        if (!db.length && dn.length > 1) db = [dn[1]];
        const f = cell('fonction').toLowerCase(), titre = cell('titre');
        rows.push([titre ? (/^m\.?$/i.test(titre) ? 'Frère' : /^m(me|lle|elle)/i.test(titre) ? 'Sœur' : '') : '', nom, prenom, adr, cp, ville.toUpperCase(), pickTel(cell('tel')), pickMail(cell('mail')), dn[0] || '', db[0] || '', /ancien/.test(f) ? 'Ancien' : /assist/.test(f) ? 'Assistant' : '']);
      }
    }
    if (rows.length < 3) return null;
    return [{name: `${file.name.replace(/\.pdf$/i, '')} — tableau (${rows.length} personnes)`, rows: [['Civilité', 'Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville', 'Portable', 'Mail', 'Date de naissance', 'Date de baptême', 'Fonction'], ...rows]}];
  }

  /* « Liste des contacts en cas d'urgence » (export des assemblées) : colonnes Proclamateur | Famille | Urgence.
     Seule la colonne Proclamateur est lue : le nom en gras, puis l'adresse, puis téléphones (m)/(f) et mail.
     Le résultat est un tableau standard (Nom, Prénom, Adresse, Code postal, Ville, Portable, Mail, Assemblée). */
  function readContactsUrgence(pages, file) {
    if (!pages[0].some(i => /contacts en cas d.urgence/i.test(i.str)) && !pages[0].some(i => i.str.trim() === 'Famille')) return null;
    const all = pages.flat();
    const fam = all.find(i => i.str.trim() === 'Famille'); if (!fam || !all.some(i => i.str.trim().startsWith('Proclamateur'))) return null;
    // Assemblée : texte en haut à droite de la première page (« CAEN IFS »)
    const p1 = pages[0], topY = Math.max(...p1.map(i => i.y));
    const asm = p1.filter(i => Math.abs(i.y - topY) < 3 && i.x > 300).sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
    const limit = fam.x - 5, people = [];
    let cur = null, started = false;
    for (const items of pages) {
      const left = items.filter(i => i.x < limit).sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of left) { const l = lines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35)); l ? l.items.push(it) : lines.push({y: it.y, items: [it]}); }
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        const text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
        if (/^Proclamateur/.test(text)) { started = true; cur = null; continue; }
        if (/^Liste des contacts|^Responsable/.test(text)) { started = false; cur = null; continue; }   // en-tête répété à chaque page
        if (!started || /^Page \d|^\d+\s*\/\s*\d+$/.test(text)) continue;
        if (l.items.every(i => i.bold) && !/@|\(m\)|\(f\)/.test(text)) { cur = {name: text, addr: [], tel: '', fixe: '', mail: '', stop: false}; people.push(cur); continue; }
        if (!cur) continue;
        if (/@/.test(text)) { cur.stop = true; if (!cur.mail) cur.mail = (text.match(/[^\s()]+@[^\s()]+/) || [''])[0]; continue; }
        if (/\((m|f|e)\)/.test(text) || /^[\d .+()-]{8,}$/.test(text)) {
          cur.stop = true;
          const m = text.match(/\(m\)\s*([\d .+]{8,})/); if (m && !cur.tel) cur.tel = m[1].replace(/\D/g, '').replace(/^33/, '0').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
          const f = text.match(/\(f\)\s*([\d .+]{8,})/); if (f && !cur.fixe) cur.fixe = f[1].replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
          const e = text.match(/\(e\)\s*(\S+@\S+)/); if (e && !cur.mail) cur.mail = e[1];
          continue;
        }
        if (!cur.stop) cur.addr.push(text);
      }
    }
    if (!people.length) return null;
    const rows = [['Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville', 'Portable', 'Mail', 'Assemblée']];
    for (const p of people) {
      const toks = p.name.split(' '), up = toks.filter(t => t.length > 1 && t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t));
      const nom = up.length && up.length < toks.length ? up.join(' ') : toks[0], prenom = toks.filter(t => !nom.split(' ').includes(t)).join(' ');
      const a = p.addr.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim(), m = a.match(/^(.*?)[,\s]*\b(\d{2}) ?(\d{3})\b\s*(.*)$/);
      const street = m ? m[1].replace(/[,\s]+$/, '') : a, cp = m ? m[2] + m[3] : '', ville = m ? m[4].replace(/\bcedex\b.*$/i, '').trim().toUpperCase() : '';
      rows.push([nom, prenom, street, cp, ville, p.tel || p.fixe, p.mail, asm]);
    }
    return [{name: `${file.name.replace(/\.pdf$/i, '')} — contacts d’urgence (${people.length} proclamateurs)`, rows}];
  }

  async function readTable(file) {
    if (/\.pdf$/i.test(file.name)) return readPdf(file);
    if (/\.csv$/i.test(file.name)) return readCsv(await file.text());
    if (/\.xls[xm]$/i.test(file.name)) return readXlsx(file);
    throw new Error('Format non pris en charge (utilisez .xlsx, .xlsm, .csv ou .pdf).');
  }

  /* ---------- Mise en page d'un document (organigrammes) ----------
     Renvoie des pages de « cellules » positionnées : {x, y, w, h, text}, y croissant vers le bas.
     PDF : morceaux de texte regroupés par ligne ; Excel : une cellule = une case de la grille ;
     Word : paragraphes et cases de tableaux. */
  async function readLayout(file) {
    const name = file.name || '';
    if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
      const base = document.baseURI;
      const pdfjs = await import(new URL('lib/pdfjs/pdf.min.mjs', base).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs/pdf.worker.min.mjs', base).href;
      const doc = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise;
      const pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n), H = page.getViewport({scale: 1}).height;
        const items = (await page.getTextContent()).items.filter(i => i.str && i.str.trim())
          .map(i => ({x: i.transform[4], y: H - i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10, str: i.str}));
        items.sort((a, b) => a.y - b.y || a.x - b.x);
        // texte doublé (faux gras : même texte réécrit décalé d'un point)
        for (let i = items.length - 1; i > 0; i--) if (items.slice(Math.max(0, i - 6), i).some(o => o.str === items[i].str && Math.abs(o.x - items[i].x) < 2.5 && Math.abs(o.y - items[i].y) < 2.5)) items.splice(i, 1);
        const lines = [];
        for (const it of items) { const l = lines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35)); l ? l.items.push(it) : lines.push({y: it.y, items: [it]}); }
        const cells = [];
        for (const l of lines) {
          l.items.sort((a, b) => a.x - b.x); let c = null;
          for (const it of l.items) {
            const gap = c ? it.x - (c.x + c.w) : Infinity;
            if (c && (gap < it.h * 0.5 || (/^[\s:;,.)]+$/.test(it.str) && gap < it.h * 1.5))) { c.text += (gap > it.h * 0.12 && !/\s$/.test(c.text) ? ' ' : '') + it.str; c.w = it.x + it.w - c.x; c.h = Math.max(c.h, it.h); }
            else { c = {x: it.x, y: l.y, w: it.w, h: it.h, text: it.str}; cells.push(c); }
          }
        }
        for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();
        pages.push(cells.filter(c => /[A-Za-zÀ-ÿ]/.test(c.text))); page.cleanup();
      }
      return pages;
    }
    if (/\.xls[xm]$/i.test(name)) {
      return (await readXlsx(file)).map(sh => sh.rows.flatMap((r, ri) => r.map((v, ci) => ({x: ci * 100, y: ri * 20, w: 95, h: 12, text: String(v ?? '').replace(/\s+/g, ' ').trim()})).filter(c => c.text)));
    }
    if (/\.docx$/i.test(name)) {
      const z = await unzip(await file.arrayBuffer()), d = xml(await z.text('word/document.xml'));
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const txt = n => [...n.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('').replace(/\s+/g, ' ').trim();
      const body = d.getElementsByTagNameNS(W, 'body')[0], cells = []; let y = 0;
      for (const node of body ? [...body.children] : []) {
        if (node.localName === 'p') { for (const part of txt(node).split(/\t+/)) if (part) cells.push({x: 0, y, w: 400, h: 12, text: part}); y += 20; }
        else if (node.localName === 'tbl') {
          for (const tr of [...node.children].filter(n => n.localName === 'tr')) {
            const tcs = [...tr.children].filter(n => n.localName === 'tc'); let maxLines = 1;
            tcs.forEach((tc, ci) => { const paras = [...tc.children].filter(n => n.localName === 'p').map(txt).filter(Boolean); maxLines = Math.max(maxLines, paras.length);
              paras.forEach((t, li) => cells.push({x: ci * 150, y: y + li * 20, w: 140, h: 12, text: t})); });
            y += maxLines * 20 + 10;
          }
        }
      }
      return [cells];
    }
    throw new Error('Format non pris en charge pour la lecture (PDF, Excel .xlsx ou Word .docx).');
  }

  /* ---------- Écriture ZIP (sans compression) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(entries) { // entries: [{name, bytes: Uint8Array}]
    const te = new TextEncoder(); const parts = [], central = []; let offset = 0;
    for (const e of entries) {
      const name = te.encode(e.name), crc = crc32(e.bytes), size = e.bytes.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, e.bytes);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + size;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {type: 'application/zip'});
  }

  return {readTable, readXlsx, readCsv, readPdf, readLayout, zip, unzip};
})();
