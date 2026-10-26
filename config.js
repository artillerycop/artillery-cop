/*
 * Configuration du catalogue (v2 « lookbook »).
 * C'est le seul fichier à modifier pour personnaliser le site.
 */
window.CONFIG = {
  /* ---------- Identité ---------- */
  titre: "Artillery Cop",
  sousTitre: "Parcourez, choisissez, partagez votre sélection.",
  // Logo : image claire, affichée sur fond sombre (barre du haut et accueil).
  logo: "images/logo.svg",
  // Couleur d'accent. Le logo est noir et blanc : l'accent reste blanc cassé.
  accent: "#f3f0ea",

  /* ---------- Sources de données ----------
   * Mêmes réglages que la v1 :
   *   id      identifiant court (sert aussi pour data/<id>.js)
   *   nom     libellé de la source
   *   url     (optionnel) lecture en direct (.xlsx Google Sheets ou CSV)
   *   format  "xlsx", "csv", ou "catalogue-json" (albums + photos, voir donnees.js)
   *   copie   copie locale data/<copie>.js (outils/preparer_tableur.py)
   *   arrierePlan  true = chargé après le premier affichage (gros catalogues)
   */
  sources: [
    {
      id: "tableur2",
      nom: "Top Picks",
      url: "https://docs.google.com/spreadsheets/d/1wpbbcFJLMQ1I9TXLyr9wBVlFQhjz3TqoUW6BG9-KM8c/export?format=xlsx",
      format: "xlsx",
      copie: "tableur2",
    },
    { id: "tableur1", nom: "Budget", copie: "tableur1" },
    {
      // Catalogue JSON (albums + photos) : ~44 000 articles, chargé en arrière-plan
      // après l'affichage des tableurs pour que le site s'ouvre vite sur téléphone.
      id: "collection",
      nom: "Collection",
      url: "https://www.homecopparis.com/data.min.json",
      format: "catalogue-json",
      arrierePlan: true,
    },
  ],

  // Jeu de données d'exemple : mettre true, ou ouvrir index.html?demo=1
  exemple: false,

  /* ---------- Accueil ---------- */
  // Catégorie mise en avant dans le carrousel « À la une » (nom de section du tableur).
  aLaUne: "TOP PICK",
  // Rangée « Nouveautés » : articles datés des N derniers jours du catalogue.
  joursNouveautes: 7,
  // Nombre de cartes de marques / catégories affichées sur l'accueil (le reste dans « Explorer »).
  cartesAccueil: 12,
  /* ---------- Retirés du site ----------
   * Ces catégories et marques n'apparaissent pas, ni leurs articles.
   * Les noms s'écrivent comme dans les données (majuscules et pluriels indifférents).
   */
  exclureCategories: ["BUILDING BLOCKS", "ELECTRONIC", "PERFUME", "WATCH BOX", "ROOM DECOR", "OTHER", "Électronique", "Jouets"],
  exclureMarques: ["Apple", "Kaws"],

  // Nombre minimal d'articles pour qu'une marque ait sa carte.
  minArticlesMarque: 4,

  /* ---------- Marques ----------
   * Détectées dans le nom des articles. Chaque entrée : nom affiché, puis
   * les mots à rechercher (sans accents ni majuscules). Ajoutez-en librement.
   */
  marques: [
    ["Nike", "nike", "air force", "af1", "dunk", "vapor", "air max", "vomero", "pegasus", "tn"],
    ["Jordan", "jordan"],
    ["Nocta", "nocta"],
    ["Adidas", "adidas", "samba", "gazelle", "campus"],
    ["Yeezy", "yeezy"],
    ["New Balance", "new balance"],
    ["Supreme", "supreme"],
    ["Stüssy", "stussy"],
    ["Ralph Lauren", "ralph lauren", "polo ralph"],
    ["Lacoste", "lacoste"],
    ["Moncler", "moncler"],
    ["Stone Island", "stone island"],
    ["Essentials", "essentials", "fear of god"],
    ["Chrome Hearts", "chrome heart", "chrome hearts"],
    ["Louis Vuitton", "louis vuitton", "lv"],
    ["Gucci", "gucci"],
    ["Dior", "dior"],
    ["Prada", "prada"],
    ["Balenciaga", "balenciaga"],
    ["Burberry", "burberry"],
    ["Off-White", "off white", "off-white"],
    ["Bape", "bape"],
    ["Denim Tears", "denim tears"],
    ["Rhude", "rhude"],
    ["Amiri", "amiri"],
    ["Arc'teryx", "arcteryx", "arc'teryx", "arc’teryx", "arc teryx"],
    ["The North Face", "north face", "tnf"],
    ["Canada Goose", "canada goose"],
    ["Carhartt", "carhartt"],
    ["Corteiz", "corteiz", "crtz"],
    ["Trapstar", "trapstar"],
    ["Syna World", "syna"],
    ["Hellstar", "hellstar"],
    ["Gallery Dept", "gallery dept"],
    ["Comme des Garçons", "cdg", "comme des garcons"],
    ["Vlone", "vlone"],
    ["Travis Scott", "travis scott"],
    ["Kaws", "kaws"],
    ["Represent", "represent"],
    ["Palm Angels", "palm angels"],
    ["Rolex", "rolex"],
    ["Audemars Piguet", "audemars piguet"],
    ["Cartier", "cartier"],
    ["Goyard", "goyard"],
    ["Hermès", "hermes"],
    ["Celine", "celine"],
    ["Loewe", "loewe"],
    ["Fendi", "fendi"],
    ["Apple", "airpods", "apple"],
    ["Acne Studios", "acne"],
    ["Aimé Leon Dore", "aime leon dore"],
    ["Alo", "alo"],
    ["AMI Paris", "ami paris"],
    ["Alexander McQueen", "mcqueen"],
    ["Aritzia", "aritzia"],
    ["Asics", "asics"],
    ["Birkenstock", "birkenstock"],
    ["Bottega Veneta", "bottega"],
    ["Broken Planet", "broken planet"],
    ["Casablanca", "casablanca"],
    ["Chanel", "chanel"],
    ["Chloé", "chloe"],
    ["CP Company", "cp company"],
    ["Delvaux", "delvaux"],
    ["Drôle de Monsieur", "drole de monsieur"],
    ["Enfants Riches Déprimés", "enfants riches deprimes"],
    ["Givenchy", "givenchy"],
    ["Golden Goose", "golden goose"],
    ["Jacquemus", "jacquemus"],
    ["Lanvin", "lanvin"],
    ["Loro Piana", "loro piana"],
    ["Louboutin", "louboutin"],
    ["Lululemon", "lulu lemon", "lululemon"],
    ["Margiela", "margiela"],
    ["Miu Miu", "miu miu", "miumiu"],
    ["MontBell", "montbell"],
    ["Montblanc", "montblanc"],
    ["On", "on sneakers", "on x"],
    ["Parajumpers", "parajumpers"],
    ["Rick Owens", "rick owens"],
    ["Rimowa", "rimowa"],
    ["Saint Laurent", "saint laurent", "yves saint laurent", "ysl"],
    ["Salomon", "salomon"],
    ["Saucony", "saucony"],
    ["The Row", "the row"],
    ["Thom Browne", "thom browne"],
    ["Timberland", "timberland"],
    ["Valentino", "valentino"],
    ["Vans", "vans"],
    ["Versace", "versace"],
    ["Zegna", "zegna"],
    ["Zimmermann", "zimmermann"],
  ],

  parPage: 36, // nombre d'images chargées à la fois
};
