# Craqueboules Wars · Invocateurs des Douze

Fan game Dofus façon Summoners War, jouable dans le navigateur.
Usage privé et non commercial : données et images © Ankama, servies par l'API publique DofusDB.

## En ligne automatiquement (GitHub Pages)

À chaque push sur `main`, l'action « Publier le jeu » génère le catalogue et met le jeu en ligne.
À activer une fois : **Settings → Pages → Source : GitHub Actions**. Le lien apparaît dans l'onglet Actions
(ou Settings → Pages), à donner à tes amis. Le catalogue est aussi rafraîchi chaque lundi.

## 1. Générer le catalogue en local (pour tester)

Il faut [Node.js](https://nodejs.org) 18 ou plus. Dans ce dossier :

```
node construire-catalogue.mjs
```

Compte quelques minutes. Le script crée `catalogue.json` : tous les monstres jouables,
tous les Dofus, Trophées et Prysmaradites, et tous les donjons avec leurs monstres et boss.
Les images ne sont pas téléchargées : le jeu les affiche directement depuis DofusDB.

## 2. Tester chez toi

Ouvrir `index.html` en double-cliquant ne marche pas (le navigateur bloque la lecture du catalogue).
Lance plutôt un petit serveur dans ce dossier :

```
npx serve .
```

puis ouvre l'adresse affichée (souvent http://localhost:3000).

## 3. Mettre en ligne pour tes amis

**Le plus simple : Netlify Drop**
1. Va sur https://app.netlify.com/drop
2. Glisse tout ce dossier (avec `catalogue.json`) dans la page.
3. Tu obtiens un lien. Tes amis l'ouvrent, c'est tout.

**Ou GitHub Pages**
1. Crée un dépôt et envoie-y le contenu de ce dossier.
2. Settings → Pages → Source : branche `main`, dossier `/ (root)`.
3. Le lien apparaît après une minute.

## Mettre à jour

Relance `node construire-catalogue.mjs`, puis remets le dossier en ligne de la même façon.
La sauvegarde de chaque joueur reste dans son navigateur (bouton « Copier ma sauvegarde » pour la transférer).

## Fonds de combat (facultatif)

Voir `assets/maps/LISEZMOI.txt`.
