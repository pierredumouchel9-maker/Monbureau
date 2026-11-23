'use strict';
/* Réunion annuelle des pionniers (PP et PS) de la circonscription :
   programme (horaires calculés), attribution des participations aux orateurs (interviews, démonstrations, répétitions Zoom),
   lettres aux orateurs (prière, discours, partie d'exposé), lettre d'invitation, liste des pionniers invités.
   Les textes des lettres viennent du classeur et de la lettre Word de l'utilisateur (importés, donc chiffrés) ;
   le code ne contient que des modèles neutres. Les lettres sont produites en PDF. */
App.fields.register('reunionpp', 'Réunion des pionniers', [
  {key: 'rp_theme', label: 'Thème'}, {key: 'rp_date', label: 'Date de la réunion'}, {key: 'rp_lieu', label: 'Lieu'},
  {key: 'rp_adresse', label: 'Adresse'}, {key: 'rp_adresse_1', label: 'Adresse (rue)'}, {key: 'rp_adresse_2', label: 'Adresse (code postal, ville)'},
  {key: 'rp_debut', label: 'Heure de début'}, {key: 'rp_fin', label: 'Heure de fin'}, {key: 'rp_pause', label: 'Durée de la pause'}, {key: 'rp_cantiques', label: 'Cantiques'},
  {key: 'rp_repet_date', label: 'Date des répétitions'}, {key: 'rp_repet_heure', label: 'Heure de répétition (orateur)'}, {key: 'rp_repet_lieu', label: 'Lieu des répétitions'},
  {key: 'rp_zoom', label: 'N° Zoom'}, {key: 'rp_code', label: 'Code secret Zoom'},
  {key: 'rp_discours', label: 'Discours / exposé (orateur)'}, {key: 'rp_partie', label: 'Partie d’exposé (orateur)'}, {key: 'rp_participation', label: 'Participation (interview, démonstration…)'}, {key: 'rp_annee', label: 'Année de service'}
], ({reunion}) => reunion ? App.reunionPP.values(reunion.R, reunion.item) : {});

App.reunionPP = (() => {
  const api = App.api;
  const store = () => api.moduleData('reunionpp', {reunions: []});
  const TYPES = {cantique: 'Cantique', priere: 'Prière', discours: 'Discours', partie: 'Partie d’exposé', pause: 'Pause'};
  const LETTRES = {priere: 'Lettre « Prière »', discours: 'Lettre « Discours »', partie: 'Lettre « Partie d’exposé »', invitation: 'Lettre d’invitation'};
  const N = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»"“”'’.:,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const toMin = hm => { const m = /(\d{1,2})\s*[h:]\s*(\d{0,2})/.exec(String(hm || '')); return m ? +m[1] * 60 + (+m[2] || 0) : null; };
  const fmtH = m => m == null ? '' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  const longDate = iso => { if (!iso) return ''; const t = new Date(iso + 'T00:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}); return t.charAt(0).toUpperCase() + t.slice(1); };
  const isoOf = txt => { const d = App.files.datesIn(String(txt || ''))[0]; if (!d) return ''; const [j, m, y] = d.split('/'); return `${y}-${m}-${j}`; };
  const nomOf = it => [it.prenom, (it.nom || '').toUpperCase()].filter(Boolean).join(' ');
  // Participations d'un sujet (plusieurs possibles : deux interviews, une interview puis une démonstration…)
  const PTYPES = ['Interview', 'Démonstration', 'Expérience', 'Témoignage', 'Sketch', 'Autre'];
  const PLUR = {Interview: 'interviews', 'Démonstration': 'démonstrations', 'Expérience': 'expériences', 'Témoignage': 'témoignages', Sketch: 'sketchs', Autre: 'participations'};
  const NB = ['', '', 'Deux', 'Trois', 'Quatre', 'Cinq'];
  const partsOf = it => { if (!it.parts && it.participation) it.parts = [{type: 'Autre', libre: it.participation}]; return (it.parts ??= []); };
  const partLabel = x => x.libre || `${x.type}${x.duree ? ` (${x.duree} min${x.note ? ', ' + x.note : ''})` : x.note ? ` (${x.note})` : ''}`;
  function partText(parts) {   // « Deux interviews (3 min) + Démonstration (2 min) »
    const out = [];
    for (let i = 0; i < parts.length; i++) { const x = parts[i]; if (x.libre || x.note) { out.push(partLabel(x)); continue; }
      let n = 1; while (parts[i + n] && !parts[i + n].libre && !parts[i + n].note && parts[i + n].type === x.type && parts[i + n].duree === x.duree) n++;
      out.push(n > 1 ? `${NB[n] || n} ${PLUR[x.type] || x.type.toLowerCase()}${x.duree ? ` (${x.duree} min)` : ''}` : partLabel(x)); i += n - 1; }
    return out.join(' + ');
  }

  // Horaires : chaque élément commence à la fin du précédent (prière et éléments sans durée n'avancent pas l'horloge)
  function timed(R) {
    let t = toMin(R.debut) ?? 570; const out = [];
    for (const it of R.items) { out.push({it, h: it.type === 'priere' ? null : t}); t += Number(it.duree) || 0; }
    return {rows: out, fin: t};
  }
  // Exposés en plusieurs parties : parties consécutives de même titre
  function groupsOf(R) { const g = {}; let cur = null, n = 0;
    R.items.forEach((it, i) => { if (it.type === 'partie') { if (!cur || N(cur.titre) !== N(it.expose)) { cur = {titre: it.expose, ids: []}; } cur.ids.push(it.id); g[it.id] = cur; } else cur = null; }); return g; }
  function values(R, it) {
    const [a1, ...a2] = String(R.adresse || '').split(/\s+-\s+|\n/), {fin} = timed(R), pause = R.items.find(x => x.type === 'pause');
    const cant = R.items.filter(x => x.type === 'cantique').map(x => (/(\d+)/.exec(x.titre) || [])[1]).filter(Boolean);
    return {rp_theme: R.theme || '', rp_date: longDate(R.date), rp_lieu: R.lieu || '', rp_adresse: R.adresse || '', rp_adresse_1: a1 || '', rp_adresse_2: a2.join(' - '),
      rp_debut: fmtH(toMin(R.debut)), rp_fin: R.finAnnoncee || fmtH(fin), rp_pause: pause ? `${pause.duree} min` : '', rp_cantiques: cant.join(' et '),
      rp_repet_date: longDate(R.repetDate), rp_repet_lieu: R.repetLieu || '', rp_zoom: R.zoom || '', rp_code: R.code || '', rp_annee: R.annee || '',
      rp_repet_heure: it?.repet || '', rp_discours: it ? (it.type === 'partie' ? it.expose : it.titre) || '' : '', rp_partie: it?.type === 'partie' ? it.titre || '' : '',
      rp_participation: it?.participation || ''};
  }

  /* ---------- Modèles de lettres ---------- */
  const NEUTRE = {
    priere: '<p style="text-align:right">{{exp_entete}}</p><p style="text-align:right">Le {{date_jour}}</p><p>Objet : Réunion des pionniers de la circonscription</p><p>À : F. {{prenom}} {{nom}}</p><p><br></p><p>Cher {{prenom}},</p><p>Tu feras la prière d’introduction de la réunion des pionniers du {{rp_date}} ({{rp_lieu}}), sur le thème {{rp_theme}}.</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p>',
    discours: '<p style="text-align:right">{{exp_entete}}</p><p style="text-align:right">Le {{date_jour}}</p><p>Objet : Réunion des pionniers de la circonscription</p><p>À : F. {{prenom}} {{nom}}</p><p><br></p><p>Cher {{prenom}},</p><p>Réunion des pionniers du {{rp_date}} ({{rp_lieu}}) — thème : {{rp_theme}}.</p><p>Discours : <b>{{rp_discours}}</b> {{rp_participation}}</p><p>Répétition : {{rp_repet_date}} {{rp_repet_heure}} — {{rp_repet_lieu}} · {{rp_zoom}} · {{rp_code}}</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p>',
    partie: '<p style="text-align:right">{{exp_entete}}</p><p style="text-align:right">Le {{date_jour}}</p><p>Objet : Réunion des pionniers de la circonscription</p><p>À : F. {{prenom}} {{nom}}</p><p><br></p><p>Cher {{prenom}},</p><p>Réunion des pionniers du {{rp_date}} ({{rp_lieu}}) — thème : {{rp_theme}}.</p><p>Exposé : <b>{{rp_discours}}</b> — partie : <b>{{rp_partie}}</b> {{rp_participation}}</p><p>Répétition : {{rp_repet_date}} {{rp_repet_heure}} — {{rp_repet_lieu}} · {{rp_zoom}} · {{rp_code}}</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p>',
    invitation: '<p style="text-align:right">{{exp_entete}}</p><p style="text-align:right">Le {{date_jour_complet}}</p><p>Objet : Réunion annuelle avec les pionniers permanents et spéciaux de la circonscription</p><p><br></p><p>Cher(e) pionnier(e),</p><p>Réunion annuelle des pionniers :</p><p style="text-align:center"><b>{{rp_date}}</b></p><p style="text-align:center"><b>{{rp_theme}}</b></p><p>Horaires : de {{rp_debut}} à {{rp_fin}}.</p><p style="text-align:center">{{rp_lieu}}<br>{{rp_adresse_1}}<br>{{rp_adresse_2}}</p><p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p>'
  };
  const modele = (R, k) => (R.lettres || {})[k] || NEUTRE[k];

  // Lignes vides : une seule à la suite, aucune au début ni à la fin (la lettre tient sur une page)
  const tidy = html => html.replace(/(<p[^>]*>\s*<br>\s*<\/p>\s*){2,}/g, '<p><br></p>\n').replace(/^(\s*<p[^>]*>\s*<br>\s*<\/p>)+/, '').replace(/(<p[^>]*>\s*<br>\s*<\/p>\s*)+$/, '').trim();
  // Remplace dans un texte importé les informations de la réunion par les champs correspondants
  function fieldify(html, R) {
    const v = values(R), rep = [];
    const add = (val, f) => { val = String(val || '').trim(); if (val.length >= 3) rep.push([val, `{{${f}}}`]); };
    add(v.rp_theme, 'rp_theme'); add(R.dateTexte || v.rp_date, 'rp_date'); add(v.rp_date, 'rp_date'); add(v.rp_lieu, 'rp_lieu'); add(v.rp_adresse, 'rp_adresse');
    add(v.rp_adresse_1, 'rp_adresse_1'); add(v.rp_adresse_2, 'rp_adresse_2'); add(R.repetTexte || v.rp_repet_date, 'rp_repet_date'); add(v.rp_repet_date, 'rp_repet_date');
    add(v.rp_zoom, 'rp_zoom'); add(v.rp_code, 'rp_code');
    rep.sort((a, b) => b[0].length - a[0].length);
    const re = s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
    for (const [a, b] of rep) html = html.replace(re(a), b);
    return html
      .replace(/\bLe\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}(er)?\s+[a-zéû]+\s+\d{4}/i, 'Le {{date_jour_complet}}')
      .replace(/(Cantiques?\s+)\d+(\s*(et|,)\s*\d+)*/i, '$1{{rp_cantiques}}')
      .replace(/(commencera à\s*(?:<[^>]+>)*)\d{1,2}\s*h\s*\d{2}/i, '$1{{rp_debut}}').replace(/(terminera à\s*(?:<[^>]+>)*)\d{1,2}\s*h\s*\d{2}/i, '$1{{rp_fin}}').replace(/(pause de\s*(?:<[^>]+>)*)\d+\s*min\.?/i, '$1{{rp_pause}}')
      .replace(/(répétition est prévue[^<]*?\{\{rp_repet_date\}\})/i, '$1 {{rp_repet_heure}}');
  }
  /* Présentation des lettres aux orateurs (modèle de l'utilisateur) : en-tête souligné d'un filet, objet en rouge,
     destinataire et date en gras, thème centré, partie en rouge, « Préparation personnelle » et « Une répétition » en gras,
     puces décalées, phrase de confirmation encadrée sur fond bleu, signature après « Ton frère dans la foi ». */
  function signature() {
    const p = api.data.settings.profil || {}; if (p.signature) return p.signature;
    const all = [...api.data.templates.map(t => t.body || ''), ...(api.data.modules.itineraire?.annees || []).flatMap(A => Object.values(A.lettres || {}).flatMap(L => [L?.avec || '', L?.sans || '']))].join(' ');
    const imgs = [...all.matchAll(/src="(data:image\/(?:png|jpe?g);base64,[^"]+)"/g)].map(m => m[1]);
    return imgs.sort((a, b) => b.length - a.length)[0] || '';   // la plus grande image : la signature
  }
  function styleLetter(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'), out = [];
    const paras = [];
    for (const el of doc.body.firstChild.children) {
      if (el.tagName === 'UL') { for (const li of el.children) paras.push('• ' + li.innerHTML.trim()); continue; }
      for (const part of el.innerHTML.replace(/\n{2,}/g, '\n\n').split('\n')) paras.push(part.trim() === '<br>' ? '' : part.trim());   // ligne vide gardée entre deux paragraphes
    }
    const txt = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(), sig = signature();
    let bullets = [], skipName = false;
    const flush = () => { if (bullets.length) { out.push(`<ul style="margin-left:60pt">${bullets.map(b => `<li>${b}</li>`).join('')}</ul>`); bullets = []; } };
    paras.forEach((h, i) => {
      const t = txt(h);
      if (/^•/.test(t)) { bullets.push(h.replace(/^•\s*/, '')); return; }
      flush();
      if (!t) { out.push('<p><br></p>'); return; }
      if (skipName && /\{\{exp_prenom\}\}/.test(t)) return;
      if (i === 0) return out.push(`<p style="text-align:right;font-weight:bold;font-size:10pt;border-bottom:1px solid #000">${t}</p>`);
      if (i < 3 && /@/.test(t)) return out.push(`<p style="font-size:7pt">${t}</p>`);
      if (/^Le\s+\{\{date_jour/.test(t)) return out.push('<p style="text-align:right;margin-right:40pt">Le {{date_jour_complet}}</p>');
      if (/^Objet\s*:/i.test(t)) return out.push(`<p style="color:#c00000;font-weight:bold;font-size:13pt">${t}</p>`);
      if (/^(À\s*:\s*)?(F\.|Frère)\s*\{\{prenom\}\}/.test(t)) return out.push('<p><b>Frère {{prenom}} {{nom}}</b></p>');
      if (t === '{{rp_date}}') return out.push('<p><b>{{rp_date}}</b></p>');
      if (t === '{{rp_theme}}') return out.push('<p style="text-align:center"><b>{{rp_theme}}</b></p>');
      if (t === '{{rp_discours}}') return out.push('<p><b>{{rp_discours}}</b></p>');
      if (t === '{{rp_partie}}') return out.push('<p style="color:#c00000"><b>{{rp_partie}}</b></p>');
      if (/^Préparation personnelle\s*:/i.test(t)) return out.push(`<p><b>Préparation personnelle :</b>${h.replace(/^(<[^>]+>)*Préparation personnelle\s*:(<\/[^>]+>)*/i, '')}</p>`);
      if (/^Une répétition est prévue/i.test(t)) return out.push(`<p><b>Une répétition</b> est prévue : <b>${t.replace(/^Une répétition est prévue\s*:?\s*/i, '')}</b></p>`);
      if (/^Je te remercie de me confirmer/i.test(t)) return out.push(`<p style="text-align:center;font-weight:bold;background-color:#dbe5f1;border:1px solid #000">${t}</p>`);
      if (/^(Ton frère|Ta sœur) dans la foi/i.test(t)) { skipName = !!sig; return out.push(`<p style="margin-left:110pt">${t}${sig ? ` <img src="${sig}" style="width:170pt">` : ''}</p>`); }
      out.push(`<p${/text-align:center/.test(paras[i] || '') ? ' style="text-align:center"' : ''}>${h}</p>`);
    });
    flush();
    return tidy(out.join('\n')) + '<!--mf1-->';
  }
  // Onglet de lettre du classeur (Prière, Discours, Discours en plusieurs parties) → HTML avec champs
  function sheetToHtml(rows, R) {
    const out = [];
    rows.forEach((r, i) => {
      let cells = r.map(c => String(c ?? '').trim()).filter(Boolean);
      if (!cells.length) { out.push('<p><br></p>'); return; }
      let t = cells.join(' ');
      if (/^Le$/i.test(cells[0])) return out.push('<p style="text-align:right">Le {{date_jour}}</p>');
      t = t.replace(/«\s*F\s*»\s*«\s*Prénom\s*»\s*«\s*Nom\s*»/i, 'F. {{prenom}} {{nom}}').replace(/«\s*Prénom\s*»/gi, '{{prenom}}').replace(/«\s*Nom\s*»/gi, '{{nom}}')
        .replace(/^"Discours en plusieurs parties"$/i, '<b>{{rp_discours}}</b>').replace(/^"Discours"$/i, '<b>{{rp_discours}}</b>').replace(/^"Partie de discours"$/i, '<b>{{rp_partie}}</b>')
        .replace(/^[⚫●•]️?\s*/, '• ');
      const esc = t.replace(/&(?!amp;)/g, '&amp;').replace(/<(?!\/?b>)/g, '&lt;');
      const right = i < 1 || /^Ton frère|^Ta sœur|fraternellement,?$/i.test(t);
      const center = /^\{\{rp_theme\}\}$|^<b>\{\{rp_(discours|partie)\}\}<\/b>$/.test(fieldify(esc, R));
      out.push(`<p${right ? ' style="text-align:right"' : center ? ' style="text-align:center"' : ''}>${esc}</p>`);
      if (/^Ton frère|^Ta sœur/i.test(t)) out.push('<p style="text-align:right">{{exp_prenom}} {{exp_nom}}</p>');
    });
    return styleLetter(tidy(fieldify(out.join('\n'), R)));
  }

  /* ---------- Import du classeur « Publipostage Réunion PP » ---------- */
  async function importClasseur(R) {
    const file = await api.pickFile('.xlsm,.xlsx'); if (!file) return false;
    let sheets; try { sheets = await App.files.readXlsx(file); } catch (e) { api.toast('Lecture impossible : ' + e.message, 'error'); return false; }
    const sh = n => sheets.find(s => N(s.name) === N(n));
    const base = sh('Base de données'); if (!base) { api.toast('Onglet « Base de données » introuvable dans ce classeur.', 'error'); return false; }
    const val = lab => { const r = base.rows.find(r => N(r[0]).startsWith(N(lab))); return r ? String(r.slice(1).find(c => String(c ?? '').trim()) ?? '').trim() : ''; };
    R.theme = val('THÈME') || R.theme; R.dateTexte = val('DATE'); R.date = isoOf(R.dateTexte) || R.date;
    R.lieu = val('LIEU') || R.lieu; R.adresse = val('Adresse') || R.adresse;
    R.repetTexte = val('RÉPÉTITIONS'); R.repetDate = isoOf(R.repetTexte) || R.repetDate; R.repetLieu = val('ADRESSE RÉPÉTITIONS') || R.repetLieu;
    R.zoom = val('CODE ZOOM') || R.zoom; R.code = val('CODE SECRET') || R.code;
    const presR = base.rows.find(r => N(r[0]).startsWith('president')); R.president = presR ? presR.slice(1).map(c => String(c ?? '').trim()).filter(Boolean).join(' · ') : R.president;
    if (R.date) R.annee = String(new Date(R.date).getMonth() >= 8 ? new Date(R.date).getFullYear() + 1 : new Date(R.date).getFullYear());
    // Lignes d'orateurs
    const hi = base.rows.findIndex(r => N(r[0]) === 'n plan' || r.some(c => N(c) === 'discours en plusieurs parties'));
    const H = base.rows[hi] || [], col = k => H.findIndex(c => N(c).startsWith(N(k)));
    const C = {plan: 0, nom: col('Nom'), prenom: col('Prénom'), asm: col('Assemblée'), disc: col('Discours'), exp: col('Discours en plusieurs'), part: col('Parties'), pri: col('Pières') >= 0 ? col('Pières') : col('Prières'), partic: col('Partic'), repet: col('Répétitions'), rem: col('Remarque'), ret: col('Retours')};
    const people = base.rows.slice(hi + 1).filter(r => String(r[C.nom] ?? '').trim()).map(r => ({
      plan: String(r[C.plan] ?? '').replace(/\s*-\s*$/, '').trim(), nom: String(r[C.nom]).trim().toUpperCase(), prenom: String(r[C.prenom] ?? '').trim(), asm: String(r[C.asm] ?? '').trim(),
      disc: String(r[C.disc] ?? '').trim(), exp: String(r[C.exp] ?? '').trim(), part: String(r[C.part] ?? '').trim(), pri: String(r[C.pri] ?? '').trim(),
      participation: String(r[C.partic] ?? '').trim(), repet: String(r[C.repet] ?? '').trim(), auditoire: /auditoire/i.test(String(r[C.rem] ?? '')), remarque: /auditoire/i.test(String(r[C.rem] ?? '')) ? '' : String(r[C.rem] ?? '').trim(),
      retour: r[C.ret] === true || /^(true|vrai|oui|x|1)$/i.test(String(r[C.ret] ?? ''))}));
    const take = (p, extra) => ({id: api.uid(), plan: p?.plan || '', nom: p?.nom || '', prenom: p?.prenom || '', asm: p?.asm || '', participation: p?.participation || '', repet: p?.repet || '', auditoire: !!p?.auditoire, remarque: p?.remarque || '', retour: !!p?.retour, ...extra});
    const byTitle = (k, t) => people.find(p => p[k] && N(p[k]) === N(t)) || people.find(p => p[k] && (N(p[k]).startsWith(N(t)) || N(t).startsWith(N(p[k]))));
    // Programme : ordre, durées, pause, cantiques
    const prog = sh('Programme'), items = [];
    if (prog) {
      let expose = '', start = null;
      for (const r of prog.rows) {
        const c = r.map(x => String(x ?? '').trim()).filter(Boolean); if (!c.length) continue;
        const time = /^\d{1,2}h\d{2}$/.test(c[0]) ? c[0] : null, dur = (c.find(x => /^\d+\s*min\.?$/i.test(x)) || '').replace(/\D/g, '');
        if (time && start === null) start = time;
        const mExp = /^Exposé en .*parties?\s*:?$/i.exec(c[0]); if (mExp) { expose = c[1] || ''; continue; }
        if (/^PAUSE/i.test(c[0])) { items.push(take(null, {type: 'pause', titre: 'Pause', duree: +(/(\d+)/.exec(c[0]) || [, 20])[1]})); expose = ''; continue; }
        if (/^Prière$/i.test(c[0])) { const p = people.find(x => /intro/i.test(x.pri)); items.push(take(p, {type: 'priere', titre: 'Prière', duree: 0})); continue; }
        if (!time) continue;
        const rest = c.slice(1), title = rest[0] || '';
        if (/^Cantique/i.test(title)) { const fin = /prière/i.test(title), p = fin ? people.find(x => /final/i.test(x.pri)) : null;
          const [pre, ...pn] = (R.president || '').split(' · ')[0].split(' ');
          items.push(take(p || {prenom: pre, nom: pn.join(' ').toUpperCase(), asm: (R.president || '').split(' · ')[1] || ''}, {type: 'cantique', titre: title.replace(/\s+/g, ' '), duree: +dur || 5})); expose = /prière/i.test(title) ? '' : expose; continue; }
        if (/^\d+\.$/.test(rest[0] || '')) { const t2 = rest[1] || '', p = byTitle('part', t2); items.push(take(p, {type: 'partie', expose: expose || p?.exp || '', titre: t2, duree: +dur || 15})); continue; }
        const p = byTitle('disc', title); items.push(take(p, {type: 'discours', titre: title, duree: +dur || 15})); expose = '';
      }
      if (start) R.debut = start.replace('h', ':').padStart(5, '0');
    }
    if (!items.length) for (const p of people) { if (p.disc) items.push(take(p, {type: 'discours', titre: p.disc, duree: 15})); else if (p.part) items.push(take(p, {type: 'partie', expose: p.exp, titre: p.part, duree: 15})); else if (/intro/i.test(p.pri)) items.unshift(take(p, {type: 'priere', titre: 'Prière', duree: 0})); }
    if (items.length) R.items = items;
    { const first = items.map(it => toMin(it.repet)).filter(t => t !== null).sort((a, b) => a - b)[0]; if (first != null) R.repetDebut = `${String(Math.floor(first / 60)).padStart(2, '0')}:${String(first % 60).padStart(2, '0')}`; }
    // Lettres aux orateurs (onglets du classeur), avec les informations remplacées par des champs
    R.lettres ??= {};
    for (const [k, n] of [['priere', 'Prière'], ['discours', 'Discours'], ['partie', 'Discours en plusieurs parties']]) { const s2 = sh(n); if (s2) R.lettres[k] = sheetToHtml(s2.rows, R); }
    api.save();
    api.toast(`Classeur importé : ${R.items.length} élément(s) de programme, ${Object.keys(R.lettres).length} modèle(s) de lettre`);
    return true;
  }
  /* ---------- Courrier officiel : page « Programme pour l'année de service … » (thème, éléments, durées) ---------- */
  function parseProgramme(lines) {
    const i0 = lines.findIndex(l => /Programme pour l.ann[ée]e de service/i.test(l)); if (i0 < 0) return null;
    const annee = (/(\d{4})/.exec(lines[i0]) || [])[1] || '';
    let k = i0 + 1, theme = '';
    if (/^Th[èe]me\s*:/i.test(lines[k] || '')) { theme = lines[k].replace(/^Th[èe]me\s*:\s*/i, ''); k++;
      while (k < lines.length && !/\(\s*\d+\s*min/i.test(lines[k]) && !/^Cantique/i.test(lines[k])) theme += ' ' + lines[k++]; }
    // éléments : une ligne se termine par « (N min) » (sinon elle continue sur la suivante)
    const els = []; let cur = '';
    for (; k < lines.length; k++) { const l = lines[k].trim(); if (!l) continue; if (/^\d+\/\d+\/\d+-[A-Z]+$/.test(l)) break;
      cur = cur ? cur + ' ' + l : l; if (/\(\s*\d+\s*min\.?\s*\)\s*$/i.test(cur)) { els.push(cur); cur = ''; } }
    const items = []; let expose = '';
    els.forEach((e, n) => {
      const bullet = /^[•·\-–]\s*/.test(e), t = e.replace(/^[•·\-–]\s*/, ''), m = /^(.*?)\s*\(\s*(\d+)\s*min\.?\s*\)\s*$/i.exec(t); if (!m) return;
      const titre = m[1].trim(), duree = +m[2];
      const ex = /^Exposé en .*?parties?\s*:\s*(.+)$/i.exec(titre); if (ex) { expose = ex[1].trim(); return; }
      if (bullet && expose) { items.push({type: 'partie', expose, titre, duree}); return; }
      expose = '';
      const c = /^Cantique\s+(?:n[o°º]\s*)?(\d+)\s*(et\s+prière)?/i.exec(titre);
      if (c) { const first = !items.length; items.push({type: 'cantique', titre: first ? `Cantique ${c[1]}` : `Cantique ${c[1]}${c[2] ? ' et prière' : ''}`, duree});
        if (first && c[2]) items.push({type: 'priere', titre: 'Prière', duree: 0}); return; }
      if (/^Pause$/i.test(titre)) { items.push({type: 'pause', titre: 'Pause', duree}); return; }
      items.push({type: 'discours', titre, duree});
    });
    return items.length ? {annee, theme: theme.replace(/\s+/g, ' ').trim(), items} : null;
  }
  async function importCourrier(R) {
    const file = await api.pickFile('.pdf'); if (!file) return false;
    let pages; try { pages = await App.files.readLayout(file); } catch (e) { api.toast('Lecture impossible : ' + e.message, 'error'); return false; }
    let prog = null;
    for (const cells of pages) {
      const rows = [];
      for (const c of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) { const r = rows.find(r => Math.abs(r.y - c.y) < Math.max(3, c.h * .5)); r ? r.cells.push(c) : rows.push({y: c.y, cells: [c]}); }
      prog = parseProgramme(rows.map(r => r.cells.sort((a, b) => a.x - b.x).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim()));
      if (prog) break;
    }
    if (!prog) { api.toast('Page « Programme pour l’année de service » introuvable dans ce PDF.', 'error'); return false; }
    if (R.items.some(x => x.nom) && !await api.confirm('Remplir le programme', `Le programme actuel (avec ses orateurs) sera remplacé par celui du courrier : ${prog.items.length} élément(s). Les orateurs déjà attribués sont gardés quand le titre est le même. Continuer ?`, 'Remplacer')) return false;
    // orateurs déjà attribués : repris si le même titre revient
    const keep = new Map(R.items.filter(x => x.nom).map(x => [N(x.titre), x]));
    R.items = prog.items.map(it => { const o = keep.get(N(it.titre)); return {id: api.uid(), expose: '', nom: '', prenom: '', asm: '', participation: '', repet: '', auditoire: false, retour: false, plan: '',
      ...(o && it.type !== 'cantique' && it.type !== 'pause' ? {nom: o.nom, prenom: o.prenom, asm: o.asm, participation: o.participation, parts: o.parts, repet: o.repet, auditoire: o.auditoire, retour: o.retour, plan: o.plan} : {}), ...it}; });
    // numéros de plan, dans l'ordre (comme le classeur : Plan 1, Plan 2…)
    let n = 0; for (const it of R.items) if (['discours', 'partie'].includes(it.type)) it.plan = `Plan ${++n}`;
    if (prog.theme) R.theme = prog.theme; if (prog.annee) R.annee = prog.annee;
    api.save(); api.toast(`Programme ${prog.annee} rempli : ${R.items.length} élément(s)`); return true;
  }
  async function importInvitation(R) {
    const file = await api.pickFile('.docx,.html,.htm'); if (!file) return false;
    try {
      const html = /\.docx$/i.test(file.name) ? await App.files.docxToHtml(file) : (await file.text()).replace(/<!--[\s\S]*?-->/g, '');
      // heure de fin écrite dans la lettre : gardée comme « fin annoncée » (sinon la fin calculée du programme)
      const fin = /terminera à\s*(?:<[^>]+>)*\s*(\d{1,2})\s*h\s*(\d{2})/i.exec(html.replace(/<\/?[biu]>/g, ''));
      if (fin && !R.finAnnoncee) R.finAnnoncee = `${+fin[1]}h${fin[2]}`;
      (R.lettres ??= {}).invitation = tidy(fieldify(html, R)); api.save(); api.toast('Lettre d’invitation importée'); return true;
    } catch (e) { api.toast('Lecture impossible : ' + e.message, 'error'); return false; }
  }

  /* ---------- Pionniers invités : PP et PS de toutes les assemblées, d'après le dernier cycle (ou la fiche S-21) ---------- */
  // Statut d'une personne : celui du dernier cycle où elle figure (Circonscription), sinon celui de sa fiche (S-21)
  function statutOf(p) {
    const S = api.data.modules.circonscription || {}, cycles = (S.cycles || []).slice().sort((a, b) => String(b.code).localeCompare(String(a.code)));
    for (const c of cycles) { const e = S.suivi?.[c.id]?.[p.id]; if (e && (e.statut !== undefined || e.evt)) return {st: e.statut || '', gone: ['Déménagement', 'Décédé(e)'].includes(e.evt)}; }
    return {st: ['PNB', 'PP', 'PS'].includes(p.statut) ? p.statut : '', gone: false};
  }
  function pionniers(R) {
    const out = [];
    for (const p of api.data.persons) {
      const {st, gone} = statutOf(p);
      if (gone || !['PP', 'PS'].includes(st) || (R.exclus || []).includes(p.id)) continue;
      out.push({id: p.id, nom: (p.nom || '').toUpperCase(), prenom: p.prenom || '', asm: p.assemblee || '', statut: st});
    }
    for (const a of R.ajouts || []) out.push({...a, ajout: true});
    return out.sort((a, b) => a.asm.localeCompare(b.asm, 'fr') || a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
  }

  /* ---------- PDF ---------- */
  const isMe = it => { const p = api.data.settings.profil || {}; return p.nom && N(it.nom) === N(p.nom) && (!p.prenom || N(it.prenom) === N(p.prenom)); };
  // Une lettre doit tenir sur une page : sinon marges et taille du texte sont réduites un peu, par paliers
  async function onePage(html, title) {
    let bytes = await App.pdf.render(html, {title});
    for (const [m, fs] of [[44, 10.5], [38, 10], [32, 9.5]]) {
      if ((await window.PDFLib.PDFDocument.load(bytes)).getPageCount() <= 1) break;
      bytes = await App.pdf.render(`<div data-marge="${m}" style="font-size:${fs}pt">${html.replace(/data-marge="[\d.]+"/g, '')}</div>`, {title});
    }
    return bytes;
  }
  async function lettreBytes(R, it) {
    const k = it.type === 'partie' ? 'partie' : it.type === 'discours' ? 'discours' : 'priere';
    const html = App.pdf.merge(modele(R, k), App.fields.values({person: {prenom: it.prenom, nom: it.nom, assemblee: it.asm, civilite: 'Frère'}, reunion: {R, item: it}}));
    return onePage(html, `Réunion des pionniers — ${nomOf(it)}`);
  }
  const lettreNom = (R, it) => App.pdf.fileName(`Réunion PP ${R.annee || ''} - ${it.plan ? it.plan + ' - ' : ''}${it.nom} ${it.prenom}`) + '.pdf';
  const avecLettre = R => R.items.filter(it => ['priere', 'discours', 'partie'].includes(it.type) && it.nom && !isMe(it));

  async function programmePdf(R) {
    const {PDFDocument, StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
    const doc = await PDFDocument.create(); doc.setTitle(`Programme réunion des pionniers ${R.annee || ''}`); doc.setCreator('Mon Bureau');
    const Rf = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold), I = await doc.embedFont(StandardFonts.HelveticaOblique);
    const W = 595.28, H = 841.89, M = 42, ink = rgb(.1, .12, .15), mute = rgb(.42, .45, .5), blue = rgb(.12, .25, .4), band = rgb(.93, .95, .98);
    let page = doc.addPage([W, H]), y = H - M;
    const wrap = (t, f, s, w) => { const out = []; let cur = ''; for (const wd of T(t).split(' ')) { const nx = cur ? cur + ' ' + wd : wd; if (f.widthOfTextAtSize(nx, s) > w && cur) { out.push(cur); cur = wd; } else cur = nx; } if (cur) out.push(cur); return out; };
    const center = (t, f, s, c = ink) => { for (const l of wrap(t, f, s, W - 2 * M)) { page.drawText(l, {x: (W - f.widthOfTextAtSize(l, s)) / 2, y: y - s, size: s, font: f, color: c}); y -= s * 1.35; } };
    if (App.circoNom()) center(App.circoNom(), B, 10, mute);
    center(`Programme pour l’année de service ${R.annee || ''}`, Rf, 10, mute);
    center('RÉUNION DU RESPONSABLE DE CIRCONSCRIPTION AVEC LES PIONNIERS', B, 12.5, blue); y -= 16;   // espace pour détacher le thème
    // Thème : une ligne, sinon deux lignes coupées à un endroit naturel (avant la référence biblique, après la citation), jamais au milieu d'une référence
    { const th = T(R.theme || '').replace(/\s+/g, ' ').trim(), maxW = W - 2 * M;
      if (th) {
        let size = 15, lines = [th];
        const cuts = []; const ref = th.lastIndexOf(' (');
        if (ref > 0) cuts.push(ref);                                    // « … » | (Prov. 4:25)
        const q = th.indexOf('» '); if (q > 0) cuts.push(q + 1);           // « citation » | suite
        th.replace(/ /g, (m, i) => { const before = th.slice(0, i), open = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length; if (!open && !/[«(]$/.test(before)) cuts.push(i); return m; });
        const fit = (l, sz) => B.widthOfTextAtSize(l, sz) <= maxW;
        while (size >= 10) {
          if (fit(th, size)) { lines = [th]; break; }
          // meilleure coupure : coupures « naturelles » d'abord, puis la plus équilibrée
          const ok = [...new Set(cuts)].map(i => [th.slice(0, i).trim(), th.slice(i).trim()]).filter(([a, b]) => fit(a, size) && fit(b, size));
          if (ok.length) { const nat = ok.filter(([a]) => cuts.slice(0, 2).includes(th.indexOf(a) + a.length) || (ref > 0 && a.length === th.slice(0, ref).trim().length) || (q > 0 && a.length === th.slice(0, q + 1).trim().length));
            const pick = (nat.length ? nat : ok).sort((x, y) => Math.abs(B.widthOfTextAtSize(x[0], size) - B.widthOfTextAtSize(x[1], size)) - Math.abs(B.widthOfTextAtSize(y[0], size) - B.widthOfTextAtSize(y[1], size)))[0];
            lines = pick; break; }
          size -= .5;
        }
        for (const l of lines) { page.drawText(l, {x: (W - B.widthOfTextAtSize(l, size)) / 2, y: y - size, size, font: B, color: ink}); y -= size * 1.35; }
        y -= 12;   // espace avant la date
      } }
    center(longDate(R.date), Rf, 11); center([R.lieu, R.adresse].filter(Boolean).join(' — '), Rf, 10, mute); y -= 10;
    page.drawLine({start: {x: M, y}, end: {x: W - M, y}, thickness: .8, color: blue}); y -= 6;
    const {rows} = timed(R), groups = groupsOf(R), cT = M, cX = M + 46, cD = W - M - 165, cS = W - M - 120, wX = cD - cX - 10;
    const need = h => { if (y - h < M + 20) { page = doc.addPage([W, H]); y = H - M; } };
    let lastGroup = null;
    for (const {it, h} of rows) {
      const g = groups[it.id];
      if (g && g !== lastGroup) { const n = g.ids.length, mots = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six'][n] || n;
        need(30); y -= 6; const l = wrap(`Exposé en ${mots} parties : ${g.titre || ''}`, B, 10.5, W - 2 * M - 46); l.forEach(x => { page.drawText(x, {x: cX, y: y - 10.5, size: 10.5, font: B, color: blue}); y -= 14; }); }
      lastGroup = g || null;
      if (it.type === 'pause') { need(24); y -= 4; page.drawRectangle({x: M, y: y - 18, width: W - 2 * M, height: 18, color: band}); const t = `PAUSE (${it.duree} min.)`; page.drawText(t, {x: (W - B.widthOfTextAtSize(t, 10)) / 2, y: y - 13, size: 10, font: B, color: mute}); y -= 24; continue; }
      const num = g ? `${g.ids.indexOf(it.id) + 1}. ` : '', ind = g ? 18 : 0;   // parties d'un exposé : décalées sous leur titre
      const title = it.type === 'priere' ? 'Prière' : num + (it.titre || '');
      const tl = wrap(title, it.type === 'priere' ? I : B, 10.5, wX - ind), sub = [it.plan, it.participation, it.auditoire ? 'Participation auditoire' : ''].filter(Boolean).join(' · ');
      const sl = sub ? wrap(sub, Rf, 8.5, wX - ind) : [], hh = Math.max(tl.length * 13.5 + sl.length * 11, 26) + 6;
      need(hh);
      if (h !== null) page.drawText(fmtH(h), {x: cT, y: y - 11, size: 10.5, font: B, color: ink});
      tl.forEach((l, k) => page.drawText(l, {x: cX + ind, y: y - 11 - k * 13.5, size: 10.5, font: it.type === 'priere' ? I : B, color: ink}));
      sl.forEach((l, k) => page.drawText(l, {x: cX + ind, y: y - 11 - tl.length * 13.5 - k * 11, size: 8.5, font: Rf, color: mute}));
      if (Number(it.duree)) page.drawText(`${it.duree} min.`, {x: cD, y: y - 11, size: 9.5, font: Rf, color: mute});
      if (it.nom) { page.drawText(T(nomOf(it)), {x: cS, y: y - 11, size: 10, font: B, color: ink}); if (it.asm) page.drawText(T(it.asm), {x: cS, y: y - 23, size: 8.5, font: Rf, color: mute}); }
      y -= hh; page.drawLine({start: {x: M, y: y + 2}, end: {x: W - M, y: y + 2}, thickness: .4, color: rgb(.85, .87, .9)});
    }
    for (const pg of doc.getPages()) pg.drawText(T(`Mon Bureau${App.circoPied()} · mis à jour le ${api.dateLongue()}`), {x: M, y: 18, size: 7, font: Rf, color: mute});
    return doc.save();
  }
  async function pionniersPdf(R) {
    const {PDFDocument, StandardFonts, rgb} = window.PDFLib, T = t => App.pdf.clean(String(t ?? ''));
    const L = pionniers(R), doc = await PDFDocument.create(), Rf = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 42; let page = doc.addPage([W, H]), y = H - M, col = 0;
    page.drawText(T(`Réunion des pionniers ${longDate(R.date)} — pionniers invités (${L.length})`), {x: M, y: y - 14, size: 13, font: B}); y -= 30;
    if (App.circoNom()) { page.drawText(T(App.circoNom()), {x: M, y: y + 2, size: 9, font: Rf, color: rgb(.42, .45, .5)}); y -= 12; }
    page.drawText(T(`Mon Bureau${App.circoPied()} · imprimé le ${api.dateLongue()}`), {x: M, y: 18, size: 7, font: Rf, color: rgb(.42, .45, .5)});
    const asms = [...new Set(L.map(p => p.asm))];
    for (const a of asms) {
      const l = L.filter(p => p.asm === a); if (y - 16 - l.length * 12 < M) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(T(`${a || 'Sans assemblée'} (${l.length})`), {x: M, y: y - 11, size: 10.5, font: B, color: rgb(.12, .25, .4)}); y -= 16;
      for (const p of l) { page.drawText(T(`${p.nom} ${p.prenom}`), {x: M + 12, y: y - 9, size: 9.5, font: Rf}); page.drawText(T(p.statut || ''), {x: M + 260, y: y - 9, size: 9, font: Rf, color: rgb(.42, .45, .5)}); y -= 12; }
      y -= 6;
    }
    return doc.save();
  }

  /* ---------- Éditeur de lettre ---------- */
  async function editLettre(R, k, redraw) {
    const chips = h => h.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, f) => `<span data-champ="${f}" contenteditable="false" style="background:#e7f0fd;color:#1d4f91;border-radius:4px;padding:0 4px">${api.esc(App.fields.label(f))}</span>`);
    const unchips = el => { const c = el.cloneNode(true); for (const x of c.querySelectorAll('[data-champ]')) x.replaceWith(`{{${x.dataset.champ}}}`); return c.innerHTML; };
    const flds = ['reunionpp', 'personne', 'expediteur', 'dates'].flatMap(g => (App.fields.groups.find(x => x.id === g)?.fields || []).filter(f => g !== 'personne' || ['prenom', 'nom', 'assemblee'].includes(f.key)));
    const r = await api.modal({title: LETTRES[k], wide: true, body: `<div class="stack">
      <div class="row small"><button class="btn" data-cmd="bold"><b>G</b></button><button class="btn" data-cmd="italic"><i>I</i></button><button class="btn" data-cmd="underline"><u>S</u></button>
        <button class="btn" data-cmd="justifyLeft">⟸</button><button class="btn" data-cmd="justifyCenter">≡</button><button class="btn" data-cmd="justifyRight">⟹</button>
        <select id="lF" style="width:auto"><option value="">+ Insérer un champ…</option>${flds.map(f => `<option value="${f.key}">${api.esc(f.label)}</option>`).join('')}</select></div>
      <div id="lEd" contenteditable="true" style="border:1px solid var(--line);border-radius:8px;padding:18px 22px;min-height:380px;max-height:60vh;overflow:auto;background:#fff;color:#111;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45">${chips(modele(R, k))}</div>
      <p class="small muted" style="margin:0">Les étiquettes bleues sont remplacées automatiquement (date, thème, orateur, répétition…). ${R.lettres?.[k] ? '' : 'Modèle neutre : importez votre classeur ou votre lettre Word pour retrouver votre texte.'}</p></div>`,
      actions: [{label: 'Annuler', value: null}, ...(R.lettres?.[k] ? [{label: 'Modèle neutre', value: 'reset'}] : []), {label: 'Enregistrer', kind: 'primary', onClick: b => unchips(api.$('#lEd', b))}],
      onMount: b => {
        b.querySelectorAll('[data-cmd]').forEach(x => x.addEventListener('mousedown', e => { e.preventDefault(); document.execCommand(x.dataset.cmd); }));
        api.$('#lF', b).addEventListener('change', e => { const f = e.target.value; if (!f) return; api.$('#lEd', b).focus(); document.execCommand('insertHTML', false, chips(`{{${f}}}`) + '&nbsp;'); e.target.value = ''; });
      }});
    if (r === null || r === undefined) return;
    R.lettres ??= {}; if (r === 'reset') delete R.lettres[k]; else R.lettres[k] = r;
    api.save(); redraw();
  }
  // Répétitions : un créneau (10 min par défaut) par sujet qui a une interview ou une démonstration, dans l'ordre du programme,
  // à partir de l'heure de la première répétition (ou d'un sujet donné, dont l'heure vient d'être changée)
  // nombre de participations d'un sujet (« Deux démonstrations… » importé du classeur compte pour deux)
  const nbParts = it => partsOf(it).reduce((n, x) => n + (x.libre ? (/\b(deux|trois|quatre)\b|\+|&/i.test(x.libre) ? 2 : 1) : 1), 0);
  const aRepeter = R => R.items.filter(it => ['discours', 'partie'].includes(it.type) && partsOf(it).length);
  function planRepet(R, from) {
    const L = aRepeter(R), pas = Number(R.repetPas) || 10; let k0 = 0, t0 = toMin(R.repetDebut);
    if (from) { const k = L.indexOf(from), t = toMin(from.repet); if (k >= 0 && t !== null) { k0 = k; t0 = t; if (k === 0) R.repetDebut = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; } }
    if (t0 === null) return 0;
    // une seule interview ou démonstration : 10 min ; plusieurs : 20 min
    let t = t0; for (const it of L.slice(k0)) { it.repet = `à ${fmtH(t)}`; t += nbParts(it) > 1 ? 2 * pas : pas; }
    for (const it of R.items) if (['discours', 'partie'].includes(it.type) && !L.includes(it)) it.repet = '';
    return L.length;
  }
  return {styleLetter, signature, aRepeter, planRepet, PTYPES, partsOf, partLabel, partText, statutOf, store, modele, onePage, parseProgramme, importCourrier, values, timed, groupsOf, fieldify, sheetToHtml, importClasseur, importInvitation, pionniers, lettreBytes, lettreNom, avecLettre, programmePdf, pionniersPdf, editLettre, longDate, fmtH, toMin, nomOf, isMe, TYPES, LETTRES};
})();

App.registerSkill({
  id: 'reunion-pp', name: 'Réunion des pionniers', icon: '🎤', group: 'metier', order: 14, version: '1.0',
  description: 'Réunion annuelle avec les PP et PS : programme, participations des orateurs, lettres, invitation.',
  mount(el, api) {
    const X = App.reunionPP, S = X.store();
    const st = App.reunionPPState ??= {id: null};
    const draw = () => this.mount(el, api);
    const R = S.reunions.find(r => r.id === st.id) || S.reunions.at(-1);
    if (R) st.id = R.id;
    const head = `<div class="page-head"><div><h1>Réunion des pionniers</h1><p>Réunion annuelle du responsable de circonscription avec les PP et PS : programme, orateurs, lettres et invitation.</p></div></div>`;
    const newR = (from) => { const r = {id: api.uid(), annee: String(new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear()), theme: '', date: '', lieu: from?.lieu || '', adresse: from?.adresse || '', debut: from?.debut || '09:30',
      repetDate: '', repetLieu: from?.repetLieu || 'Zoom', zoom: from?.zoom || '', code: '', president: from?.president || '', lettres: from?.lettres ? JSON.parse(JSON.stringify(from.lettres)) : S.lettresDepart ? JSON.parse(JSON.stringify(S.lettresDepart)) : {},
      items: from ? from.items.map(it => ({id: api.uid(), type: it.type, titre: it.type === 'cantique' || it.type === 'pause' || it.type === 'priere' ? it.titre : '', expose: '', duree: it.duree, plan: it.plan, nom: '', prenom: '', asm: ''})) : [
        {id: api.uid(), type: 'cantique', titre: 'Cantique', duree: 5}, {id: api.uid(), type: 'priere', titre: 'Prière', duree: 0}, {id: api.uid(), type: 'discours', titre: '', duree: 15}, {id: api.uid(), type: 'pause', titre: 'Pause', duree: 20}, {id: api.uid(), type: 'cantique', titre: 'Cantique et prière', duree: 5}],
      exclus: [], ajouts: []}; S.reunions.push(r); st.id = r.id; api.save(); return r; };
    if (!R) {
      el.innerHTML = `${head}<div class="card stack" style="max-width:720px"><strong>Commencer</strong>
        <p class="small muted" style="margin:0">Importez votre classeur « Publipostage Réunion PP » (.xlsm) : le thème, la date, le lieu, les répétitions, le programme, les orateurs et les textes de vos lettres sont repris. Ou partez d’un programme vide.</p>
        <div class="row"><button class="btn primary" id="rImp">Importer le classeur Excel…</button><button class="btn" id="rCour">Depuis le courrier officiel (PDF)…</button><button class="btn" id="rNew">Programme vide</button></div></div>`;
      api.$('#rCour', el).addEventListener('click', async () => { const r = newR(); if (await X.importCourrier(r)) draw(); else { S.reunions.splice(S.reunions.indexOf(r), 1); api.save(); } });
      api.$('#rImp', el).addEventListener('click', async () => { const r = newR(); if (await X.importClasseur(r)) draw(); else { S.reunions.splice(S.reunions.indexOf(r), 1); api.save(); } });
      api.$('#rNew', el).addEventListener('click', () => { newR(); draw(); });
      return;
    }
    R.items ??= []; R.lettres ??= {}; R.exclus ??= []; R.ajouts ??= [];
    // lettres importées avant la mise en forme : présentation appliquée une fois
    for (const k of ['priere', 'discours', 'partie']) if (R.lettres[k] && !R.lettres[k].includes('<!--mf1-->')) { R.lettres[k] = X.styleLetter(R.lettres[k]); api.save(); }
    const {rows, fin} = X.timed(R), groups = X.groupsOf(R), pio = X.pionniers(R);
    const asmCount = [...new Set(pio.map(p => p.asm))].map(a => [a, pio.filter(p => p.asm === a)]);
    const persons = api.data.persons;
    // Les orateurs sont des anciens : seuls eux sont proposés, et un autre nom est signalé
    // de préférence des anciens pionniers (PP, PS) : proposés en premier
    const pioSt = p => ['PP', 'PS'].includes(X.statutOf(p).st) ? X.statutOf(p).st : '';
    const anciens = persons.filter(p => p.fonction === 'Ancien' && !X.statutOf(p).gone).sort((a, b) => (pioSt(a) ? 0 : 1) - (pioSt(b) ? 0 : 1) || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
    const nPio = anciens.filter(pioSt).length;
    const ancienOf = it => anciens.find(p => api.norm(`${p.nom} ${p.prenom}`) === api.norm(`${it.nom} ${it.prenom}`));
    // Le responsable de circonscription (vous, d'après le profil) présente aussi des sujets : proposé en tête de liste
    const prof = api.data.settings.profil || {}, code = api.data.settings.circo?.code || '';
    const moi = prof.nom ? {nom: prof.nom.toUpperCase(), prenom: prof.prenom || '', asm: code ? `RC ${code}` : 'Responsable de circonscription'} : null;
    const pasAncien = it => it.nom && ['priere', 'discours', 'partie'].includes(it.type) && !X.isMe(it) && anciens.length && !ancienOf(it);
    const inp = (f, v, o = '') => `<input type="text" data-f="${f}" value="${api.esc(v ?? '')}" ${o}>`;
    el.innerHTML = `${head}
      <div class="row" style="margin-bottom:12px">
        <select id="rSel" style="width:auto;font-weight:600">${S.reunions.map(r => `<option value="${r.id}" ${r.id === R.id ? 'selected' : ''}>Réunion ${api.esc(r.annee || '')}${r.date ? ' — ' + api.esc(X.longDate(r.date)) : ''}</option>`).join('')}</select>
        <button class="btn" id="rNew">+ Nouvelle réunion</button><button class="btn" id="rImp">Importer le classeur Excel…</button><button class="btn" id="rCour" title="Lettre officielle avec la page « Programme pour l’année de service » : thème, éléments et durées">Remplir depuis le courrier (PDF)…</button><span style="flex:1"></span>
        <button class="btn primary" id="rProg">Programme PDF</button><button class="btn" id="rLet">Lettres aux orateurs (ZIP)</button><button class="btn" id="rInv">Invitation PDF</button></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;align-items:start">
        <div class="card stack" id="rInfo"><strong>Réunion</strong>
          <div class="form-grid">
            <label class="field"><span>Année de service</span>${inp('annee', R.annee)}</label>
            <label class="field"><span>Date</span><input type="date" data-f="date" value="${api.esc(R.date || '')}"></label>
            <label class="field wide"><span>Thème</span>${inp('theme', R.theme)}</label>
            <label class="field"><span>Lieu</span>${inp('lieu', R.lieu, 'placeholder="Salle du Royaume de …"')}</label>
            <label class="field"><span>Adresse</span>${inp('adresse', R.adresse, 'placeholder="rue - code postal ville"')}</label>
            <label class="field"><span>Début</span><input type="time" data-f="debut" value="${api.esc(R.debut || '09:30')}"></label>
            <label class="field"><span>Fin annoncée</span>${inp('finAnnoncee', R.finAnnoncee, `placeholder="${X.fmtH(fin)} (calculée)"`)}</label>
            <label class="field"><span>Président</span>${inp('president', R.president)}</label>
          </div>
          <strong class="small">Répétitions</strong>
          <div class="form-grid">
            <label class="field"><span>Date</span><input type="date" data-f="repetDate" value="${api.esc(R.repetDate || '')}"></label>
            <label class="field"><span>Première répétition</span><input type="time" data-f="repetDebut" value="${api.esc(R.repetDebut || '')}"></label>
            <label class="field"><span>Créneau pour 1 interview ou démo (min)</span><input type="number" min="5" max="60" data-f="repetPas" value="${api.esc(R.repetPas || 10)}" title="Le double quand il y en a plusieurs"></label>
            <div class="field wide"><button class="btn primary" type="button" id="rRepCalc">↻ Calculer les horaires de répétition</button>
              <span class="small muted">${X.aRepeter(R).length} sujet(s) avec interview ou démonstration</span></div>
            <label class="field"><span>Lieu</span>${inp('repetLieu', R.repetLieu)}</label>
            <label class="field"><span>N° Zoom</span>${inp('zoom', R.zoom)}</label>
            <label class="field"><span>Code secret</span>${inp('code', R.code)}</label>
          </div></div>
        <div class="card stack"><strong>Lettres</strong>
          ${Object.entries(X.LETTRES).map(([k, l]) => `<div class="row small"><span style="flex:1">${l} ${R.lettres[k] ? '<span class="pill ok">votre modèle</span>' : '<span class="pill">modèle neutre</span>'}</span><button class="btn" data-edit="${k}">Modifier</button></div>`).join('')}
          <div class="row"><button class="btn" id="rImpInv">Importer la lettre d’invitation (Word)…</button></div>
          <div class="row small"><span style="flex:1">Signature : ${X.signature() ? `<img src="${X.signature()}" style="height:32px;vertical-align:middle;background:#fff;border:1px solid var(--line);border-radius:4px">` : '<span class="muted">aucune</span>'}</span><button class="btn" id="rSig">${api.data.settings.profil?.signature ? 'Changer' : 'Importer une image'}…</button></div>
          <p class="small muted" style="margin:0">Les lettres sont produites en PDF. Les orateurs reçoivent la lettre de leur participation ; l’invitation est la même pour tous les pionniers (vous la transmettez aux CCA).</p></div>
        <div class="card stack"><strong>Pionniers invités : ${pio.length}</strong>
          <div class="small" style="max-height:220px;overflow:auto">${asmCount.map(([a, l]) => `<div><strong>${api.esc(a || 'Sans assemblée')}</strong> (${l.length}) : ${l.map(p => `${api.esc(p.nom)} ${api.esc(p.prenom)}${p.statut === 'PS' ? ' <span class="pill">PS</span>' : ''} <a href="#" data-excl="${p.id || ''}" data-aj="${p.ajout ? api.esc(p.nom + '|' + p.prenom) : ''}" title="Retirer" style="color:var(--danger);text-decoration:none">✕</a>`).join(', ')}</div>`).join('') || '<span class="muted">Aucun PP ni PS trouvé : renseignez les statuts dans Circonscription › Proclamateurs (ou avec les fiches S-21).</span>'}</div>
          ${R.exclus.length ? `<div class="small muted">${R.exclus.length} pionnier(s) retiré(s) de la liste. <a href="#" id="rRest">Tout rétablir</a></div>` : ''}
          <div class="row"><button class="btn" id="rAdd">+ Ajouter</button><button class="btn" id="rPioPdf">Liste PDF</button></div>
          <p class="small muted" style="margin:0">D’après le statut du dernier cycle de chaque assemblée (Circonscription), à défaut la fiche S-21. Déménagements et décès exclus.</p></div>
      </div>
      <div class="card stack" style="margin-top:12px"><div class="row"><strong style="flex:1">Programme et orateurs</strong><span class="small muted">De ${X.fmtH(X.toMin(R.debut) ?? 570)} à ${X.fmtH(fin)} · Retours : ${R.items.filter(x => x.nom && x.retour && !X.isMe(x) && x.type !== 'cantique').length} / ${R.items.filter(x => x.nom && !X.isMe(x) && ['priere', 'discours', 'partie'].includes(x.type)).length} orateur(s) ont confirmé</span></div>
        <div class="table-wrap"><table class="list" id="rTab"><tr><th>Heure</th><th>Type</th><th>Titre</th><th>Min.</th><th>Orateur</th><th title="Cochez quand l’orateur a confirmé qu’il sera présent et accepte de présenter son sujet">Retours</th><th>Assemblée</th><th>Interviews / démonstrations</th><th title="Participation de l’auditoire">Aud.</th><th>Répétition</th><th></th></tr>
        ${rows.map(({it, h}, i) => { const g = groups[it.id];
          return `<tr data-i="${i}" ${it.type === 'pause' ? 'style="background:var(--bg2,#f3f5f8)"' : ''}>
          <td style="white-space:nowrap;font-weight:600">${h === null ? '' : X.fmtH(h)}</td>
          <td><select data-c="type" style="width:auto;padding:2px 4px">${Object.entries(X.TYPES).map(([k, l]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td style="min-width:220px">${it.type === 'partie' ? `<input type="text" data-c="expose" value="${api.esc(it.expose || '')}" placeholder="Titre de l’exposé" style="font-size:12px;margin-bottom:3px">` : ''}<input type="text" data-c="titre" value="${api.esc(it.titre || '')}" placeholder="${it.type === 'partie' ? 'Partie' : 'Titre'}">${g ? `<div class="small muted">Partie ${g.ids.indexOf(it.id) + 1} / ${g.ids.length}</div>` : ''}</td>
          <td><input type="number" min="0" data-c="duree" value="${api.esc(it.duree ?? '')}" style="width:56px;padding:4px"></td>
          <td>${it.type === 'pause' ? '' : `<input type="text" data-c="orateur" list="rPers" value="${api.esc([(it.nom || '').toUpperCase(), it.prenom].filter(Boolean).join(' '))}" placeholder="Ancien : NOM Prénom" style="min-width:140px${pasAncien(it) ? ';border-color:var(--warn);background:#fff8e6' : ''}">${pasAncien(it) ? '<div class="small" style="color:var(--warn)">⚠ pas ancien dans l’annuaire</div>' : ancienOf(it) && !X.isMe(it) && !pioSt(ancienOf(it)) ? '<div class="small muted">ni PP ni PS</div>' : ancienOf(it) && pioSt(ancienOf(it)) ? `<div class="small" style="color:var(--ok,#2e7d32)">${pioSt(ancienOf(it))}</div>` : ''}`}</td>
          <td style="white-space:nowrap">${['priere', 'discours', 'partie'].includes(it.type) && !X.isMe(it) ? `<label class="small" title="L’orateur sera présent et accepte de présenter ce sujet" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;${it.retour ? 'color:var(--ok,#2e7d32);font-weight:600' : ''}"><input type="checkbox" data-c="retour" ${it.retour ? 'checked' : ''} ${it.nom ? '' : 'disabled'} style="width:18px;height:18px">${it.retour ? 'Accepte' : 'En attente'}</label>` : ''}</td>
          <td>${it.type === 'pause' ? '' : `<input type="text" data-c="asm" value="${api.esc(it.asm || '')}" style="min-width:90px">`}</td>
          <td style="min-width:150px">${['discours', 'partie'].includes(it.type) ? `${X.partsOf(it).map((x, k) => `<span class="pill" style="display:inline-flex;gap:4px;align-items:center;margin:0 4px 4px 0">${api.esc(X.partLabel(x))}<a href="#" data-pdel="${k}" title="Retirer" style="color:var(--danger);text-decoration:none">✕</a></span>`).join('')}<button class="btn" data-padd style="padding:2px 8px;font-size:12px">+ Ajouter</button>` : ''}</td>
          <td>${['discours', 'partie'].includes(it.type) ? `<input type="checkbox" data-c="auditoire" ${it.auditoire ? 'checked' : ''}>` : ''}</td>
          <td>${['discours', 'partie'].includes(it.type) ? `<input type="text" data-c="repet" value="${api.esc(it.repet || '')}" placeholder="à 18h00" style="width:80px">` : ''}</td>
          
          <td style="white-space:nowrap"><button class="btn" data-up title="Monter">↑</button><button class="btn" data-down title="Descendre">↓</button>${['priere', 'discours', 'partie'].includes(it.type) && it.nom && !X.isMe(it) ? `<button class="btn" data-pdf title="Lettre de ${api.esc(X.nomOf(it))} (PDF)">📄</button>` : ''}<button class="btn" data-del title="Supprimer">✕</button></td></tr>`; }).join('')}
        </table></div>
        <datalist id="rPers">${moi ? `<option value="${api.esc(moi.nom + ' ' + moi.prenom)}">Responsable de circonscription${code ? ' (RC ' + api.esc(code) + ')' : ''}</option>` : ''}${anciens.filter(p => !moi || api.norm(p.nom + ' ' + p.prenom) !== api.norm(moi.nom + ' ' + moi.prenom)).map(p => `<option value="${api.esc((p.nom || '').toUpperCase() + ' ' + (p.prenom || ''))}">${pioSt(p) ? pioSt(p) + ' · ' : 'non pionnier · '}${api.esc(p.assemblee || '')}</option>`).join('')}</datalist>
        <div class="row">${Object.entries(X.TYPES).map(([k, l]) => `<button class="btn" data-addt="${k}">+ ${l}</button>`).join('')}</div>
        <p class="small muted" style="margin:0">Orateurs : ${moi ? 'vous-même (responsable de circonscription) et ' : ''}les anciens de l’annuaire (${anciens.length}, dont ${nPio} pionnier(s) PP ou PS proposés en premier) ; vos propres sujets n’ont pas de lettre. Les horaires se calculent à partir de l’heure de début et des durées. Les parties consécutives d’un même exposé sont numérotées et regroupées dans le programme. Vos propres participations n’ont pas de lettre.</p></div>`;

    const save = () => api.save();
    api.$('#rSel', el).addEventListener('change', e => { st.id = e.target.value; draw(); });
    api.$('#rNew', el).addEventListener('click', async () => {
      const ok = await api.confirm('Nouvelle réunion', `Créer la réunion de l’année suivante ? Le lieu, l’horaire, la structure du programme (durées, pause, cantiques) et vos modèles de lettres sont repris de la réunion ${R.annee || ''}. Thème, dates et orateurs sont à remplir.`, 'Créer');
      if (ok) { const r = newR(R); r.annee = String((Number(R.annee) || new Date().getFullYear()) + 1); save(); draw(); } });
    api.$('#rImp', el).addEventListener('click', async () => {
      if (R.items.some(x => x.nom) && !await api.confirm('Importer le classeur', `Les informations et le programme de la réunion ${R.annee || ''} seront remplacés par ceux du classeur. Continuer ?`, 'Importer')) return;
      if (await X.importClasseur(R)) draw(); });
    api.$('#rImpInv', el).addEventListener('click', async () => { if (await X.importInvitation(R)) draw(); });
    api.$('#rCour', el).addEventListener('click', async () => { if (await X.importCourrier(R)) draw(); });
    api.$('#rSig', el).addEventListener('click', async () => {
      const f = await api.pickFile('image/png,image/jpeg'); if (!f) return;
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      if (!/^data:image\/(png|jpe?g)/.test(url)) return api.toast('Image PNG ou JPG attendue.', 'error');
      api.data.settings.profil.signature = url; for (const k of ['priere', 'discours', 'partie']) if (R.lettres[k]) R.lettres[k] = X.styleLetter(R.lettres[k].replace(/<!--mf1-->/, '').replace(/ ?<img src="data:image[^>]+>/, ''));
      api.save(); api.toast('Signature enregistrée'); draw(); });
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => X.editLettre(R, b.dataset.edit, draw)));
    api.$('#rInfo', el).addEventListener('change', e => { const f = e.target.dataset.f; if (!f) return; R[f] = e.target.value.trim(); if (f === 'date') delete R.dateTexte; if (f === 'repetDate') delete R.repetTexte;
      if ((f === 'repetDebut' || f === 'repetPas') && R.repetDebut) { const n = X.planRepet(R); if (n) api.toast(`Horaires de répétition proposés pour ${n} orateur(s) : ${Number(R.repetPas) || 10} min pour une interview ou démonstration, ${2 * (Number(R.repetPas) || 10)} min s’il y en a plusieurs`); save(); draw(); return; }
      save(); if (['debut', 'date', 'annee'].includes(f)) draw(); });
    api.$('#rRepCalc', el).addEventListener('click', () => {
      const v = api.$('[data-f=repetDebut]', el).value; if (v) R.repetDebut = v;
      if (!R.repetDebut) return api.toast('Indiquez d’abord l’heure de la première répétition.', 'error');
      const n = X.planRepet(R); save(); draw();
      api.toast(n ? `Horaires de répétition calculés pour ${n} sujet(s)` : 'Aucun sujet avec interview ou démonstration : ajoutez-les dans la colonne « Interviews / démonstrations ».', n ? '' : 'error'); });
    const tab = api.$('#rTab', el);
    tab.addEventListener('change', e => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return; const it = R.items[+tr.dataset.i], c = e.target.dataset.c; if (!c) return;
      if (c === 'orateur') { const v = e.target.value.trim(), m = /^([A-ZÀ-Ý'’\- ]{2,}?)\s+([A-ZÀ-Ý][^A-Z].*)$/.exec(v);
        if (m) { it.nom = m[1].trim(); it.prenom = m[2].trim(); } else { const [a, ...b] = v.split(' '); it.nom = (a || '').toUpperCase(); it.prenom = b.join(' '); }
        const p = ancienOf(it); if (moi && X.isMe(it)) it.asm = moi.asm; else if (p) it.asm = p.assemblee || it.asm;
        else if (it.nom && !X.isMe(it) && anciens.length) api.toast(`${X.nomOf(it)} n’est pas ancien dans l’annuaire : les orateurs de la réunion des pionniers sont des anciens.`, 'error'); }
      else if (e.target.type === 'checkbox') it[c] = e.target.checked;
      else if (c === 'duree') it.duree = Math.max(0, Number(e.target.value) || 0);
      else it[c] = e.target.value.trim();
      if (c === 'repet' && X.toMin(it.repet) !== null) { X.planRepet(R, it); save(); return draw(); }   // les répétitions suivantes se décalent
      if (['orateur', 'type'].includes(c) && R.repetDebut) X.planRepet(R);
      save(); if (['type', 'duree', 'expose', 'orateur', 'retour'].includes(c)) draw();
    });
    tab.addEventListener('click', async e => {
      const del = e.target.closest('[data-pdel]');
      if (del) { e.preventDefault(); const it = R.items[+del.closest('tr[data-i]').dataset.i]; X.partsOf(it).splice(+del.dataset.pdel, 1); it.participation = X.partText(it.parts); if (R.repetDebut) X.planRepet(R); save(); draw(); return; }
      const b = e.target.closest('button'); const tr = e.target.closest('tr[data-i]'); if (!b || !tr) return; const i = +tr.dataset.i;
      if (b.hasAttribute('data-up') && i > 0) { [R.items[i - 1], R.items[i]] = [R.items[i], R.items[i - 1]]; if (R.repetDebut) X.planRepet(R); save(); draw(); }
      if (b.hasAttribute('data-down') && i < R.items.length - 1) { [R.items[i + 1], R.items[i]] = [R.items[i], R.items[i + 1]]; if (R.repetDebut) X.planRepet(R); save(); draw(); }
      if (b.hasAttribute('data-del') && await api.confirm('Supprimer', 'Supprimer cet élément du programme ?', 'Supprimer', true)) { R.items.splice(i, 1); save(); draw(); }
      if (b.hasAttribute('data-padd')) {
        const it = R.items[i], v = await api.modal({title: `Participation — ${it.titre || 'sujet'}`, body: `<div class="form-grid">
          <label class="field"><span>Type</span><select id="pT">${X.PTYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
          <label class="field"><span>Durée (min)</span><input type="number" id="pD" min="0" max="30" value="3"></label>
          <label class="field wide"><span>Précision (facultatif)</span><input type="text" id="pN" placeholder="ex. : avec un pionnier spécial, 2 personnes…"></label></div>
          <p class="small muted">Ajoutez autant de participations que nécessaire : deux interviews, une interview puis une démonstration…</p>`,
          actions: [{label: 'Annuler', value: null}, {label: 'Ajouter', kind: 'primary', onClick: bx => ({type: api.$('#pT', bx).value, duree: Math.max(0, Number(api.$('#pD', bx).value) || 0), note: api.$('#pN', bx).value.trim()})}]});
        if (!v) return; X.partsOf(it).push(v); it.participation = X.partText(it.parts); if (R.repetDebut) X.planRepet(R); save(); draw(); return;
      }
      if (b.hasAttribute('data-pdf')) { const it = R.items[i]; try { api.download(X.lettreNom(R, it), new Blob([await X.lettreBytes(R, it)], {type: 'application/pdf'})); } catch (err) { console.error(err); api.toast('Erreur PDF : ' + err.message, 'error'); } }
    });
    el.querySelectorAll('[data-addt]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.addt, last = R.items.filter(x => x.type === 'partie').at(-1);
      R.items.push({id: api.uid(), type: t, titre: t === 'pause' ? 'Pause' : t === 'priere' ? 'Prière' : t === 'cantique' ? 'Cantique' : '', expose: t === 'partie' ? last?.expose || '' : '', duree: t === 'pause' ? 20 : t === 'priere' ? 0 : t === 'cantique' ? 5 : 15, nom: '', prenom: '', asm: ''}); save(); draw(); }));
    api.$('#rProg', el).addEventListener('click', async () => { try { api.download(App.pdf.fileName(`Programme réunion des pionniers ${R.annee || ''}`) + '.pdf', new Blob([await X.programmePdf(R)], {type: 'application/pdf'})); } catch (err) { console.error(err); api.toast('Erreur PDF : ' + err.message, 'error'); } });
    api.$('#rLet', el).addEventListener('click', async () => {
      const L = X.avecLettre(R); if (!L.length) return api.toast('Aucun orateur à qui écrire : renseignez les orateurs du programme.', 'error');
      const nA = L.filter(pasAncien).length; if (nA && !await api.confirm('Orateurs à vérifier', `${nA} orateur(s) ne sont pas anciens dans l’annuaire (signalés ⚠ dans le programme). Produire quand même les lettres ?`, 'Produire')) return;
      try { const entries = []; for (const it of L) entries.push({name: X.lettreNom(R, it), bytes: new Uint8Array(await X.lettreBytes(R, it))});
        api.download(App.pdf.fileName(`Lettres orateurs réunion PP ${R.annee || ''}`) + '.zip', App.files.zip(entries)); api.toast(`${entries.length} lettre(s) dans le ZIP`); }
      catch (err) { console.error(err); api.toast('Erreur PDF : ' + err.message, 'error'); } });
    api.$('#rInv', el).addEventListener('click', async () => {
      try { const bytes = await X.onePage(App.pdf.merge(X.modele(R, 'invitation'), App.fields.values({reunion: {R}})), 'Invitation réunion des pionniers');
        api.download(App.pdf.fileName(`Invitation réunion des pionniers ${R.annee || ''}`) + '.pdf', new Blob([bytes], {type: 'application/pdf'})); }
      catch (err) { console.error(err); api.toast('Erreur PDF : ' + err.message, 'error'); } });
    api.$('#rPioPdf', el).addEventListener('click', async () => { try { api.download(App.pdf.fileName(`Pionniers invités ${R.annee || ''}`) + '.pdf', new Blob([await X.pionniersPdf(R)], {type: 'application/pdf'})); } catch (err) { api.toast('Erreur PDF : ' + err.message, 'error'); } });
    el.querySelectorAll('[data-excl]').forEach(a => a.addEventListener('click', e => { e.preventDefault();
      if (a.dataset.excl) R.exclus.push(a.dataset.excl); else { const [n, p] = a.dataset.aj.split('|'); R.ajouts = R.ajouts.filter(x => !(x.nom === n && x.prenom === p)); } save(); draw(); }));
    api.$('#rRest', el)?.addEventListener('click', e => { e.preventDefault(); R.exclus = []; save(); draw(); });
    api.$('#rAdd', el).addEventListener('click', async () => {
      const v = await api.modal({title: 'Ajouter un pionnier', body: `<div class="form-grid"><label class="field"><span>Nom</span><input type="text" id="aN"></label><label class="field"><span>Prénom</span><input type="text" id="aP"></label>
        <label class="field"><span>Assemblée</span><input type="text" id="aA" list="aAL"><datalist id="aAL">${api.data.congregations.map(c => `<option value="${api.esc(c.nom)}">`).join('')}</datalist></label>
        <label class="field"><span>Statut</span><select id="aS"><option>PP</option><option>PS</option></select></label></div>`,
        actions: [{label: 'Annuler', value: null}, {label: 'Ajouter', kind: 'primary', onClick: b => { const n = api.$('#aN', b).value.trim().toUpperCase(); if (!n) return false; return {nom: n, prenom: api.$('#aP', b).value.trim(), asm: api.$('#aA', b).value.trim().toUpperCase(), statut: api.$('#aS', b).value}; }}]});
      if (v) { R.ajouts.push(v); save(); draw(); } });
  }
});
