'use strict';
/* Analyse d'un formulaire S-13 (relevé des attributions de territoire) selon la procédure de Pierre :
   1 territoire = 1 colonne (modèle S-13-Z, plusieurs territoires par page) ou 1 ligne (modèle en tableau) ;
   date la plus récente de tout le territoire (attribué le, entièrement parcouru le, parcouru la dernière fois le…) ;
   6 catégories d'ancienneté par rapport au jour de l'analyse ; sans date → plus de 12 mois. Rien n'est déduit du numéro. */
App.s13 = (() => {
  const CATS = [
    {k: 'm1', l: 'moins de 1 mois', e: '🔵', c: '#2f6fd6'}, {k: 'm3', l: '1 à 3 mois', e: '🟢', c: '#2e9d57'},
    {k: 'm6', l: '3 à 6 mois', e: '🟡', c: '#e0b400'}, {k: 'm9', l: '6 à 9 mois', e: '🟠', c: '#e8781f'},
    {k: 'm12', l: '9 à 12 mois', e: '🔴', c: '#d43131'}, {k: 'p12', l: 'plus de 12 mois', e: '⚫', c: '#333333'}];
  const DATE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;
  function datesIn(text) {
    const out = []; let m; DATE.lastIndex = 0;
    while ((m = DATE.exec(text))) {
      let d, mo, y;
      if (m[4]) { y = +m[4]; mo = +m[5]; d = +m[6]; } else { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) continue;
      out.push(new Date(y, mo - 1, d));
    }
    return out;
  }
  const iso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  const addMonths = (d, n) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
  function categorize(last, today) {
    if (!last) return 'p12';
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (last > addMonths(t, -1)) return 'm1';
    if (last > addMonths(t, -3)) return 'm3';
    if (last > addMonths(t, -6)) return 'm6';
    if (last > addMonths(t, -9)) return 'm9';
    if (last > addMonths(t, -12)) return 'm12';
    return 'p12';
  }
  const sameLine = (a, b) => Math.abs(a.y - b.y) <= Math.max(2.5, Math.min(a.h, b.h) * 0.5);
  const HEADER = /relev[eé] des attributions|registre des attributions|^terr\.?$|^s-13|attribu[ée] [àa]|entièrement parcouru|parcouru la derni|^n[°o]\s*$|^date|^page \d/i;

  // Modèle S-13-Z : en-têtes « N° <territoire> » en colonnes
  function columns(pages) {
    const terr = [];
    pages.forEach((cells, pg) => {
      // modèle S-13-Z : au moins deux en-têtes « N° <territoire> » sur la page (un « N° » seul sous « Terr. » = modèle en tableau)
      if (cells.filter(c => /^N[°o]\s*\S/.test(c.text)).length < 2) return;
      const heads = cells.filter(c => /^N[°o]\s*\S/.test(c.text) || /^N[°o]\s*$/.test(c.text));
      heads.sort((a, b) => a.x - b.x);
      const cols = heads.map((h, i) => ({id: h.text.replace(/^N[°o]\s*/, '').trim(), x0: h.x - 6, x1: i + 1 < heads.length ? heads[i + 1].x - 6 : Infinity, y: h.y, dates: [], page: pg + 1}));
      for (const c of cells) {
        if (heads.includes(c)) continue;
        const ds = datesIn(c.text); if (!ds.length) continue;
        // une case peut contenir deux dates côte à côte : on place chaque date selon sa position
        ds.forEach((d, i) => { const x = c.x + c.w * (i + 0.5) / ds.length; const col = cols.find(k => x >= k.x0 && x < k.x1 && c.y > k.y - 2); if (col) col.dates.push(d); });
      }
      for (const k of cols) if (k.id || k.dates.length) terr.push(k);
    });
    return terr;
  }
  // Modèle en tableau (ex. Territory Helper) : une page par secteur (« Terr. n° : BARBERY »), une ligne par territoire (n° à gauche) ;
  // le nom de l'attributaire est juste au-dessus du n°, les dates « attribué le / entièrement parcouru le » juste en dessous.
  const ID_RE = /^(?:[A-Za-zÀ-ÿ]{1,15}[.\s_-]?)?\d{1,4}[A-Za-z]?(?:[\s-][A-Za-z0-9]{1,3})?$/;   // 12, C-11, 3A, Hubert.01…
  function rows(pages) {
    const terr = [];
    pages.forEach((cells, pg) => {
      const lab = cells.find(c => /terr\.?\s*n[°o]\s*:?$/i.test(c.text) || /^terr\.?\s*n[°o]\s*:/i.test(c.text));
      let title = '';
      if (lab) { const inl = lab.text.replace(/^terr\.?\s*n[°o]\s*:?\s*/i, '').trim(); title = inl || (cells.filter(c => c !== lab && sameLine(c, lab) && c.x > lab.x).sort((a, b) => a.x - b.x)[0]?.text || '').trim(); }
      const headY = Math.max(lab ? lab.y : 0, ...cells.filter(c => /^(le|parcouru|n[°o]|terr\.?|attribu[ée]e?|entièrement|dernière fois le\**|parcouru la)$/i.test(c.text.trim())).map(c => c.y));
      const foot = Math.min(...cells.filter(c => /^\*\*|^s-13\b/i.test(c.text.trim())).map(c => c.y), Infinity);
      const body = cells.filter(c => c.y > headY + 1 && c.y < foot - 1);
      const cand = body.filter(c => ID_RE.test(c.text.trim()) && !datesIn(c.text).length);
      const minX = Math.min(...cand.map(c => c.x)), ids = cand.filter(c => c.x <= minX + 15).sort((a, b) => a.y - b.y);
      const dated = body.filter(c => datesIn(c.text).length);
      if (!ids.length) {   // pas de numéros : une ligne datée = un territoire
        const lines = []; for (const c of dated) { const l = lines.find(l => sameLine(l, c)); l ? l.cells.push(c) : lines.push({y: c.y, h: c.h, cells: [c]}); }
        for (const l of lines) terr.push({id: title, dates: l.cells.flatMap(c => datesIn(c.text)), page: pg + 1});
        return;
      }
      const gap = ids.length > 1 ? (ids.at(-1).y - ids[0].y) / (ids.length - 1) : 30;
      const bands = ids.map((c, k) => ({c, lo: k ? (ids[k - 1].y + c.y) / 2 : c.y - gap / 2, hi: k + 1 < ids.length ? (c.y + ids[k + 1].y) / 2 : c.y + gap / 2, dates: []}));
      for (const c of dated) { const b = bands.find(b => c.y >= b.lo && c.y < b.hi) || (c.y < bands[0].lo ? bands[0] : null); if (b) b.dates.push(...datesIn(c.text)); }
      for (const b of bands) terr.push({id: title ? `${title} ${b.c.text.trim()}` : b.c.text.trim(), dates: b.dates, page: pg + 1});
    });
    return terr;
  }
  function analyse(pages, today = new Date()) {
    let format = 'colonnes', terr = columns(pages);
    if (!terr.length) { format = 'tableau'; terr = rows(pages); }
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()), warn = [];
    const list = terr.map((t, i) => {
      const last = t.dates.length ? new Date(Math.max(...t.dates)) : null;
      if (last && last > t0) warn.push(`${t.id || 'Territoire ' + (i + 1)} : date dans le futur (${last.toLocaleDateString('fr-FR')})`);
      return {id: t.id || `(sans n°, page ${t.page})`, page: t.page, last: iso(last), cat: categorize(last, t0), n: t.dates.length};
    });
    const counts = Object.fromEntries(CATS.map(c => [c.k, list.filter(t => t.cat === c.k).length]));
    const perPage = {}; for (const t of list) perPage[t.page] = (perPage[t.page] || 0) + 1;
    if (format === 'tableau') for (const [p, n] of Object.entries(perPage)) if (n > 20) warn.push(`Page ${p} : ${n} lignes lues (20 au maximum par page) — à vérifier`);
    return {format, pages: pages.length, total: list.length, counts, list, warn, date: iso(t0)};
  }
  const recount = (list, today) => { const t0 = new Date(today); for (const t of list) t.cat = categorize(t.last ? new Date(t.last + 'T00:00') : null, t0); return Object.fromEntries(CATS.map(c => [c.k, list.filter(t => t.cat === c.k).length])); };
  return {analyse, recount, categorize, CATS, datesIn};
})();
