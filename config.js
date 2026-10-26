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
  // Section du tableur mise en avant dans le carrousel « À la une ».
  aLaUne: "TOP PICK",
  // Rangée « Nouveautés » : articles datés des N derniers jours du catalogue.
  joursNouveautes: 7,
  // Nombre de cartes de marques / catégories affichées sur l'accueil (le reste dans « Explorer »).
  cartesAccueil: 12,

  /* ---------- Catégories ----------
   * Un seul classement, en français, pour toutes les sources.
   * Pour chaque article, dans l'ordre :
   *   1. les mots de son nom (« hoodie », « belt »…) : la première catégorie qui correspond gagne,
   *      d'où l'ordre de la liste (« down jacket » avant « jacket », « watch box » avant « watch »…) ;
   *   2. sinon la catégorie ou section d'origine (« SHOES », « Pulls à capuche »…), via « sources ».
   * « retiree: true » : catégorie retirée du site avec tous ses articles. Pour une catégorie retirée,
   * tout article venant d'une de ses « sources » est retiré, même si son nom dit autre chose ;
   * « secours » ne sert que quand rien d'autre ne correspond (ex. section fourre-tout).
   */
  categories: [
    { nom: "Boîtes à montres", retiree: true, mots: ["watch box", "watch boxes", "watch case", "watch roll"], sources: ["WATCH BOX"] },
    { nom: "Coques", mots: ["phone case", "iphone case", "airpods case", "airpod case", "coque"], sources: ["PHONE CASE"] },
    { nom: "Électronique", retiree: true, mots: ["airpods", "airpod", "headphone", "headphones", "earbuds", "jbl", "beats", "ps5", "controller", "dyson", "ghd", "hairdryer", "airwrap", "speaker", "apple watch", "ipad", "macbook", "camera"], sources: ["ELECTRONIC", "ELECTRONICS", "Électronique"] },
    { nom: "Parfums", retiree: true, mots: ["perfume", "parfum", "cologne", "eau de", "fragrance", "100ml"], sources: ["PERFUME"] },
    { nom: "Jouets", retiree: true, mots: ["lego", "bearbrick", "be@rbrick", "action figure", "figure", "figures", "toy", "toys", "beyblade", "plush", "fidget"], sources: ["BUILDING BLOCKS", "Jouets"] },
    { nom: "Déco", retiree: true, mots: ["blanket", "blankets", "pillow", "bed sheets", "rug", "poster", "framed", "pokemon", "ornament", "ornaments", "candle", "lamp"], sources: ["ROOM DECOR"] },
    { nom: "Autres", retiree: true, mots: [], sources: ["OTHER"], secours: ["RANDOM STUFF"] },
    { nom: "Ensembles", mots: ["set", "sets", "suit", "tracksuit", "tech fleece", "ensemble", "survetement"], sources: ["SHORT SETS", "LONG SETS"] },
    { nom: "Claquettes & sandales", mots: ["slide", "slides", "claquette", "claquettes", "sandal", "sandals", "sandale", "sandales", "slipper", "slippers", "foam runner"], sources: ["SLIDES", "Claquettes"] },
    { nom: "Chaussettes", mots: ["socks", "sock", "chaussettes"], sources: ["SOCKS"] },
    { nom: "Chaussures", mots: ["shoe", "shoes", "sneaker", "sneakers", "trainer", "trainers", "runner", "cleats", "boots", "boot", "loafer", "loafers", "chaussure", "chaussures", "basket", "dunk", "dunks", "air force", "af1", "air max", "airmax", "vapormax", "vapor max", "foamposite", "cortez", "kobe", "ja morant", "jordan 1", "jordan 3", "jordan 4", "jordan 5", "jordan 6", "jordan 7", "jordan 8", "jordan 9", "jordan 11", "jordan 12", "jordan 13", "b22", "b23", "b27", "b30", "b33", "b44", "b57", "2002r", "samba", "gazelle", "laces"], sources: ["SHOES", "Chaussures"] },
    { nom: "Sous-vêtements", mots: ["underwear", "boxer", "boxers", "briefs", "calecon", "calecons"], sources: ["UNDERWEAR"] },
    { nom: "Doudounes", mots: ["down jacket", "down jackets", "puffer", "doudoune", "doudounes", "down vest", "nuptse"], sources: ["DOWN JACKET", "Doudounes"] },
    { nom: "Vestes & manteaux", mots: ["jacket", "jackets", "windbreaker", "windbreakers", "wind breaker", "bomber", "bombers", "blazer", "varsity", "letterman", "coat", "coats", "parka", "veste", "manteau", "gilet"], sources: ["JACKET", "JACKETS / VESTS", "WINDBREAKERS", "Vestes", "Manteaux"] },
    { nom: "Sweats à capuche", mots: ["hoodie", "hoodies", "hoody", "zip up", "zip-up", "zipup", "pull a capuche"], sources: ["HOODIE", "Pulls à capuche", "HOODIES / ZIP UPS / SWEATERS"] },
    { nom: "Pulls & mailles", mots: ["sweater", "sweaters", "knit", "knitwear", "cardigan", "quarter zip", "half zip", "pull", "pulls", "maille"], sources: ["SWEATER", "Pulls & Mailles"] },
    { nom: "Sweats", mots: ["sweatshirt", "sweatshirts", "crewneck", "crew neck", "longsleeve", "long sleeve"], sources: ["SWEATSHIRT", "Sweats"] },
    { nom: "Maillots", mots: ["jersey", "jerseys"], sources: ["JERSEY"] },
    { nom: "T-shirts", mots: ["t-shirt", "t-shirts", "t shirt", "tshirt", "tee", "tees", "singlet", "tank top"], sources: ["T-SHIRT", "T-Shirts", "SHIRTS"] },
    { nom: "Polos", mots: ["polo", "polos"], sources: ["Polos"] },
    { nom: "Maillots de bain", mots: ["bikini", "bikinis", "swimsuit", "swimwear", "swim trunks", "maillot de bain"], sources: [] },
    { nom: "Chemises", mots: ["shirt", "shirts", "button up", "button-up", "chemise", "chemises", "overshirt", "flannel"], sources: ["SHIRT", "Chemises"] },
    { nom: "Shorts", mots: ["short", "shorts", "jorts", "jort"], sources: ["SHORTS", "Shorts"] },
    { nom: "Jeans", mots: ["jean", "jeans"], sources: ["JEANS", "Jeans"] },
    { nom: "Pantalons & joggings", mots: ["pants", "pant", "sweatpant", "sweatpants", "joggers", "jogger", "trousers", "cargo", "cargos", "sweats", "pantalon", "pantalons", "track pants"], sources: ["PANTS", "Pantalons", "SWEATS AND JEANS"] },
    { nom: "Bonnets", mots: ["beanie", "beanies", "knitted hat", "knit hat", "bonnet", "bonnets"], sources: ["BEANIC", "Bonnets"] },
    { nom: "Casquettes", mots: ["cap", "caps", "hat", "hats", "trucker", "fitted", "bob", "bucket hat", "casquette", "casquettes"], sources: ["CAP", "Casquettes", "HEADWEAR"] },
    { nom: "Écharpes", mots: ["scarf", "scarves", "echarpe", "echarpes"], sources: ["SCARF", "Écharpes"] },
    { nom: "Masques", mots: ["mask", "masks", "balaclava", "balclavas", "facemask", "ski mask"], sources: ["MASK"] },
    { nom: "Lunettes", mots: ["sunglasses", "sunglass", "glasses", "lunettes", "eyewear"], sources: ["GLASSES"] },
    { nom: "Montres", mots: ["watch", "watches", "rolex", "patek philippe", "richard mille", "royal pop"], sources: ["WATCH", "WATCHES"] },
    { nom: "Bijoux", mots: ["necklace", "necklaces", "pendant", "pendants", "chain", "chains", "ring", "rings", "earring", "earrings", "bracelet", "bracelets", "jewelry", "jewlery", "bijoux", "bijou", "grillz", "cuban"], sources: ["EARRINGS", "RING", "NECKLACE", "BRACELETS", "JEWLERY", "Bijoux"] },
    { nom: "Portefeuilles", mots: ["wallet", "wallets", "card holder", "cardholder", "card case", "porte-cartes", "portefeuille"], sources: ["WALLET", "Portefeuille", "Porte-cartes"] },
    { nom: "Sacs à dos", mots: ["backpack", "backpacks", "sac a dos"], sources: ["BACKPACK", "Sac à dos"] },
    { nom: "Sacs de voyage", mots: ["suitcase", "luggage", "duffle", "duffel", "travel bag", "keepall", "valise", "sac de voyage"], sources: ["Sac de voyage", "Valises"] },
    { nom: "Pochettes & trousses", mots: ["pouch", "clutch", "pochette", "trousse", "toiletry"], sources: ["Pochette", "Trousse", "Étui"] },
    { nom: "Sacs bandoulière", mots: ["crossbody", "cross body", "messenger", "shoulder bag", "sling", "fanny", "waist bag", "belt bag", "banane"], sources: ["Sac bandoulière", "Banane"] },
    { nom: "Ceintures", mots: ["belt", "belts", "ceinture", "ceintures"], sources: ["BELT", "BELTS", "Ceinture", "Ceintures"] },
    { nom: "Sacs à main", mots: ["handbag", "handbags", "tote", "purse", "purses", "bag", "bags", "sac", "sacs", "cabas", "besace"], sources: ["BAG", "BAGS AND PURSES", "Sac à main", "Mini sac", "Sac seau", "Cabas", "Besace", "Sacs"] },
    { nom: "Outfits", mots: [], sources: ["Outfits"] },
  ],

  /* ---------- Photos retirées ----------
   * Chemins ou URL d'images à ne plus afficher (l'article reste, sans photo).
   * Utile car le script de préparation recrée les images à chaque mise à jour du tableur.
   */
  imagesRetirees: [
    "images/tableur1/image973.jpg", // GOYARD POUCH : photo fournisseur avec filigrane
  ],

  /* ---------- Marques retirées ----------
   * Ces marques n'apparaissent pas, ni leurs articles.
   */
  exclureMarques: ["Apple", "Kaws"],

  // Nombre minimal d'articles pour qu'une marque ait sa carte.
  minArticlesMarque: 4,

  /* ---------- Marques, regroupées par famille ----------
   * Détectées dans le nom des articles (ou fournies par la source).
   * Chaque entrée : nom affiché, puis les mots à rechercher (sans accents ni majuscules).
   * Ajoutez une ligne pour une nouvelle marque, ou une famille entière.
   */
  marques: {
    "Luxe & haute couture": [
      ["Louis Vuitton", "louis vuitton", "lv"],
      ["Gucci", "gucci"],
      ["Dior", "dior"],
      ["Chanel", "chanel"],
      ["Hermès", "hermes"],
      ["Prada", "prada"],
      ["Miu Miu", "miu miu", "miumiu"],
      ["Balenciaga", "balenciaga"],
      ["Bottega Veneta", "bottega"],
      ["Saint Laurent", "saint laurent", "yves saint laurent", "ysl"],
      ["Celine", "celine"],
      ["Loewe", "loewe"],
      ["Fendi", "fendi"],
      ["Givenchy", "givenchy"],
      ["Valentino", "valentino"],
      ["Versace", "versace"],
      ["Burberry", "burberry"],
      ["Maison Margiela", "maison margiela", "margiela", "mm6", "mm"],
      ["Alexander McQueen", "alexander mcqueen", "mcqueen"],
      ["Tom Ford", "tom ford"],
      ["Dolce & Gabbana", "dolce & gabbana", "dolce and gabbana", "dolce&gabbana", "dolce", "d&g"],
      ["Armani", "armani", "emporio armani", "giorgio armani"],
      ["Balmain", "balmain"],
      ["Ferragamo", "ferragamo"],
      ["Lanvin", "lanvin"],
      ["Kenzo", "kenzo"],
      ["Moschino", "moschino"],
      ["Jacquemus", "jacquemus"],
      ["Thom Browne", "thom browne"],
      ["The Row", "the row"],
      ["Loro Piana", "loro piana"],
      ["Zegna", "zegna"],
      ["Brunello Cucinelli", "brunello cucinelli", "cucinelli"],
      ["Chloé", "chloe"],
      ["Delvaux", "delvaux"],
      ["Goyard", "goyard"],
      ["Jil Sander", "jil sander"],
      ["Marni", "marni"],
      ["Schiaparelli", "schiaparelli"],
      ["Jean Paul Gaultier", "jean paul gaultier", "gaultier"],
      ["Rick Owens", "rick owens", "rick owen"],
      ["Comme des Garçons", "comme des garcons", "comme des garcon", "cdg"],
      ["Yohji Yamamoto", "yohji yamamoto", "yohji"],
      ["Issey Miyake", "issey miyake"],
      ["Vivienne Westwood", "vivienne westwood", "westwood"],
      ["Moncler", "moncler"],
      ["Louboutin", "louboutin"],
      ["Rimowa", "rimowa"],
      ["Montblanc", "montblanc"],
    ],
    "Créateurs & contemporain": [
      ["Acne Studios", "acne"],
      ["AMI Paris", "ami paris", "ami"],
      ["Aimé Leon Dore", "aime leon dore"],
      ["Casablanca", "casablanca"],
      ["Drôle de Monsieur", "drole de monsieur"],
      ["Ralph Lauren", "ralph lauren", "polo ralph", "polo bear"],
      ["Lacoste", "lacoste", "lacostepolo"],
      ["Tommy Hilfiger", "tommy hilfiger", "tommy hillfiger"],
      ["Calvin Klein", "calvin klein", "ck"],
      ["Hugo Boss", "hugo boss"],
      ["Fred Perry", "fred perry"],
      ["Diesel", "diesel"],
      ["Dsquared2", "dsquared2", "dsquared"],
      ["Coach", "coach"],
      ["MCM", "mcm"],
      ["Marc Jacobs", "marc jacobs"],
      ["Michael Kors", "michael kors"],
      ["Vilebrequin", "vilebrequin"],
      ["Psycho Bunny", "psycho bunny"],
      ["Zimmermann", "zimmermann"],
      ["Aritzia", "aritzia"],
      ["True Religion", "true religion"],
      ["Evisu", "evisu"],
      ["Undercover", "undercover"],
      ["Number (N)ine", "number nine"],
      ["Raf Simons", "raf simons"],
      ["Ksubi", "ksubi"],
      ["Maison Mihara Yasuhiro", "mmy", "maison mihara"],
    ],
    "Streetwear": [
      ["Supreme", "supreme"],
      ["Stüssy", "stussy"],
      ["Bape", "bape"],
      ["Palace", "palace"],
      ["Corteiz", "corteiz", "cortiez", "crtz"],
      ["Trapstar", "trapstar"],
      ["Syna World", "syna"],
      ["Hellstar", "hellstar"],
      ["Sp5der", "sp5der", "spider worldwide"],
      ["Denim Tears", "denim tears"],
      ["Gallery Dept", "gallery dept"],
      ["Chrome Hearts", "chrome heart", "chrome hearts"],
      ["Off-White", "off white", "off-white"],
      ["Amiri", "amiri"],
      ["Rhude", "rhude"],
      ["Represent", "represent"],
      ["Palm Angels", "palm angels", "palm angles"],
      ["Essentials", "essentials", "fear of god"],
      ["Vlone", "vlone"],
      ["Broken Planet", "broken planet"],
      ["Enfants Riches Déprimés", "enfants riches deprimes", "erd"],
      ["Eric Emanuel", "eric emanuel"],
      ["Purple Brand", "purple brand"],
      ["Anti Social Social Club", "anti social", "assc"],
      ["Godspeed", "godspeed"],
      ["Revenge", "revenge"],
      ["Thug Club", "thug club"],
      ["Vetements", "vetements"],
      ["Travis Scott", "travis scott", "cactus jack"],
      ["Kaws", "kaws"],
      ["Billionaire Boys Club", "billionaire boys", "billionair boys", "bbc"],
      ["Carhartt", "carhartt"],
      ["Sprayground", "sprayground"],
      ["Wacko Maria", "wacko maria"],
      ["Mertra", "mertra"],
      ["Arte Antwerp", "arte"],
      ["Paly", "paly"],
      ["Kroen", "kroen"],
      ["Playboi Carti", "playboi carti", "carti"],
      ["Ken Carson", "ken carson"],
    ],
    "Sport & sneakers": [
      ["Nike", "nike", "air force", "af1", "dunk", "vapor", "air max", "vomero", "pegasus", "tn", "cortez"],
      ["Jordan", "jordan"],
      ["Nocta", "nocta"],
      ["Adidas", "adidas", "samba", "gazelle", "campus", "adizero"],
      ["Yeezy", "yeezy"],
      ["New Balance", "new balance"],
      ["Puma", "puma"],
      ["Converse", "converse"],
      ["Vans", "vans"],
      ["Asics", "asics", "asic"],
      ["Salomon", "salomon"],
      ["On", "on sneakers", "on x"],
      ["Hoka", "hoka"],
      ["Saucony", "saucony"],
      ["Under Armour", "under armour"],
      ["Lululemon", "lulu lemon", "lululemon"],
      ["Alo", "alo"],
      ["Gymshark", "gym shark", "gymshark"],
      ["Crocs", "crocs"],
      ["UGG", "ugg"],
      ["Birkenstock", "birkenstock"],
      ["Golden Goose", "golden goose"],
      ["Timberland", "timberland"],
      ["Oakley", "oakley"],
      ["MLB", "mlb"],
    ],
    "Outdoor & doudounes": [
      ["Arc'teryx", "arcteryx", "arc'teryx", "arc’teryx", "arc teryx"],
      ["The North Face", "north face", "tnf"],
      ["Canada Goose", "canada goose"],
      ["Moose Knuckles", "moose knuckle", "moose knuckles"],
      ["Patagonia", "patagonia"],
      ["Stone Island", "stone island"],
      ["CP Company", "cp company", "c.p. company", "c.p company"],
      ["MontBell", "montbell"],
      ["Parajumpers", "parajumpers"],
    ],
    "Horlogerie & joaillerie": [
      ["Rolex", "rolex"],
      ["Audemars Piguet", "audemars piguet", "ap", "royal pop"],
      ["Patek Philippe", "patek philippe", "patek"],
      ["Richard Mille", "richard mille"],
      ["Cartier", "cartier"],
      ["Omega", "omega"],
      ["Tissot", "tissot"],
      ["Longines", "longines"],
      ["Casio", "casio", "g-shock"],
      ["IWC", "iwc"],
      ["Tudor", "tudor"],
      ["Vacheron Constantin", "vacheron constantin", "vacheron"],
      ["Breitling", "breitling"],
      ["Hublot", "hublot"],
      ["Van Cleef & Arpels", "van cleef"],
      ["Bulgari", "bulgari", "bvlgari"],
      ["Tiffany & Co.", "tiffany", "tiffiny"],
      ["Swarovski", "swarovski"],
      ["Pandora", "pandora"],
    ],
    "High-tech": [
      ["Apple", "airpods", "apple"],
    ],
  },

  parPage: 36, // nombre d'images chargées à la fois
};
