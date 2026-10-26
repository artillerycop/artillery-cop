/*
 * Catalogue v2 — interface « lookbook ».
 * Les données sont lues par donnees.js ; ce fichier gère l'affichage.
 *
 *   1. Index du catalogue : catégories et marques
 *   2. Sélection (articles choisis, gardés dans le navigateur)
 *   3. Navigation par adresse (#/…) : chaque page et chaque fiche a son lien
 *   4. Gabarits HTML (tuiles, cartes, carrousels)
 *   5. Pages : accueil, liste, sélection
 *   6. Fiche article plein écran
 *   7. Menu, notifications, événements, démarrage
 *
 * Adresses :
 *   #/                 accueil
 *   #/c/<categorie>    une catégorie        #/m/<marque>   une marque
 *   #/tout             tout le catalogue    #/recherche?q= une recherche
 *   #/nouveautes       derniers ajouts      #/explorer?t=marques|categories  index A–Z
 *   #/f/<famille>      une famille de marques (Luxe & haute couture…)   #/une  À la une
 *   #/selection        ma sélection         #/selection?ids=a,b  sélection partagée
 *   …?a=<id>           ajoute la fiche d'un article par-dessus la page
 */
(function () {
  "use strict";

  const CFG = window.CONFIG || {};
  const { normaliser, echapper, urlSure, antiRebond } = window.Donnees;
  const $ = (sel, racine = document) => racine.querySelector(sel);
  const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

  /* =====================================================================
   * 1. Index du catalogue
   * ===================================================================== */

  let articles = [];
  const parId = new Map();
  const categories = new Map(); // slug -> { cle, nom, articles }
  const marques = new Map();

  /** Clé d'URL : « HOODIES / ZIP UPS » -> « hoodie-zip-up » (pluriels regroupés). */
  const slug = (s) =>
    normaliser(s)
      .split(" ")
      .map((m) => (m.length > 3 ? m.replace(/s$/, "") : m))
      .join(" ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  /** « HOODIES / ZIP UPS » -> « Hoodies / Zip Ups » : plus doux à lire que des capitales. */
  function joli(s) {
    const t = String(s).trim();
    if (t !== t.toUpperCase()) return t;
    return t.toLowerCase().replace(/(^|[\s/(&-])(\p{L})/gu, (_, p, l) => p + l.toUpperCase());
  }

  const echapperRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function ajouterAuGroupe(map, nom, a) {
    const cle = slug(nom);
    if (!cle) return;
    let g = map.get(cle);
    if (!g) map.set(cle, (g = { cle, nom: joli(nom), nomOrigine: nom, articles: [] }));
    if (!g.articles.includes(a)) g.articles.push(a);
  }

  /** Expression qui trouve l'un des mots (entiers) dans un texte normalisé. */
  const motsEnRegex = (mots) => new RegExp("(^|[^a-z0-9@&])(" + mots.map((m) => echapperRegex(normaliser(m))).join("|") + ")(?=[^a-z0-9]|$)");

  // Marques : config.marques est soit une liste, soit des familles { "Streetwear": [ … ], … }.
  // On cherche leurs mots-clés dans le nom de chaque article ; beaucoup de titres se répètent
  // (albums de la collection), d'où le cache.
  let reglesMarques = null;
  const familleDeMarque = new Map(); // nom de marque -> famille
  const cacheMarques = new Map();
  function detecterMarques(texte) {
    if (cacheMarques.has(texte)) return cacheMarques.get(texte);
    if (!reglesMarques) {
      const familles = Array.isArray(CFG.marques) ? { Marques: CFG.marques } : CFG.marques || {};
      reglesMarques = [];
      for (const [famille, liste] of Object.entries(familles)) {
        for (const [nom, ...mots] of liste) {
          familleDeMarque.set(nom, famille);
          reglesMarques.push({ nom, re: motsEnRegex(mots) });
        }
      }
    }
    const trouvees = reglesMarques.filter((r) => r.re.test(texte)).map((r) => r.nom);
    cacheMarques.set(texte, trouvees);
    return trouvees;
  }

  // Catégories : un seul classement pour toutes les sources (voir config.categories)
  let reglesCategories = null;
  function preparerCategories() {
    reglesCategories = (CFG.categories || []).map((c) => ({
      nom: c.nom,
      retiree: !!c.retiree,
      re: c.mots && c.mots.length ? motsEnRegex(c.mots) : null,
      sources: new Set((c.sources || []).map(normaliser)),
      secours: new Set((c.secours || []).map(normaliser)),
    }));
  }

  /**
   * Classe un article : par les mots de son nom, sinon par sa catégorie d'origine.
   * Les articles de la collection (type fourni par la source) suivent l'ordre inverse.
   * Renvoie { categorie } ou { retire: true }.
   */
  function categoriser(a) {
    if (!reglesCategories) preparerCategories();
    const origines = a.categoriesSource.map(normaliser);
    // Section d'origine d'une catégorie retirée (ex. « OTHER ») : l'article est retiré quoi qu'il arrive
    if (reglesCategories.some((c) => c.retiree && origines.some((o) => c.sources.has(o)))) return { retire: true };
    const parMots = (texte) => (texte ? reglesCategories.find((c) => c.re && c.re.test(texte)) : null);
    const parOrigine = () =>
      reglesCategories.find((c) => origines.some((o) => c.sources.has(o))) || reglesCategories.find((c) => origines.some((o) => c.secours.has(o)));
    const c = a.classementSource ? parOrigine() || parMots(normaliser(a.album || "")) : parMots(normaliser(a.titre + " " + a.sousTitre)) || parOrigine();
    if (!c) return { categorie: null };
    return c.retiree ? { retire: true } : { categorie: c.nom };
  }

  const familles = new Map(); // slug -> { cle, nom, marques: [groupes], articles }
  let nouveautes = []; // articles datés des derniers jours, du plus récent au plus ancien
  let outfits = []; // tenues complètes (album « Outfits »)

  /** (Ré)indexe tout le catalogue : au démarrage, puis quand la collection arrive. */
  function indexer() {
    parId.clear();
    categories.clear();
    marques.clear();
    familles.clear();
    const aLaUne = normaliser(CFG.aLaUne || "");
    const imagesRetirees = new Set(CFG.imagesRetirees || []);
    articles.forEach((a) => {
      if (imagesRetirees.has(a.image) || imagesRetirees.has(a.imageHD)) a.image = a.imageHD = "";
      // Catégories d'origine gardées à part : le classement peut être refait (arrivée de la collection)
      if (!a.categoriesSource) a.categoriesSource = a.categories.slice();
      a.aLaUne = !!aLaUne && a.categoriesSource.some((c) => normaliser(c) === aLaUne);
      const classe = categoriser(a);
      a.retire = !!classe.retire;
      a.categories = classe.categorie ? [classe.categorie] : [];
      const titre = normaliser(a.titre + " " + a.sousTitre);
      // Marque fournie par la source (ramenée au nom de config.js si on le reconnaît), sinon détectée
      // dans le nom ; pour la collection, dans le nom de l'album (sauf album multi-marques)
      const fournies = (a.marquesForcees || []).map((m) => detecterMarques(normaliser(m))[0] || m);
      const detectees = a.album ? (a.albumMulti ? [] : detecterMarques(normaliser(a.album))) : detecterMarques(titre);
      a.marques = [...new Set([...fournies, ...detectees])];
      a.clesCat = a.categories.map(slug);
      a.clesMarque = a.marques.map(slug);
    });
    // Catégories et marques retirées du site (config.js) : leurs articles disparaissent aussi
    const exMarque = new Set((CFG.exclureMarques || []).map(slug));
    const exArticles = new Set((CFG.articlesRetires || []).map(normaliser));
    articles = articles.filter((a) => !a.retire && !a.clesMarque.some((k) => exMarque.has(k)) && !exArticles.has(normaliser(a.titre)));
    articles.forEach((a, i) => {
      a.ordre = i;
      const titre = normaliser(a.titre + " " + a.sousTitre);
      a.cleTitre = titre;
      a.recherche = normaliser(
        [a.titre, a.sousTitre, a.description, ...a.categories, ...a.tags, ...a.marques, ...a.extras.map((x) => x.texte), ...(a.coloris || []).map((c) => c.couleur)].join(" ")
      );
      a.categories.forEach((c) => ajouterAuGroupe(categories, c, a));
      a.marques.forEach((m) => ajouterAuGroupe(marques, m, a));
      parId.set(a.id, a);
      if (a.coloris) for (const c of a.coloris) parId.set(c.id, a);
    });
    // Les marques trop rares n'ont pas leur page
    const min = CFG.minArticlesMarque || 1;
    for (const [cle, g] of marques) if (g.articles.length < min) marques.delete(cle);

    // Familles de marques (Luxe & haute couture, Streetwear…) : regroupent marques et articles
    for (const g of marques.values()) {
      const nomFamille = familleDeMarque.get(g.nomOrigine) || familleDeMarque.get(g.nom);
      if (!nomFamille) continue;
      g.famille = slug(nomFamille);
      let f = familles.get(g.famille);
      if (!f) familles.set(g.famille, (f = { cle: g.famille, nom: nomFamille, marques: [], vus: new Set(), articles: [] }));
      f.marques.push(g);
      for (const a of g.articles) if (!f.vus.has(a)) f.vus.add(a), f.articles.push(a);
    }
    for (const f of familles.values()) {
      f.articles.sort((a, b) => a.ordre - b.ordre);
      f.marques.sort((a, b) => b.articles.length - a.articles.length);
      delete f.vus;
    }

    const dates = articles.filter((a) => a.date && !a.outfit);
    const plusRecente = dates.reduce((max, a) => Math.max(max, +a.date), 0);
    const limite = plusRecente - (CFG.joursNouveautes || 21) * 86400000;
    nouveautes = dates.filter((a) => +a.date >= limite && a.image).sort((a, b) => b.date - a.date || a.ordre - b.ordre);
    outfits = articles.filter((a) => a.outfit && a.image);
  }

  // Accès en lecture depuis la console du navigateur, pour vérifier le classement
  window.__catalogue = { articles: () => articles, categories, marques, familles };

  /** Image représentative d'un groupe : le premier article illustré. */
  const couverture = (liste) => (liste.find((a) => a.image) || {}).image || "";

  /** Mélange stable sur la journée : les « Découvertes » changent chaque jour, pas à chaque clic. */
  function melangeDuJour(liste) {
    const d = new Date();
    let graine = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const alea = () => {
      graine = (graine + 0x6d2b79f5) | 0;
      let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const copie = liste.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(alea() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  /* =====================================================================
   * 2. Sélection : les articles que l'on veut acheter
   * ===================================================================== */

  const CLE_SELECTION = "catalogue-v2:selection";
  let selection = [];
  try {
    selection = JSON.parse(localStorage.getItem(CLE_SELECTION) || "[]").filter((id) => typeof id === "string");
  } catch (e) {
    /* navigation privée : sélection gardée le temps de la visite */
  }
  const estChoisi = (id) => selection.includes(id);

  function enregistrerSelection() {
    try {
      localStorage.setItem(CLE_SELECTION, JSON.stringify(selection));
    } catch (e) {}
  }

  function basculerSelection(id) {
    const a = parId.get(id);
    if (!a) return;
    if (estChoisi(id)) {
      selection = selection.filter((x) => x !== id);
      notifier("Retiré de votre sélection");
    } else {
      selection.push(id);
      notifier("Ajouté à votre sélection");
    }
    enregistrerSelection();
    majBoutonsSelection(id);
    majCompteur();
    // Sur la page « Ma sélection », on redessine en gardant la position
    if (route().seg[0] === "selection" && !route().p.get("ids")) {
      const y = scrollY;
      rendrePage(route(), false);
      requestAnimationFrame(() => scrollTo(0, y));
    }
  }

  function majBoutonsSelection(id) {
    const choisi = estChoisi(id);
    const titre = parId.get(id)?.titre || "";
    document.querySelectorAll(`[data-sel="${id}"]`).forEach((b) => {
      b.classList.toggle("est-choisi", choisi);
      b.setAttribute("aria-pressed", String(choisi));
      if (b.classList.contains("coeur")) b.setAttribute("aria-label", `${choisi ? "Retirer de" : "Ajouter à"} ma sélection : ${titre}`);
      const libelle = b.querySelector(".libelle");
      if (libelle) libelle.textContent = choisi ? "Dans ma sélection" : "Ajouter à ma sélection";
    });
  }

  function majCompteur() {
    const n = selection.filter((id) => parId.has(id)).length;
    const pastille = $("#compteur-selection");
    pastille.textContent = n;
    pastille.hidden = n === 0;
    $("#lien-selection").setAttribute("aria-label", `Ma sélection, ${n} article${n > 1 ? "s" : ""}`);
    const badge = $("#compteur-onglet");
    badge.textContent = n;
    badge.hidden = n === 0;
    $("#onglet-selection").setAttribute("aria-label", `Sélection, ${n} article${n > 1 ? "s" : ""}`);
  }

  const lienPartage = (ids) => location.href.split("#")[0].split("?")[0] + "#/selection?ids=" + ids.join(",");

  function texteSelection(ids) {
    const lignes = ids.map((id, i) => {
      const { a, c } = vueDe(id);
      const details = [c ? c.couleur : a.sousTitre, a.categories[0] && joli(a.categories[0])].filter(Boolean).join(" — ");
      return `${i + 1}. ${a.titre}${details ? " (" + details + ")" : ""}`;
    });
    return `Ma sélection — ${ids.length} article${ids.length > 1 ? "s" : ""}\n\n${lignes.join("\n")}\n\nVoir les photos : ${lienPartage(ids)}`;
  }

  async function copier(texte, message) {
    try {
      await navigator.clipboard.writeText(texte);
    } catch (e) {
      // Repli pour les navigateurs sans presse-papiers asynchrone (ex. file://)
      const zone = document.createElement("textarea");
      zone.value = texte;
      zone.setAttribute("readonly", "");
      zone.style.position = "fixed";
      zone.style.opacity = "0";
      document.body.appendChild(zone);
      zone.select();
      document.execCommand("copy");
      zone.remove();
    }
    notifier(message);
  }

  /* =====================================================================
   * 3. Navigation par adresse (#/…)
   * ===================================================================== */

  function route() {
    const brut = location.hash.replace(/^#/, "") || "/";
    const [chemin, qs = ""] = brut.split("?");
    return { chemin: chemin || "/", seg: chemin.split("/").filter(Boolean).map(decodeURIComponent), p: new URLSearchParams(qs) };
  }

  const hashDe = (chemin, p) => {
    const qs = p ? p.toString() : "";
    return "#" + chemin + (qs ? "?" + qs : "");
  };

  let dernierHash = null;
  let clePageCourante = null;
  let aNavigue = false; // vrai dès qu'on a changé de page dans le site (pour le bouton retour)
  const defilements = new Map(); // position de défilement par page, pour le retour arrière

  /** Change l'adresse (sans recharger) puis met la page à jour. */
  function naviguer(chemin, p, remplacer) {
    const h = hashDe(chemin, p);
    if (remplacer) history.replaceState(null, "", h);
    else history.pushState(null, "", h);
    surRoute();
  }

  /** Met à jour l'adresse sans rien redessiner (filtres tapés dans une liste). */
  function remplacerSilencieusement(r) {
    history.replaceState(null, "", hashDe(r.chemin, r.p));
    dernierHash = location.hash;
    const p = new URLSearchParams(r.p);
    p.delete("a");
    clePageCourante = r.chemin + "?" + p;
  }

  function surRoute() {
    if (location.hash === dernierHash) return;
    if (dernierHash !== null) aNavigue = true;
    dernierHash = location.hash;
    const r = route();
    const idFiche = r.p.get("a");
    const pPage = new URLSearchParams(r.p);
    pPage.delete("a");
    const clePage = r.chemin + "?" + pPage;
    if (clePage !== clePageCourante) {
      if (clePageCourante !== null) defilements.set(clePageCourante, { y: scrollY, n: etatListe.affiches });
      clePageCourante = clePage;
      rendrePage(r, true);
    }
    if (idFiche && parId.has(idFiche)) ouvrirFiche(idFiche);
    else if (fiche.el.open) fiche.el.close();
  }

  /* =====================================================================
   * 4. Gabarits HTML
   * ===================================================================== */

  const ICONE_COEUR =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" stroke="currentColor" stroke-width="1.6"/></svg>';

  const initiale = (t) => echapper((String(t).match(/[A-Za-z0-9À-ÿ]/) || ["·"])[0].toUpperCase());

  function image(a, classe, eager, hd, coloris) {
    const ref = coloris || a;
    const src = hd && ref.imageHD ? ref.imageHD : ref.image;
    const alt = coloris && coloris.couleur ? `${a.titre} — ${coloris.couleur}` : a.titre;
    return src
      ? `<img class="${classe}" src="${echapper(src)}" alt="${echapper(alt)}" ${eager ? "" : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`
      : `<span class="${classe} sans-image" aria-hidden="true">${initiale(a.titre)}</span>`;
  }

  /** Un identifiant peut désigner un coloris précis : renvoie l'article et ce coloris (ou null). */
  function vueDe(id) {
    const a = parId.get(id);
    if (!a) return null;
    const c = a.coloris ? a.coloris.find((x) => x.id === id) || a.coloris[0] : null;
    return { a, c };
  }

  /** Lien vers la fiche, en restant sur la page courante. */
  function hrefFiche(id) {
    const r = route();
    r.p.set("a", id);
    return hashDe(r.chemin, r.p);
  }

  function boutonCoeur(a) {
    const choisi = estChoisi(a.id);
    return `<button type="button" class="coeur${choisi ? " est-choisi" : ""}" data-sel="${a.id}" aria-pressed="${choisi}" aria-label="${choisi ? "Retirer de" : "Ajouter à"} ma sélection : ${echapper(a.titre)}">${ICONE_COEUR}</button>`;
  }

  /** Tuile d'une grille : grande image, nom discret, cœur de sélection. */
  function tuile(a, contexte, retirable, idChoisi) {
    const id = idChoisi || a.id;
    const c = idChoisi && a.coloris ? a.coloris.find((x) => x.id === idChoisi) : null;
    const n = a.coloris ? a.coloris.length : 0;
    const sous = c ? c.couleur || a.sousTitre : a.sousTitre;
    return `<li class="tuile">
      <a class="tuile__lien" href="${hrefFiche(id)}" data-fiche="${id}" data-contexte="${contexte}">
        <div class="tuile__media">${image(a, "tuile__image", false, false, c)}${n > 1 && !c ? `<span class="badge-coloris">${n} coloris</span>` : ""}</div>
        <p class="tuile__titre">${echapper(a.titre)}</p>
        ${sous ? `<p class="tuile__sous">${echapper(sous)}</p>` : ""}
      </a>
      ${retirable ? `<button type="button" class="retirer" data-sel="${id}" aria-label="Retirer de ma sélection : ${echapper(a.titre)}">Retirer</button>` : boutonCoeur(a)}
    </li>`;
  }

  /** Vignette de carrousel (accueil, « Vous aimerez aussi »). */
  function vignette(a, contexte) {
    return `<li class="vignette">
      <a href="${hrefFiche(a.id)}" data-fiche="${a.id}" data-contexte="${contexte}" aria-label="${echapper(a.titre)}">${image(a, "vignette__image")}</a>
      ${boutonCoeur(a)}
    </li>`;
  }

  /** Grande carte d'une catégorie ou d'une marque (image + nom + nombre). */
  function carteGroupe(g, prefixe, legende) {
    const n = g.articles.length;
    const img = couverture(g.articles);
    return `<li><a class="groupe" href="#/${prefixe}/${g.cle}">
      ${img ? `<img src="${echapper(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="sans-image" aria-hidden="true">${initiale(g.nom)}</span>`}
      <span class="groupe__texte"><span class="groupe__nom">${echapper(g.nom)}</span><span class="groupe__n">${legende || `${n.toLocaleString("fr-FR")} article${n > 1 ? "s" : ""}`}</span></span>
    </a></li>`;
  }

  function rangee(titre, lien, total, liste, contexte, haute) {
    if (!liste.length) return "";
    listes[contexte] = liste;
    return `<section class="rangee" aria-labelledby="titre-${contexte}">
      <div class="rangee__entete">
        <h2 class="titre-section" id="titre-${contexte}">${titre}</h2>
        ${lien ? `<a class="voir-tout" href="${lien}">Voir tout (${total}) <span aria-hidden="true">→</span></a>` : ""}
      </div>
      <ul class="carrousel${haute ? " carrousel--haut" : ""}">${liste.map((a) => vignette(a, contexte)).join("")}</ul>
    </section>`;
  }

  /* =====================================================================
   * 5. Pages
   * ===================================================================== */

  const page = $("#page");
  const listes = {}; // listes affichées, pour naviguer d'une fiche à l'autre
  const etatListe = { resultats: [], affiches: 0 };

  function rendrePage(r, restaurer) {
    const vue = r.seg[0] || "";
    let titreDoc = "";
    // Les listes de navigation ne valent que pour la page affichée
    for (const nom of Object.keys(listes)) delete listes[nom];
    if (vue === "") titreDoc = pageAccueil();
    else if (["c", "m", "f", "une", "tout", "recherche", "nouveautes"].includes(vue)) titreDoc = pageListe(r);
    else if (vue === "explorer") titreDoc = pageExplorer(r);
    else if (vue === "selection") titreDoc = pageSelection(r);
    else titreDoc = pageIntrouvable();
    document.title = [titreDoc, CFG.titre || "Catalogue"].filter(Boolean).join(" — ");
    majOnglets(vue);

    // Retour arrière : on retrouve la position ; nouvelle page : on remonte en haut
    const memo = restaurer && defilements.get(clePageCourante);
    if (memo && vue !== "") {
      while (etatListe.affiches < Math.min(memo.n, etatListe.resultats.length)) afficherSuite();
    }
    requestAnimationFrame(() => scrollTo(0, memo ? memo.y : 0));
  }

  function pageAccueil() {
    const tous = articles.filter((a) => a.image);
    const listeUne = articles.filter((a) => a.aLaUne && a.image);
    const decouvertes = melangeDuJour(tous.filter((a) => !a.outfit && !listeUne.slice(0, 24).includes(a))).slice(0, 24);
    const parTaille = (a, b) => b.articles.length - a.articles.length || collator.compare(a.nom, b.nom);
    const n = CFG.cartesAccueil || 12;
    const groupesMarques = [...marques.values()].sort(parTaille);
    const groupesCats = [...categories.values()].filter((g) => g.cle !== "outfit").sort(parTaille);
    const groupesFamilles = [...familles.values()].sort(parTaille);
    const lienExplorer = (t, total) => `<a class="voir-tout" href="#/explorer?t=${t}">Tout voir (${total}) <span aria-hidden="true">→</span></a>`;

    page.innerHTML = `
      <section class="hero">
        ${CFG.logo ? `<img class="hero__logo" src="${echapper(urlSure(CFG.logo))}" alt="" width="120" height="126">` : ""}
        <h1 class="hero__titre">${echapper(CFG.titre || "Catalogue")}</h1>
        ${CFG.sousTitre ? `<p class="hero__sous">${echapper(CFG.sousTitre)}</p>` : ""}
        <form class="recherche" role="search" data-recherche>
          <label class="visuellement-cache" for="recherche-accueil">Rechercher</label>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="recherche-accueil" name="q" type="search" enterkeyhint="search" placeholder="Rechercher parmi ${articles.length.toLocaleString("fr-FR")} articles" autocomplete="off">
        </form>
      </section>
      ${outfits.length ? rangee("Outfits · Inspiration", "#/c/outfit", outfits.length, outfits.slice(0, 20), "outfits", true) : ""}
      ${rangee("Nouveautés", "#/nouveautes", nouveautes.length, nouveautes.slice(0, 24), "nouveautes")}
      ${rangee("À la une", "#/une", listeUne.length, listeUne.slice(0, 24), "une")}
      ${rangee("Découvertes du jour", "#/tout", articles.length, decouvertes, "decouvertes")}
      ${
        groupesFamilles.length
          ? `<section class="bloc" aria-labelledby="titre-univers"><h2 class="titre-section" id="titre-univers">Univers</h2>
             <ul class="mosaique mosaique--univers">${groupesFamilles.map((f) => carteGroupe(f, "f", `${f.marques.length} marques · ${f.articles.length.toLocaleString("fr-FR")} articles`)).join("")}</ul></section>`
          : ""
      }
      ${
        groupesMarques.length
          ? `<section class="bloc" aria-labelledby="titre-marques"><div class="rangee__entete"><h2 class="titre-section" id="titre-marques">Marques</h2>${lienExplorer("marques", groupesMarques.length)}</div>
             <ul class="mosaique">${groupesMarques.slice(0, n).map((g) => carteGroupe(g, "m")).join("")}</ul></section>`
          : ""
      }
      <section class="bloc" aria-labelledby="titre-categories"><div class="rangee__entete"><h2 class="titre-section" id="titre-categories">Catégories</h2>${lienExplorer("categories", groupesCats.length)}</div>
        <ul class="mosaique mosaique--categories">${groupesCats.slice(0, n).map((g) => carteGroupe(g, "c")).join("")}</ul></section>`;
    return "";
  }

  /** Index A–Z des marques et des catégories : la navigation principale sur téléphone. */
  function pageExplorer(r) {
    const t = r.p.get("t") === "categories" ? "categories" : "marques";
    const groupes = [...(t === "marques" ? marques : categories).values()].sort((a, b) => collator.compare(a.nom, b.nom));
    const prefixe = t === "marques" ? "m" : "c";
    const ligne = (g, p) => {
      const img = couverture(g.articles);
      return `<li data-nom="${echapper(normaliser(g.nom))}"><a href="#/${p}/${g.cle}">
            <span class="index__image">${img ? `<img src="${echapper(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : initiale(g.nom)}</span>
            <span class="index__nom">${echapper(g.nom)}</span><span class="index__n">${g.articles.length.toLocaleString("fr-FR")}</span>
            <span class="index__fleche" aria-hidden="true">›</span></a></li>`;
    };
    // Marques : une section par famille, ouverte par sa propre page (#/f/…) ; le reste à la fin
    const parFamille = [...familles.values()].sort((a, b) => b.articles.length - a.articles.length);
    const sansFamille = groupes.filter((g) => !g.famille);
    const listeMarques = parFamille
      .map(
        (f) => `<section class="index-famille" data-famille>
          <h2 class="index-famille__titre"><a href="#/f/${f.cle}">${echapper(f.nom)} <span>${f.marques.length} marques · tout voir ›</span></a></h2>
          <ul class="index">${f.marques.slice().sort((a, b) => collator.compare(a.nom, b.nom)).map((g) => ligne(g, "m")).join("")}</ul>
        </section>`
      )
      .join("") + (sansFamille.length ? `<section class="index-famille" data-famille><h2 class="index-famille__titre">Autres marques</h2><ul class="index">${sansFamille.map((g) => ligne(g, "m")).join("")}</ul></section>` : "");
    page.innerHTML = `
      <div class="entete-liste"><div><h1 class="entete-liste__titre">Explorer</h1></div></div>
      <div class="segments" role="tablist" aria-label="Type de liste">
        <a role="tab" href="#/explorer?t=marques" aria-selected="${t === "marques"}" class="segment${t === "marques" ? " est-actif" : ""}">Marques <span>${marques.size}</span></a>
        <a role="tab" href="#/explorer?t=categories" aria-selected="${t === "categories"}" class="segment${t === "categories" ? " est-actif" : ""}">Catégories <span>${categories.size}</span></a>
      </div>
      <form class="recherche recherche--compacte recherche--pleine" role="search" data-filtre>
        <label class="visuellement-cache" for="filtre-index">Filtrer la liste</label>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <input id="filtre-index" type="search" placeholder="${t === "marques" ? "Une marque…" : "Une catégorie…"}" autocomplete="off">
      </form>
      <div id="index">${t === "marques" ? listeMarques : `<ul class="index">${groupes.map((g) => ligne(g, prefixe)).join("")}</ul>`}</div>`;
    return "Explorer";
  }

  /** Liste d'articles : catégorie, marque, tout le catalogue ou recherche. */
  function pageListe(r) {
    const [vue, cle] = r.seg;
    let groupe = null;
    let titre = "Tout le catalogue";
    let base = articles;
    let facettes = categories; // pastilles proposées pour affiner
    let prefixeFacette = "c";
    if (vue === "c" || vue === "m" || vue === "f") {
      groupe = (vue === "c" ? categories : vue === "m" ? marques : familles).get(cle);
      if (!groupe) return pageIntrouvable();
      titre = groupe.nom;
      base = groupe.articles;
      // Catégorie ou famille : on affine par marque ; marque : par catégorie
      facettes = vue === "m" ? categories : marques;
      prefixeFacette = vue === "m" ? "c" : "m";
    } else if (vue === "une") {
      titre = "À la une";
      base = articles.filter((a) => a.aLaUne);
    } else if (vue === "recherche") titre = "Recherche";
    else if (vue === "nouveautes") {
      titre = "Nouveautés";
      base = nouveautes;
    }

    // Pastilles : les catégories (ou marques) présentes dans cette liste
    const compte = new Map();
    for (const a of base) for (const k of prefixeFacette === "c" ? a.clesCat : a.clesMarque) compte.set(k, (compte.get(k) || 0) + 1);
    const pastilles = [...compte.entries()]
      .filter(([k]) => facettes.has(k) && k !== cle)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);

    page.innerHTML = `
      <div class="entete-liste">
        <a class="retour" href="#/" data-retour aria-label="Retour"><span aria-hidden="true">←</span></a>
        <div>
          <h1 class="entete-liste__titre">${echapper(titre)}</h1>
          <p class="entete-liste__compte" id="compte" aria-live="polite"></p>
        </div>
      </div>
      <div class="outils">
        <form class="recherche recherche--compacte" role="search" data-filtre>
          <label class="visuellement-cache" for="filtre-texte">${vue === "recherche" ? "Rechercher" : "Rechercher dans cette liste"}</label>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="filtre-texte" type="search" placeholder="${vue === "recherche" ? "Nom, marque, catégorie…" : "Affiner…"}" value="${echapper(r.p.get("q") || "")}" autocomplete="off">
        </form>
        <label class="visuellement-cache" for="tri">Trier</label>
        <select id="tri" class="selection-tri">
          <option value="">Pertinence</option>
          <option value="az">Nom, A → Z</option>
          <option value="za">Nom, Z → A</option>
        </select>
      </div>
      ${
        pastilles.length
          ? `<div class="pastilles" role="group" aria-label="Affiner par ${prefixeFacette === "c" ? "catégorie" : "marque"}">
        <button type="button" class="pastille-filtre" data-facette="" aria-pressed="false">Tout</button>
        ${pastilles.map(([k, n]) => `<button type="button" class="pastille-filtre" data-facette="${k}" aria-pressed="false">${echapper(facettes.get(k).nom)} <span>${n}</span></button>`).join("")}
      </div>`
          : ""
      }
      ${
        vue === "recherche"
          ? `<div class="suggestions" id="suggestions" hidden>
        <p class="suggestions__titre">Marques populaires</p>
        <div class="suggestions__liste">${[...marques.values()].sort((a, b) => b.articles.length - a.articles.length).slice(0, 16).map((g) => `<a class="pastille-filtre" href="#/m/${g.cle}">${echapper(g.nom)}</a>`).join("")}</div>
        <p class="suggestions__titre">Catégories</p>
        <div class="suggestions__liste">${[...categories.values()].sort((a, b) => b.articles.length - a.articles.length).slice(0, 16).map((g) => `<a class="pastille-filtre" href="#/c/${g.cle}">${echapper(g.nom)}</a>`).join("")}</div>
      </div>`
          : ""
      }
      <ul class="grille" id="grille"></ul>
      <div class="vide" id="vide" hidden>
        <p class="vide__titre">Aucun résultat</p>
        <p class="vide__texte" id="vide-texte"></p>
        <a class="bouton bouton--plein" href="#/tout">Voir tout le catalogue</a>
      </div>
      <div class="suite" id="suite"><button class="bouton bouton--contour" id="plus" type="button" hidden>Afficher plus</button></div>`;

    page.dataset.base = vue;
    etatListe.base = base;
    etatListe.prefixeFacette = prefixeFacette;
    $("#tri").value = r.p.get("tri") || "";
    majListe();
    observerSuite();
    if (vue === "recherche" && !r.p.get("q")) $("#filtre-texte").focus();
    return titre;
  }

  /** Filtre, trie et redessine la grille d'une liste selon l'adresse. */
  function majListe() {
    const r = route();
    const q = normaliser(r.p.get("q") || "");
    const f = r.p.get("f") || "";
    const tri = r.p.get("tri") || "";
    const jetons = q.split(" ").filter(Boolean);
    let res = etatListe.base.filter(
      (a) => (!jetons.length || jetons.every((j) => a.recherche.includes(j))) && (!f || (etatListe.prefixeFacette === "c" ? a.clesCat : a.clesMarque).includes(f))
    );
    if (tri === "az") res = res.slice().sort((a, b) => collator.compare(a.titre, b.titre));
    else if (tri === "za") res = res.slice().sort((a, b) => collator.compare(b.titre, a.titre));
    else if (q) {
      const score = (a) => (a.cleTitre.startsWith(q) ? 0 : a.cleTitre.includes(q) ? 1 : 2);
      res = res.slice().sort((a, b) => score(a) - score(b) || a.ordre - b.ordre);
    }
    // Page de recherche vide : on propose des marques et catégories plutôt que tout le catalogue
    const suggestions = $("#suggestions");
    if (suggestions) {
      suggestions.hidden = !!q;
      if (!q) res = [];
    }
    etatListe.resultats = res;
    etatListe.affiches = 0;
    listes.liste = res;
    $("#grille").innerHTML = "";
    afficherSuite();

    $("#compte").textContent = suggestions && !q ? "" : `${res.length.toLocaleString("fr-FR")} article${res.length > 1 ? "s" : ""}`;
    $("#vide").hidden = res.length > 0 || (suggestions && !q);
    if (!res.length) $("#vide-texte").textContent = q ? `Rien ne correspond à « ${r.p.get("q")} ».` : "Aucun article dans cette sélection de filtres.";
    document.querySelectorAll("[data-facette]").forEach((b) => {
      const actif = b.dataset.facette === f;
      b.setAttribute("aria-pressed", String(actif));
      b.classList.toggle("est-actif", actif);
    });
  }

  function afficherSuite() {
    const grille = $("#grille");
    if (!grille) return;
    const pas = Math.max(12, CFG.parPage || 36);
    const morceau = etatListe.resultats.slice(etatListe.affiches, etatListe.affiches + pas);
    grille.insertAdjacentHTML("beforeend", morceau.map((a) => tuile(a, "liste")).join(""));
    etatListe.affiches += morceau.length;
    const plus = $("#plus");
    if (plus) plus.hidden = etatListe.affiches >= etatListe.resultats.length;
  }

  // Chargement progressif : la suite arrive à l'approche du bas de page
  let observateur = null;
  function observerSuite() {
    if (!("IntersectionObserver" in window)) return;
    if (observateur) observateur.disconnect();
    observateur = new IntersectionObserver(
      (entrees) => {
        if (!entrees[0].isIntersecting || etatListe.affiches >= etatListe.resultats.length) return;
        afficherSuite();
        // Ré-observer force une nouvelle vérification sur les grands écrans
        observateur.unobserve(entrees[0].target);
        observateur.observe(entrees[0].target);
      },
      { rootMargin: "900px" }
    );
    observateur.observe($("#suite"));
  }

  function pageSelection(r) {
    const partagee = r.p.get("ids");
    const ids = partagee ? partagee.split(",").filter(Boolean) : selection;
    const vus = ids.filter((id) => parId.has(id));
    const liste = [...new Set(vus.map((id) => parId.get(id)))];
    const manquants = ids.length - vus.length;
    listes.selection = liste;
    etatListe.resultats = [];
    etatListe.affiches = 0;
    const n = vus.length;

    page.innerHTML = `
      <div class="entete-liste">
        <a class="retour" href="#/" data-retour aria-label="Retour"><span aria-hidden="true">←</span></a>
        <div>
          <h1 class="entete-liste__titre">${partagee ? "Sélection <em>partagée</em>" : "Ma <em>sélection</em>"}</h1>
          <p class="entete-liste__compte">${n} article${n > 1 ? "s" : ""}${manquants ? ` · ${manquants} introuvable${manquants > 1 ? "s" : ""} (retiré${manquants > 1 ? "s" : ""} du catalogue)` : ""}</p>
        </div>
      </div>
      ${
        n
          ? `<div class="actions-selection">
        ${
          partagee
            ? `<button type="button" class="bouton bouton--plein" data-action="tout-ajouter">Ajouter à ma sélection</button>
               <a class="bouton bouton--contour" href="#/selection">Voir ma sélection</a>`
            : `<button type="button" class="bouton bouton--plein" data-action="partager">Partager</button>
               <button type="button" class="bouton bouton--contour" data-action="copier">Copier la liste</button>
               <button type="button" class="bouton bouton--discret" data-action="vider">Vider</button>`
        }
      </div>
      <ul class="grille grille--selection">${vus.map((id) => tuile(parId.get(id), "selection", !partagee, id)).join("")}</ul>`
          : `<div class="vide">
        <p class="vide__titre">${partagee ? "Sélection introuvable" : "Votre sélection est vide"}</p>
        <p class="vide__texte">${partagee ? "Ces articles ne sont plus dans le catalogue." : "Touchez le cœur d'un article pour l'ajouter ici, puis partagez la liste de ce que vous voulez acheter."}</p>
        <a class="bouton bouton--plein" href="#/">Parcourir le catalogue</a>
      </div>`
      }`;
    return partagee ? "Sélection partagée" : "Ma sélection";
  }

  function pageIntrouvable() {
    page.innerHTML = `<div class="vide"><p class="vide__titre">Page introuvable</p><p class="vide__texte">Ce lien ne correspond à aucune page du catalogue.</p><a class="bouton bouton--plein" href="#/">Retour à l'accueil</a></div>`;
    return "Page introuvable";
  }

  /* =====================================================================
   * 6. Fiche article plein écran
   * ===================================================================== */

  const fiche = {
    el: $("#fiche"),
    cadre: $("#fiche-cadre"),
    infos: $("#fiche-infos"),
    liste: [],
    i: 0,
    contexte: "",
  };

  /** Liste dans laquelle on navigue avec ← → : celle d'où l'on vient, sinon la catégorie. */
  function listeDeNavigation(id, contexte) {
    const a = parId.get(id);
    if (contexte && listes[contexte] && listes[contexte].includes(a)) return listes[contexte];
    for (const nom of ["liste", "selection", "outfits", "nouveautes", "une", "decouvertes"]) if (listes[nom] && listes[nom].includes(a)) return listes[nom];
    return (a.clesCat[0] && categories.get(a.clesCat[0])?.articles) || [a];
  }

  function similaires(a) {
    const memeMarque = a.clesMarque[0] ? marques.get(a.clesMarque[0])?.articles || [] : [];
    const memeCat = a.clesCat[0] ? categories.get(a.clesCat[0])?.articles || [] : [];
    // On mélange marque et catégorie, sans doublon et avec image
    const vus = new Set([a.id]);
    const sortie = [];
    for (const b of [...memeMarque.slice(0, 40), ...memeCat.slice(0, 80)]) {
      if (b.image && !vus.has(b.id)) {
        vus.add(b.id);
        sortie.push(b);
      }
    }
    return melangeDuJour(sortie).slice(0, 14);
  }

  function ouvrirFiche(id) {
    const { a, c } = vueDe(id);
    if (!fiche.el.open || !fiche.liste.includes(a)) fiche.liste = listeDeNavigation(id, fiche.contexte);
    fiche.i = Math.max(0, fiche.liste.indexOf(a));
    // La sélection retient le coloris affiché
    const idSel = c ? c.id : a.id;
    const choisi = estChoisi(idSel);
    const sim = similaires(a);
    listes.similaires = sim;

    fiche.cadre.innerHTML = image(a, "fiche__image", true, true, c);
    fiche.cadre.classList.remove("est-zoome");
    $("#fiche-position").textContent = fiche.liste.length > 1 ? `${fiche.i + 1} / ${fiche.liste.length}` : "";
    $("#fiche-prec").hidden = $("#fiche-suiv").hidden = fiche.liste.length < 2;

    const etiquettes = [
      ...a.clesCat.filter((k) => categories.has(k)).map((k) => `<a class="etiquette" href="#/c/${k}">${echapper(categories.get(k).nom)}</a>`),
      ...a.clesMarque.filter((k) => marques.has(k)).map((k) => `<a class="etiquette etiquette--marque" href="#/m/${k}">${echapper(marques.get(k).nom)}</a>`),
    ];
    const infosSup = [...(a.description ? [["Description", a.description]] : []), ...a.extras.map((x) => [joli(x.libelle), x.texte])];

    fiche.infos.innerHTML = `
      <div class="fiche__texte">
        ${
          a.coloris && a.coloris.length > 1
            ? `<div class="coloris coloris--haut" role="group" aria-label="Coloris">
          <p class="coloris__titre">Coloris : <span>${echapper(c.couleur || `n° ${a.coloris.indexOf(c) + 1}`)}</span></p>
          <div class="coloris__liste">${a.coloris
            .map(
              (x, i) => `<a class="coloris__item${x === c ? " est-actif" : ""}" href="${hrefFiche(x.id)}" data-coloris="${x.id}" aria-label="${echapper(x.couleur || `Coloris ${i + 1}`)}"${x === c ? ' aria-current="true"' : ""}>
                <img src="${echapper(x.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
            )
            .join("")}</div>
        </div>`
            : ""
        }
        ${etiquettes.length ? `<p class="etiquettes">${etiquettes.join("")}</p>` : ""}
        <h2 class="fiche__titre" id="fiche-titre">${echapper(a.titre)}</h2>
        ${a.sousTitre ? `<p class="fiche__sous">${echapper(a.sousTitre)}</p>` : ""}
        ${infosSup.length ? `<dl class="fiche__details">${infosSup.map(([k, v]) => `<div><dt>${echapper(k)}</dt><dd>${echapper(v)}</dd></div>`).join("")}</dl>` : ""}
        <div class="fiche__actions">
          <button type="button" class="bouton bouton--plein bouton-choisir${choisi ? " est-choisi" : ""}" data-sel="${idSel}" aria-pressed="${choisi}">${ICONE_COEUR}<span class="libelle">${choisi ? "Dans ma sélection" : "Ajouter à ma sélection"}</span></button>
          <button type="button" class="bouton bouton--contour" data-action="copier-lien">Copier le lien</button>
        </div>
      </div>
      ${
        sim.length
          ? `<section class="fiche__similaires" aria-labelledby="titre-similaires">
        <h3 class="titre-section titre-section--petit" id="titre-similaires">Vous aimerez aussi</h3>
        <ul class="carrousel carrousel--petit">${sim.map((b) => vignette(b, "similaires")).join("")}</ul>
      </section>`
          : ""
      }`;

    if (!fiche.el.open) {
      fiche.el.showModal();
      document.body.classList.add("sans-defilement");
      $("#fiche-fermer").focus();
    }
    fiche.infos.scrollTop = 0;
    fiche.el.scrollTop = 0;
  }

  /** Ferme la fiche : retour arrière si on l'avait ouverte depuis le site, sinon simple nettoyage de l'adresse. */
  function fermerFiche() {
    const r = route();
    if (!r.p.get("a")) return fiche.el.open && fiche.el.close();
    if (fiche.empilee) history.back();
    else {
      r.p.delete("a");
      naviguer(r.chemin, r.p, true);
    }
  }

  function ficheVoisine(pas) {
    if (fiche.liste.length < 2) return;
    const i = (fiche.i + pas + fiche.liste.length) % fiche.liste.length;
    const r = route();
    r.p.set("a", fiche.liste[i].id);
    naviguer(r.chemin, r.p, true); // pas d'entrée d'historique à chaque flèche
  }

  fiche.el.addEventListener("close", () => {
    document.body.classList.remove("sans-defilement");
    fiche.empilee = false;
    fiche.contexte = "";
    // Fermée par Échap : on nettoie l'adresse
    if (route().p.get("a")) {
      const r = route();
      r.p.delete("a");
      history.replaceState(null, "", hashDe(r.chemin, r.p));
      dernierHash = location.hash;
    }
  });
  // Échap : même chemin que le bouton fermer, pour garder un historique propre
  fiche.el.addEventListener("cancel", (e) => {
    e.preventDefault();
    fermerFiche();
  });
  $("#fiche-fermer").addEventListener("click", fermerFiche);
  $("#fiche-prec").addEventListener("click", () => ficheVoisine(-1));
  $("#fiche-suiv").addEventListener("click", () => ficheVoisine(1));
  fiche.el.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowLeft") ficheVoisine(-1);
    if (e.key === "ArrowRight") ficheVoisine(1);
  });
  fiche.cadre.addEventListener("click", (e) => {
    const img = fiche.cadre.querySelector("img");
    if (!img) return;
    const r = img.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    fiche.cadre.classList.toggle("est-zoome");
  });
  // Swipe gauche / droite sur l'image
  let toucheX = null;
  fiche.cadre.addEventListener("touchstart", (e) => (toucheX = e.touches.length === 1 ? e.touches[0].clientX : null), { passive: true });
  fiche.cadre.addEventListener("touchend", (e) => {
    if (toucheX == null || fiche.cadre.classList.contains("est-zoome")) return;
    const dx = e.changedTouches[0].clientX - toucheX;
    if (Math.abs(dx) > 50) ficheVoisine(dx < 0 ? 1 : -1);
    toucheX = null;
  });

  /* =====================================================================
   * 7. Menu, notifications, événements, démarrage
   * ===================================================================== */

  const menu = $("#menu");
  const voile = $("#voile");
  function basculerMenu(ouvert) {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.toggle("est-ouvert", ouvert));
    voile.hidden = !ouvert;
    $("#ouvrir-menu").setAttribute("aria-expanded", String(ouvert));
    document.body.classList.toggle("sans-defilement", ouvert);
    if (ouvert) menu.querySelector("a").focus({ preventScroll: true });
    else {
      $("#ouvrir-menu").focus({ preventScroll: true });
      setTimeout(() => !menu.classList.contains("est-ouvert") && (menu.hidden = true), 500);
    }
  }
  $("#ouvrir-menu").addEventListener("click", () => basculerMenu(true));
  $("#fermer-menu").addEventListener("click", () => basculerMenu(false));
  voile.addEventListener("click", () => basculerMenu(false));
  menu.addEventListener("click", (e) => e.target.closest("a") && basculerMenu(false));

  function remplirMenu() {
    const lien = (g, p) => `<li><a href="#/${p}/${g.cle}">${echapper(g.nom)} <span>${g.articles.length}</span></a></li>`;
    $("#menu-categories").innerHTML = [...categories.values()].sort((a, b) => collator.compare(a.nom, b.nom)).map((g) => lien(g, "c")).join("");
    $("#menu-marques").innerHTML = [...marques.values()].sort((a, b) => collator.compare(a.nom, b.nom)).map((g) => lien(g, "m")).join("");
  }

  /** Met en avant l'onglet de la page courante (barre du bas sur téléphone). */
  function majOnglets(vue) {
    const actif = vue === "" ? "accueil" : ["explorer", "c", "m", "f", "une", "tout", "nouveautes"].includes(vue) ? "explorer" : vue === "recherche" ? "recherche" : vue === "selection" ? "selection" : "";
    document.querySelectorAll("[data-onglet]").forEach((o) => {
      if (o.dataset.onglet === actif) o.setAttribute("aria-current", "page");
      else o.removeAttribute("aria-current");
    });
  }

  let minuterieToast;
  function notifier(message) {
    const t = $("#toast");
    t.textContent = message;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("est-visible"));
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => {
      t.classList.remove("est-visible");
      setTimeout(() => (t.hidden = true), 400);
    }, 2200);
  }

  // Clics : sélection, ouverture de fiche, actions, pastilles, retour
  document.addEventListener("click", (e) => {
    const sel = e.target.closest("[data-sel]");
    if (sel) {
      e.preventDefault();
      basculerSelection(sel.dataset.sel);
      return;
    }
    const lienFiche = e.target.closest("[data-fiche]");
    if (lienFiche && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      const dejaOuverte = fiche.el.open;
      fiche.contexte = lienFiche.dataset.contexte;
      if (dejaOuverte) fiche.liste = listes[fiche.contexte] || fiche.liste;
      else fiche.empilee = true;
      const r = route();
      r.p.set("a", lienFiche.dataset.fiche);
      naviguer(r.chemin, r.p, dejaOuverte); // depuis une fiche : on remplace, sinon on empile
      return;
    }
    const coloris = e.target.closest("[data-coloris]");
    if (coloris && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const r = route();
      r.p.set("a", coloris.dataset.coloris);
      naviguer(r.chemin, r.p, true);
      return;
    }
    const facette = e.target.closest("[data-facette]");
    if (facette) {
      const r = route();
      const actuelle = r.p.get("f") || "";
      if (facette.dataset.facette && facette.dataset.facette !== actuelle) r.p.set("f", facette.dataset.facette);
      else r.p.delete("f");
      remplacerSilencieusement(r);
      majListe();
      return;
    }
    const retour = e.target.closest("[data-retour]");
    if (retour && aNavigue) {
      e.preventDefault();
      history.back();
      return;
    }
    const action = e.target.closest("[data-action]");
    if (!action) return;
    const choisis = selection.filter((id) => parId.has(id));
    switch (action.dataset.action) {
      case "copier":
        copier(texteSelection(choisis), "Liste copiée");
        break;
      case "partager":
        if (navigator.share) {
          navigator.share({ title: "Ma sélection", text: texteSelection(choisis), url: lienPartage(choisis) }).catch(() => {});
        } else copier(lienPartage(choisis), "Lien de partage copié");
        break;
      case "vider":
        if (confirm("Vider votre sélection ?")) {
          selection = [];
          enregistrerSelection();
          majCompteur();
          rendrePage(route(), false);
        }
        break;
      case "tout-ajouter": {
        const ids = (route().p.get("ids") || "").split(",").filter((id) => parId.has(id) && !estChoisi(id));
        selection.push(...ids);
        enregistrerSelection();
        majCompteur();
        notifier(ids.length ? `${ids.length} article${ids.length > 1 ? "s" : ""} ajouté${ids.length > 1 ? "s" : ""}` : "Déjà dans votre sélection");
        break;
      }
      case "copier-lien":
        copier(location.href, "Lien copié");
        break;
    }
  });

  // Recherche depuis l'accueil, et filtre texte dans une liste
  document.addEventListener("submit", (e) => {
    const f = e.target;
    e.preventDefault();
    if (f.matches("[data-recherche]")) {
      const q = f.q.value.trim();
      naviguer("/recherche", new URLSearchParams(q ? { q } : {}));
    } else f.querySelector("input").blur();
  });
  const filtrerTexte = antiRebond((valeur) => {
    const r = route();
    if (valeur.trim()) r.p.set("q", valeur);
    else r.p.delete("q");
    remplacerSilencieusement(r);
    majListe();
  }, 140);
  document.addEventListener("input", (e) => {
    if (e.target.id === "filtre-texte") filtrerTexte(e.target.value);
    if (e.target.id === "filtre-index") {
      const q = normaliser(e.target.value);
      document.querySelectorAll("#index li").forEach((li) => (li.hidden = !!q && !li.dataset.nom.includes(q)));
      document.querySelectorAll("#index [data-famille]").forEach((f) => (f.hidden = !f.querySelector("li:not([hidden])")));
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id !== "tri") return;
    const r = route();
    if (e.target.value) r.p.set("tri", e.target.value);
    else r.p.delete("tri");
    remplacerSilencieusement(r);
    majListe();
  });
  document.addEventListener("click", (e) => e.target.id === "plus" && afficherSuite());

  // Image introuvable : on affiche l'initiale à la place
  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (img.tagName !== "IMG" || img.id === "logo") return;
      const span = document.createElement("span");
      span.className = img.className + " sans-image";
      span.setAttribute("aria-hidden", "true");
      span.textContent = initiale(img.alt || "·");
      img.replaceWith(span);
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("est-ouvert")) basculerMenu(false);
  });
  window.addEventListener("popstate", surRoute);
  window.addEventListener("hashchange", surRoute);

  /** Après l'arrivée de nouveaux articles : on redessine la page sans perdre sa place. */
  function rafraichir() {
    indexer();
    remplirMenu();
    majCompteur();
    const r = route();
    const champ = document.activeElement && document.activeElement.matches("input") ? document.activeElement : null;
    if (champ && champ.id === "filtre-texte") {
      // L'utilisateur tape dans une liste : on garde le champ, on met juste la liste à jour
      const [vue, cle] = r.seg;
      etatListe.base =
        vue === "c" ? categories.get(cle)?.articles || []
        : vue === "m" ? marques.get(cle)?.articles || []
        : vue === "f" ? familles.get(cle)?.articles || []
        : vue === "une" ? articles.filter((a) => a.aLaUne)
        : vue === "nouveautes" ? nouveautes
        : articles;
      majListe();
    } else if (!champ) {
      const y = scrollY;
      rendrePage(r, false);
      requestAnimationFrame(() => scrollTo(0, y));
    }
    const id = r.p.get("a");
    if (id && parId.has(id) && !fiche.el.open) ouvrirFiche(id);
  }

  async function demarrer() {
    // Identité : logo dans la barre, nom en texte pour les lecteurs d'écran
    $("#barre-titre").textContent = CFG.titre || "Catalogue";
    if (CFG.logo) {
      const logo = $("#logo");
      logo.src = urlSure(CFG.logo);
      logo.hidden = false;
    }
    if (CFG.accent) document.documentElement.style.setProperty("--accent", CFG.accent);
    $("#pied-texte").textContent = `${CFG.titre || "Catalogue"} — catalogue en images.`;

    const demo = CFG.exemple || new URLSearchParams(location.search).get("demo") === "1";
    const sources = demo ? [{ id: "exemple", nom: "Exemple", copie: "exemple" }] : CFG.sources || [];
    const immediates = sources.filter((s) => !s.arrierePlan);
    const differees = sources.filter((s) => s.arrierePlan);

    const charge = await window.Donnees.charger(immediates);
    articles = charge.articles;
    console.groupCollapsed(`[catalogue] ${articles.length} articles — ${charge.infos.join(" · ")}`);
    charge.diagnostic.forEach((d) => console.info(d));
    console.groupEnd();

    indexer();
    remplirMenu();
    majCompteur();
    if (articles.length || !differees.length) {
      if (!articles.length) {
        page.innerHTML = `<div class="vide"><p class="vide__titre">Catalogue indisponible</p><p class="vide__texte">Les données n'ont pas pu être chargées. Vérifiez config.js et la console du navigateur.</p></div>`;
        return;
      }
      surRoute();
    }

    // Gros catalogue : chargé ensuite, sans bloquer le premier affichage
    if (differees.length) {
      document.body.classList.add("chargement-suite");
      const suite = await window.Donnees.charger(differees);
      document.body.classList.remove("chargement-suite");
      console.info(`[catalogue] +${suite.articles.length} articles — ${suite.infos.join(" · ")}`);
      if (!suite.articles.length) return;
      articles = articles.concat(suite.articles);
      if (dernierHash === null) {
        indexer();
        remplirMenu();
        majCompteur();
        surRoute();
      } else rafraichir();
    }
  }

  demarrer();
})();
