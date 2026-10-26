/*
 * Configuration du catalogue (v2 « lookbook »).
 * C'est le seul fichier à modifier pour personnaliser le site.
 */
window.CONFIG = {
  /* ---------- Identité ---------- */
  // Le titre d'accueil s'écrit en deux temps : « titre » puis « titreAccent » en italique coloré.
  titre: "Spreadsheet",
  titreAccent: "Catalogue",
  sousTitre: "Parcourez, choisissez, partagez votre sélection.",
  // Logo : chemin ou URL d'une image (ex. "images/logo.svg"). Vide = titre en texte.
  logo: "",
  // Couleur d'accent (champagne). Elle doit rester lisible sur fond sombre.
  accent: "#c9a96e",

  /* ---------- Sources de données ----------
   * Mêmes réglages que la v1 :
   *   id      identifiant court (sert aussi pour data/<id>.js)
   *   nom     libellé de la source
   *   url     (optionnel) lecture en direct (.xlsx Google Sheets ou CSV)
   *   format  "xlsx" ou "csv"
   *   copie   copie locale data/<copie>.js (outils/preparer_tableur.py)
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
  ],

  // Jeu de données d'exemple : mettre true, ou ouvrir index.html?demo=1
  exemple: false,

  /* ---------- Accueil ---------- */
  // Catégorie mise en avant dans le carrousel « À la une » (nom de section du tableur).
  aLaUne: "TOP PICK",
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
    ["Arc'teryx", "arcteryx", "arc'teryx", "arc teryx"],
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
  ],

  parPage: 36, // nombre d'images chargées à la fois
};
