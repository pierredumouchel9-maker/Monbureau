# Mon Bureau — socle (version 0.8.9)

Application personnelle, modulaire, chiffrée et hors ligne.

## Ce que contient le socle

- **Stockage chiffré** : toutes les données sont chiffrées sur l'appareil (AES-GCM 256 bits, clé dérivée du mot de passe maître par PBKDF2-SHA-256, 600 000 itérations). Rien n'est envoyé sur Internet.
- **Verrouillage** : mot de passe maître à l'ouverture, verrouillage après inactivité (5 minutes par défaut) et après 30 secondes en arrière-plan.
- **Annuaire commun** : nom, prénom, date de naissance, date de baptême (avec l'âge et les années depuis le baptême calculés), fonction (Ancien / Assistant), portable, adresse, code postal, ville, ainsi que civilité, assemblée et mail ; import Excel (.xlsx, .xlsm), CSV ou PDF (PDF contenant du texte, comme une liste exportée depuis Word ou Excel ; les PDF scannés ne sont pas encore lus), mise à jour par comparaison avec un nouveau fichier (nouvelles personnes, champs modifiés, personnes absentes, à valider une par une, avec rapport téléchargeable), détection des doublons sans tenir compte des accents (« Éric » = « Eric »).
- **Modèles** : éditeur de lettres avec champs de fusion, aperçu, PDF pour une personne ou ZIP de PDF pour plusieurs.
- **Coffre** : codes d'alarme, Wi-Fi, Zoom, chiffrés à part, avec un second déverrouillage.
- **Sauvegarde** : fichier `.monbureau` chiffré, restaurable sur un autre appareil.
- **Skill Circonscription** : import du classeur d'analyse (onglets ANALYSE et Assemblées), tableau de bord par cycle avec écarts, totaux, pourcentages et moyennes, graphiques d'évolution et de comparaison, saisie des nouveaux cycles, fiche de chaque assemblée et PDF de préparation de visite ; onglet Proclamateurs : étude proclamateur par proclamateur (statut PNB / IN / PP / PAP, fonction, heures des PP sur la base de 50 h/mois, études bibliques, PA, IR), import du suivi depuis le classeur et report dans le tableau du cycle.
- **Gestionnaire de skills** : les modules métier (Assemblée, École, Circonscription, Territoires, Bibliothèque) viendront s'y brancher.

## Installer l'application

L'application doit être servie en HTTPS pour s'installer et fonctionner hors ligne. Le plus simple :

1. Aller sur **app.netlify.com/drop** (gratuit, compte requis).
2. Glisser le dossier `monbureau` dans la page. Netlify donne une adresse en `https://…netlify.app`.
3. Ouvrir cette adresse :
   - **iPhone / iPad** (Safari) : bouton Partager → « Sur l'écran d'accueil ».
   - **Android** (Chrome) : menu ⋮ → « Installer l'application ».
   - **Mac** (Chrome ou Edge) : icône d'installation dans la barre d'adresse. Avec Safari (macOS 14 et plus) : Fichier → « Ajouter au Dock ».

Seul le code de l'application est hébergé : vos données restent sur chaque appareil, chiffrées. Chaque appareil a ses propres données ; pour les transférer, utilisez Sauvegarde puis Restaurer.

## Points importants

- **Mot de passe maître** : s'il est perdu, les données sont irrécupérables, sauf à partir d'une sauvegarde dont vous connaissez le mot de passe.
- **Sauvegardez régulièrement** (page Sauvegarde) : si le navigateur efface ses données, la sauvegarde est le seul moyen de les récupérer.
- Navigateurs pris en charge : Safari 16.4 et plus, Chrome, Edge, Firefox récents.

## Ajouter un skill (pour les étapes suivantes)

Créer `js/skills/mon-skill.js` :

```js
App.registerSkill({
  id: 'mon-skill', name: 'Mon skill', icon: '⭐', order: 20,
  description: 'Ce que fait le skill.',
  mount(el, api) { el.innerHTML = '<h1>Mon skill</h1>'; }
});
```

puis l'ajouter dans `index.html` et dans la liste `FILES` de `sw.js`. Le skill a accès à l'annuaire (`api.data.persons`), aux modèles (`App.modeles.pdfFor`), aux champs de fusion (`App.fields.register`), à la génération de PDF et de ZIP, et à son propre espace de données chiffré (`api.moduleData('mon-skill')`).

## Licences

pdf-lib (génération de PDF) : licence MIT, voir `lib/pdf-lib-LICENSE.md`.
pdf.js (lecture de PDF, Mozilla) : licence Apache 2.0, voir `lib/pdfjs/LICENSE`.
