# Artillery Cop — catalogue « lookbook »

Cette nouvelle version du catalogue est **uniquement en images**. Elle n'affiche ni prix, ni photos QC, ni liens d'achat. On parcourt les articles, on ajoute au **cœur** ceux que l'on veut acheter, puis on **partage sa sélection** : par lien, ou en copiant la liste.

Elle reprend la lecture des tableurs de la v1 et ajoute un grand catalogue JSON (environ 44 000 articles, chargé en arrière-plan pour que le site s'ouvre vite). Le design s'inspire des catalogues de type lookbook : fond sombre, carrousels, grandes cartes de marques et fiche en plein écran. L'identité reprend le monogramme « AC » (`images/logo.svg`, redessiné en vectoriel) et des titres en capitales condensées.

```
index.html   structure de la page
style.css    design
donnees.js   lecture des tableurs (repris de la v1)
app.js       interface : accueil, listes, fiche, sélection
config.js    ← le seul fichier à modifier
data/        copies locales des tableurs
images/      photos extraites du tableur Budget
outils/preparer_tableur.py   mise à jour des copies locales
```

## Ce que l'on trouve sur le site

- **Sur téléphone** : une barre d'onglets en bas de l'écran (Accueil, Explorer, Recherche, Sélection). Dans les listes, la recherche reste visible en faisant défiler. Dans une fiche, le bouton « Ajouter à ma sélection » reste à portée du pouce.
- **Explorer** : l'index A–Z de toutes les marques et catégories, avec un filtre.

- **Accueil** :
  - le titre et une barre de recherche ;
  - « Outfits · Inspiration » et « Nouveautés » (les 7 derniers jours, réglable avec `joursNouveautes`) ;
  - le carrousel « À la une » (la section `TOP PICK` du tableur) ;
  - les « Découvertes du jour » (un tirage qui change chaque jour) ;
  - les cartes **Marques** et **Catégories**.
- **Marques** : elles sont détectées dans le nom des articles, d'après la liste `marques` de `config.js`. Ajoutez une ligne pour en créer une, par exemple `["Acne Studios", "acne"]`.
- **Liste** (catégorie, marque, tout, recherche) :
  - une grille d'images ;
  - un champ pour affiner, insensible aux accents ;
  - un tri par nom ;
  - des pastilles pour filtrer par marque dans une catégorie, ou par catégorie dans une marque.
- **Fiche** :
  - l'image en grand, avec zoom au clic ;
  - les flèches, les touches ← → et le swipe pour passer d'un article à l'autre ;
  - « Ajouter à ma sélection » et « Copier le lien » ;
  - « Vous aimerez aussi ».
- **Ma sélection** :
  - **Partager** : le menu de partage du téléphone, ou le lien copié sur ordinateur ;
  - **Copier la liste** : la liste en texte, à coller dans un message ;
  - **Vider**.

  Le lien partagé (`#/selection?ids=…`) ouvre une « Sélection partagée » que la personne qui le reçoit peut ajouter à la sienne.

Chaque page et chaque fiche a sa propre adresse (`#/m/nike`, `#/c/shoe?a=…`), donc tout se partage.

La sélection est enregistrée dans le navigateur de la personne. Elle ne vous est pas envoyée : c'est à elle de vous partager son lien ou sa liste.

## Données, mise à jour et mise en ligne

Le fonctionnement est le même que pour la v1 :

- Le tableur **Top Picks** est lu en direct depuis Google, une fois le site hébergé.
- Le tableur **Budget** utilise sa copie locale. Pour la mettre à jour :

  ```bash
  python3 outils/preparer_tableur.py --id 1V8HLT30eYrr_9rv4Ifq_Y59EHE01OU0Tu9Nqt2q_bRw --nom tableur1
  ```

- Pour tester en local, lancez la commande ci-dessous, puis ouvrez http://localhost:8000. Ouvrir `index.html` directement fonctionne aussi, avec les copies locales.

  ```bash
  python3 -m http.server 8000
  ```

- Pour mettre en ligne, déposez le dossier sur Netlify, GitHub Pages ou OVH, sans `outils/.cache`. Le fichier `netlify.toml` est déjà prêt.

## Catégories : un seul classement

Les deux tableurs et le catalogue JSON n'emploient pas les mêmes noms (« HOODIE », « Pulls à capuche »…), et leurs sections sont parfois fourre-tout. La liste `categories` de `config.js` définit donc un classement unique, en français. Chaque article y est rangé :

1. **d'après son nom** : « Gucci Handbag » va dans Sacs à main, même s'il était dans la section CAP. La première catégorie dont un mot correspond l'emporte, d'où l'ordre de la liste ;
2. **sinon d'après sa section ou catégorie d'origine**, via `sources`.

Pour le catalogue JSON, c'est l'inverse : son type passe d'abord, mais il est corrigé quand il est manifestement faux. Un album « … Sneakers » contient des chaussures, et un type isolé dans un album (une clé USB classée « Chaussures » chez Corteiz) n'est pas retenu. L'article reste alors visible dans sa marque et dans la recherche, mais il n'est classé dans aucune catégorie.

**Retirer une catégorie :** ajoutez `retiree: true`. Ses articles disparaissent du site. Actuellement : Boîtes à montres, Électronique, Parfums, Jouets (dont Building Blocks), Déco (Room Decor) et Autres (Other).

**Retirer une marque :** ajoutez-la à `exclureMarques` (actuellement Apple et Kaws).

## Coloris

- **Collection (catalogue JSON) :** les photos d'un même produit dans des couleurs différentes sont regroupées en un seul article. Il s'agit des photos du même album, envoyées au même moment, de même type et de même prix. La grille affiche un badge « N coloris » ; la fiche montre les vignettes de chaque coloris, et chaque coloris a son propre lien.
- **Tableurs :** ils n'ont qu'une photo par article. Pour montrer les autres coloris, ajoutez une colonne **« Coloris »** contenant les photos, séparées par des virgules :

  ```
  Noir: https://…/noir.jpg, Blanc: https://…/blanc.jpg, https://…/autre.jpg
  ```

  Le nom de la couleur avant « : » est facultatif.
- **La sélection retient le coloris choisi**, et la liste copiée l'indique.

## Marques et familles

La liste `marques` est regroupée par famille : Luxe & haute couture, Créateurs & contemporain, Streetwear, Sport & sneakers, Outdoor & doudounes, Horlogerie & joaillerie. Chaque famille a sa page (`#/f/…`) et sa carte « Univers » sur l'accueil. Dans Explorer, les marques sont rangées par famille. Une marque n'apparaît qu'à partir de `minArticlesMarque` articles.

## Personnaliser

Dans `config.js` :

- `titre`, `sousTitre`, `logo`, `accent` ;
- `cartesAccueil` : nombre de cartes de marques et de catégories sur l'accueil ;
- `aLaUne` : la section du tableur mise en avant (TOP PICK) ;
- `minArticlesMarque` ;
- la liste `marques`.

Les couleurs et les polices se règlent en haut de `style.css` (`--fond`, `--accent`, `--serif`…).
