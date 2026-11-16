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

  async function readTable(file) {
    if (/\.pdf$/i.test(file.name)) return readPdf(file);
    if (/\.csv$/i.test(file.name)) return readCsv(await file.text());
    if (/\.xls[xm]$/i.test(file.name)) return readXlsx(file);
    throw new Error('Format non pris en charge (utilisez .xlsx, .xlsm, .csv ou .pdf).');
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

  return {readTable, readXlsx, readCsv, readPdf, zip, unzip};
})();
