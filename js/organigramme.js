'use strict';
/* Lecture d'un organigramme d'assemblée (PDF, Excel ou Word) : repère les responsabilités et les frères en face.
   Entrée : pages de cellules positionnées (App.files.readLayout) + frères de l'assemblée.
   Principe : on ne cherche QUE les noms des frères connus (tolérant : initiales, ordre, accents, petite faute),
   puis on rattache chaque nom à l'intitulé le plus proche : à gauche sur la même ligne (tableaux),
   sinon au-dessus dans la même colonne. « (Adjoint) », une colonne « Adjoints » ou une ligne « Adjoint » marquent les adjoints.
   Les listes d'équipe (4 noms ou plus sans responsable désigné) sont ignorées. */
App.organigramme = (() => {
  const N = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");
  const RULES = [
    [/president/, null], [/equipe/, null], [/tresorier/, null], [/espaces? verts/, null], [/rapports?\b/, null],
    [/qualifie|classe complementaire/, null], [/estrade|perches?\b/, null], [/bibliotheque|cyber|jw ?donate|publisher|\btps\b/, null],
    [/nettoyage/, null], [/supervise/, null], [/specifique/, null], [/association|alctj/, null],
    [/discours/, 'Discours publics'],
    [/audio|video|\bsono/, 'Audio/vidéo'],
    [/comite de gestion|representant au cg|^cg\b/, 'Comité de gestion'],
    [/comptab|\bcomptes?\b/, 'Comptes'],
    [/territoire/, 'Territoires'],
    [/publication/, 'Publications'],
    [/accueil/, 'Accueil'],
    [/maintenance|entretien/, 'Entretien'],
    [/conseiller (adjoint|pour l'enseignement)/, 'Conseiller adj.'],
    [/aumoni/, 'Aumônier'],
    [/\bclh\b|comite de liaison/, 'CLH'],
    [/tour de garde/, 'TG'],
    [/vie (et|chretienne)|ministere/, 'VCM'],
    [/predication/, 'Resp. Prédication'],
    [/secretai?r/, 'Secrétaire'],
    [/coordinat/, 'CCA'],
    [/^groupes?\b/, 'Resp. de groupe']
  ];
  const ROLES = ['CCA', 'Secrétaire', 'Resp. Prédication', 'TG', 'VCM', 'Conseiller adj.', 'Aumônier', 'CLH', 'Comité de gestion',
    'Comptes', 'Territoires', 'Publications', 'Discours publics', 'Accueil', 'Audio/vidéo', 'Entretien', 'Resp. de groupe'];
  const UNIQUE = ['CCA', 'Secrétaire', 'Resp. Prédication', 'TG', 'VCM'];
  // undefined : intitulé inconnu ; null : intitulé à ignorer ; sinon la responsabilité
  function canon(text) { const t = N(text).replace(/[«»"():]/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return undefined; for (const [re, r] of RULES) if (re.test(t)) return r; return undefined; }
  const GENERIC = /^(fonctions?|responsables?|adjoints?|resp\.?|noms?)$/;
  const genericTag = text => { const t = N(text).replace(/[^a-z. ]/g, '').trim(); return GENERIC.test(t) ? (/^adj/.test(t) ? 'adj' : /^resp/.test(t) ? 'resp' : 'none') : null; };
  const TAG_CELL = /^\(\s*(adj|resp)[a-z]*\.?\s*\)$/i;
  const tagOf = s => { const t = N(s).replace(/^[\s;,]+/, ''); return /^\(\s*adj/.test(t) || /^adj(oint)?\b/.test(t) ? 'adj' : /^\(\s*resp/.test(t) ? 'resp' : null; };

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const d = Array.from({length: a.length + 1}, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const close = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1);

  function prepare(members) {
    return members.filter(m => m.nom && m.prenom).map(m => {
      const parts = N(m.prenom).split(/[\s-]+/).filter(Boolean);
      return {id: m.id, nomTok: N(m.nom).split(/\s+/).filter(Boolean), key: parts.join(''), parts, init: parts.map(p => p[0]).join('')};
    });
  }
  function tokenize(text) {
    const out = [], re = /[A-Za-zÀ-ÖØ-öø-ÿ'’][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*/g; let m;
    while ((m = re.exec(text))) { const raw = m[0], n = N(raw).replace(/\.+$/, ''); out.push({raw, n, start: m.index, end: m.index + raw.length, dot: /\.$/.test(raw) || /^[A-Z]{1,2}$/.test(raw)}); }
    return out;
  }
  const nomAt = (tok, i, M) => { // le nom de famille de M commence-t-il au jeton i ?
    const k = M.nomTok.length; if (i + k > tok.length) return false;
    if (k === 1) { const t = tok[i].n, b = M.nomTok[0]; return close(t, b) || (b.includes('-') && t === b.split('-')[0] && t.length >= 4); }
    for (let j = 0; j < k; j++) if (!close(tok[i + j].n, M.nomTok[j])) return false;
    return true;
  };
  // score d'un prénom écrit sur les jetons [a, b)
  function prenomScore(tok, a, b, M, allowInitial) {
    if (a < 0 || b > tok.length || a >= b) return 0;
    const key = tok.slice(a, b).map(t => t.n.replace(/[-.']/g, '')).join('');
    if (key === M.key) return 3;
    if (b - a === 1 && close(key, M.key)) return 2;
    if (allowInitial && b - a === 1 && tok[a].dot && key.length <= 3) {
      const ini = tok[a].n.replace(/[-.]/g, '');
      if (ini === M.init) return 2;
      if (M.parts[0].startsWith(ini)) return ini.length > 1 ? 2 : 1;
    }
    return 0;
  }
  // Tous les frères cités dans un texte : [{id, start, end}]
  function findNames(text, P) {
    const tok = tokenize(text), found = [];
    let i = 0;
    while (i < tok.length) {
      let best = null, tie = false;
      for (const M of P) {
        for (const pl of [1, 2]) {          // Prénom NOM
          if (!nomAt(tok, i + pl, M)) continue;
          const sc = prenomScore(tok, i, i + pl, M, true); if (!sc) continue;
          const end = i + pl + M.nomTok.length;
          if (!best || sc > best.sc) { best = {id: M.id, sc, a: i, b: end}; tie = false; } else if (sc === best.sc && best.id !== M.id) tie = true;
        }
        if (nomAt(tok, i, M)) {             // NOM Prénom
          const k = M.nomTok.length;
          for (const pl of [1, 2]) {
            const sc = prenomScore(tok, i + k, i + k + pl, M, false); if (!sc) continue;
            if (!best || sc > best.sc) { best = {id: M.id, sc, a: i, b: i + k + pl}; tie = false; } else if (sc === best.sc && best.id !== M.id) tie = true;
          }
        }
      }
      if (best && !tie) { found.push({id: best.id, start: tok[best.a].start, end: tok[best.b - 1].end}); i = best.b; } else i++;
    }
    return found;
  }

  function parse(pages, members) {
    const P = prepare(members), raw = [], unknown = new Set();
    pages.forEach((cells, pg) => {
      cells.forEach((c, i) => { c.i = i; c.names = findNames(c.text, P); });
      const sameLine = (a, b) => Math.abs(a.y - b.y) <= Math.max(2, Math.min(a.h, b.h) * 0.45);
      const isTag = c => TAG_CELL.test(c.text.trim());
      const labelish = c => !c.names.length && !isTag(c);
      const overlaps = (c, x0, x1) => c.x - 4 < x1 && c.x + c.w + 4 > x0;
      // intitulé « empilé » sur plusieurs lignes (ex. « Responsable de la » / « prédication »)
      const stacked = L => { let txt = L.text, cur = L;
        for (let k = 0; k < 2; k++) {
          const up = cells.filter(c => c !== cur && labelish(c) && c.y < cur.y && cur.y - c.y < cur.h * 1.9 && overlaps(c, cur.x, cur.x + cur.w) && !/:\s*$/.test(c.text)).sort((a, b) => b.y - a.y)[0];
          if (!up) break; txt = up.text + ' ' + txt; cur = up;
        }
        return txt; };
      const leftOf = (c, x) => cells.filter(o => o !== c && sameLine(o, c) && o.x + o.w <= x + 2).sort((a, b) => b.x - a.x);
      const roleOfLabel = L => { let r = canon(L.text); if (r !== undefined) return r; r = canon(stacked(L)); if (r !== undefined) return r;
        const rowHead = leftOf(L, L.x).find(labelish); return rowHead ? canon(rowHead.text) : undefined; };

      for (const c of cells) for (const nm of c.names) {
        const len = c.text.length || 1, nx = c.x + c.w * nm.start / len, nx1 = c.x + c.w * nm.end / len;
        // étiquette « (Adjoint) » collée au nom
        let tag = tagOf(c.text.slice(nm.end, nm.end + 14));
        if (!tag && c.text.slice(nm.end).trim() === '') { const nxt = cells.filter(o => sameLine(o, c) && o.x >= c.x + c.w - 2 && o.x - (c.x + c.w) < 40).sort((a, b) => a.x - b.x)[0]; if (nxt && isTag(nxt)) tag = tagOf(nxt.text); }
        // intitulé dans la même case : « Secrétaire : Pierre DUPONT »
        const before = c.text.slice(0, nm.start), inl = /([^:;]{3,}):\s*$/.exec(before);
        let role, label = null;
        if (inl && !c.names.some(o => o.end <= nm.start && o.end > inl.index)) {
          role = canon(inl[1]); label = {key: pg + ':' + c.i + ':' + inl[1], y: c.y, x: c.x};
          const above = cells.filter(o => labelish(o) && o.y < c.y && overlaps(o, c.x, c.x + c.w)).sort((a, b) => b.y - a.y)[0];
          if (above && canon(stacked(above)) === null) role = null;     // ex. bureau de l'association locale
        } else {
          // à gauche sur la même ligne (tableaux)
          const L = leftOf(c, nx).find(o => !isTag(o) && !o.names.length);
          let useLeft = false;
          if (L && !/:\s*$/.test(L.text)) {
            const g = genericTag(L.text);
            if (g) { if (!tag && g !== 'none') tag = g; }
            else { const r = roleOfLabel(L); if (r === null) continue; if (r !== undefined) { role = r; label = L; useLeft = true; } }
          }
          // au-dessus dans la même colonne
          const ups = cells.filter(o => labelish(o) && o.y < c.y - 1 && (useLeft ? overlaps(o, c.x, c.x + c.w) : overlaps(o, nx, nx1))).sort((a, b) => b.y - a.y);
          let found = false;
          for (const U of ups) {
            const g = genericTag(U.text);
            if (g) { if (!tag && g !== 'none') tag = g; if (found || useLeft) break; continue; }
            if (!useLeft) { role = roleOfLabel(U); label = U; found = true; break; }            // tableau : on continue vers le haut seulement pour trouver l'en-tête « Responsables / Adjoints »
          }
        }
        if (!role) continue;
        raw.push({pid: nm.id, role, tag, key: label.key || (pg + ':' + label.i), y: c.y, x: nx});
      }
      // noms non reconnus (pour information)
      for (const c of cells) {
        const re = /\b([A-ZÀ-Ý][a-zà-ÿ]+(?:[- ][A-ZÀ-Ý][a-zà-ÿ]+)?|[A-Z]{1,2}\.)\s+([A-ZÀ-Ý][A-ZÀ-Ý'’-]{2,}(?:\s[A-ZÀ-Ý][A-ZÀ-Ý'’-]{2,})?|[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s[A-ZÀ-Ý][a-zà-ÿ]{2,})?)\b/g; let m;
        while ((m = re.exec(c.text))) {
          if (c.names.some(n => m.index < n.end && m.index + m[0].length > n.start)) continue;
          if (canon(m[0]) !== undefined || /^(Le|La|Les|De|Du|Des|Vie|Tour|Groupe)$/.test(m[1])) continue;
          if (/^[A-Z]{1,2}\.$/.test(m[1]) || /^[A-ZÀ-Ý'’ -]+$/.test(m[2])) unknown.add(m[0].replace(/\s+/g, ' '));
        }
      }
    });
    // Par intitulé : équipes et responsables / adjoints
    const groups = {};
    for (const r of raw) (groups[r.key + '|' + r.role] ??= []).push(r);
    const out = [];
    for (const g of Object.values(groups)) {
      g.sort((a, b) => a.y - b.y || a.x - b.x);
      const tagged = g.some(r => r.tag);
      g.forEach((r, i) => {
        if (tagged) { if (r.tag) out.push({...r, adj: r.tag === 'adj'}); else if (i === 0) out.push({...r, adj: false}); }
        else if (g.length <= 3) out.push({...r, adj: false});
      });
    }
    // Par frère
    const byP = {};
    for (const r of out) { const s = byP[r.pid] ??= {}; s[r.role] = s[r.role] === false ? false : r.adj; }
    const result = Object.entries(byP).map(([pid, roles]) => ({pid, roles: Object.entries(roles).map(([role, adj]) => adj ? role + ' adj.' : role)}));
    const warn = [];
    for (const u of UNIQUE) { const who = result.filter(r => r.roles.includes(u)); if (who.length > 1) warn.push(u); }
    return {result, unknown: [...unknown], warn};
  }
  return {parse, ROLES, canon, findNames: (t, m) => findNames(t, prepare(m))};
})();
