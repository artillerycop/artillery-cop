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
    if (!g) map.set(cle, (g = { cle, nom: joli(nom), articles: [] }));
    if (!g.articles.includes(a)) g.articles.push(a);
  }

  function indexer() {
    // Marques : on cherche leurs mots-clés dans le nom de chaque article
    const regles = (CFG.marques || []).map(([nom, ...mots]) => ({
      nom,
      re: new RegExp("(^|[^a-z0-9])(" + mots.map((m) => echapperRegex(normaliser(m))).join("|") + ")(?=[^a-z0-9]|$)"),
    }));
    articles.forEach((a, i) => {
      a.ordre = i;
      const titre = normaliser(a.titre + " " + a.sousTitre);
      a.marques = regles.filter((r) => r.re.test(titre)).map((r) => r.nom);
      a.clesCat = a.categories.map(slug);
      a.clesMarque = a.marques.map(slug);
      a.cleTitre = titre;
      a.recherche = normaliser([a.titre, a.sousTitre, a.description, ...a.categories, ...a.tags, ...a.marques, ...a.extras.map((x) => x.texte)].join(" "));
      a.categories.forEach((c) => ajouterAuGroupe(categories, c, a));
      a.marques.forEach((m) => ajouterAuGroupe(marques, m, a));
      parId.set(a.id, a);
    });
    // Les marques trop rares n'ont pas leur page
    const min = CFG.minArticlesMarque || 1;
    for (const [cle, g] of marques) if (g.articles.length < min) marques.delete(cle);
  }

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
  }

  const lienPartage = (ids) => location.href.split("#")[0].split("?")[0] + "#/selection?ids=" + ids.join(",");

  function texteSelection(liste) {
    const lignes = liste.map((a, i) => {
      const details = [a.sousTitre, a.categories[0] && joli(a.categories[0])].filter(Boolean).join(" — ");
      return `${i + 1}. ${a.titre}${details ? " (" + details + ")" : ""}`;
    });
    return `Ma sélection — ${liste.length} article${liste.length > 1 ? "s" : ""}\n\n${lignes.join("\n")}\n\nVoir les photos : ${lienPartage(liste.map((a) => a.id))}`;
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

  function image(a, classe, eager) {
    return a.image
      ? `<img class="${classe}" src="${echapper(a.image)}" alt="${echapper(a.titre)}" ${eager ? "" : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`
      : `<span class="${classe} sans-image" aria-hidden="true">${initiale(a.titre)}</span>`;
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
  function tuile(a, contexte, retirable) {
    return `<li class="tuile">
      <a class="tuile__lien" href="${hrefFiche(a.id)}" data-fiche="${a.id}" data-contexte="${contexte}">
        <div class="tuile__media">${image(a, "tuile__image")}</div>
        <p class="tuile__titre">${echapper(a.titre)}</p>
        ${a.sousTitre ? `<p class="tuile__sous">${echapper(a.sousTitre)}</p>` : ""}
      </a>
      ${retirable ? `<button type="button" class="retirer" data-sel="${a.id}" aria-label="Retirer de ma sélection : ${echapper(a.titre)}">Retirer</button>` : boutonCoeur(a)}
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
  function carteGroupe(g, prefixe) {
    const n = g.articles.length;
    const img = couverture(g.articles);
    return `<li><a class="groupe" href="#/${prefixe}/${g.cle}">
      ${img ? `<img src="${echapper(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="sans-image" aria-hidden="true">${initiale(g.nom)}</span>`}
      <span class="groupe__texte"><span class="groupe__nom">${echapper(g.nom)}</span><span class="groupe__n">${n} article${n > 1 ? "s" : ""}</span></span>
    </a></li>`;
  }

  function rangee(titre, lien, total, liste, contexte) {
    if (!liste.length) return "";
    listes[contexte] = liste;
    return `<section class="rangee" aria-labelledby="titre-${contexte}">
      <div class="rangee__entete">
        <h2 class="titre-section" id="titre-${contexte}">${titre}</h2>
        ${lien ? `<a class="voir-tout" href="${lien}">Voir tout (${total}) <span aria-hidden="true">→</span></a>` : ""}
      </div>
      <ul class="carrousel">${liste.map((a) => vignette(a, contexte)).join("")}</ul>
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
    else if (vue === "c" || vue === "m" || vue === "tout" || vue === "recherche") titreDoc = pageListe(r);
    else if (vue === "selection") titreDoc = pageSelection(r);
    else titreDoc = pageIntrouvable();
    document.title = [titreDoc, `${CFG.titre || ""} ${CFG.titreAccent || ""}`.trim()].filter(Boolean).join(" — ");

    // Retour arrière : on retrouve la position ; nouvelle page : on remonte en haut
    const memo = restaurer && defilements.get(clePageCourante);
    if (memo && vue !== "") {
      while (etatListe.affiches < Math.min(memo.n, etatListe.resultats.length)) afficherSuite();
    }
    requestAnimationFrame(() => scrollTo(0, memo ? memo.y : 0));
  }

  function pageAccueil() {
    const tous = articles.filter((a) => a.image);
    const une = categories.get(slug(CFG.aLaUne || "")) || null;
    const listeUne = une ? une.articles.filter((a) => a.image) : tous;
    const decouvertes = melangeDuJour(tous.filter((a) => !listeUne.slice(0, 24).includes(a))).slice(0, 24);
    const parTaille = (a, b) => b.articles.length - a.articles.length || collator.compare(a.nom, b.nom);
    const groupesMarques = [...marques.values()].sort(parTaille);
    const groupesCats = [...categories.values()].filter((g) => !une || g.cle !== une.cle).sort((a, b) => collator.compare(a.nom, b.nom));

    page.innerHTML = `
      <section class="hero">
        <h1 class="hero__titre">${echapper(CFG.titre || "")} <em>${echapper(CFG.titreAccent || "")}</em></h1>
        ${CFG.sousTitre ? `<p class="hero__sous">${echapper(CFG.sousTitre)}</p>` : ""}
        <form class="recherche" role="search" data-recherche>
          <label class="visuellement-cache" for="recherche-accueil">Rechercher</label>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="recherche-accueil" name="q" type="search" placeholder="Rechercher parmi ${articles.length.toLocaleString("fr-FR")} articles" autocomplete="off">
        </form>
      </section>
      ${rangee("À la une", une ? `#/c/${une.cle}` : "#/tout", une ? une.articles.length : articles.length, listeUne.slice(0, 24), "une")}
      ${rangee("Découvertes du jour", "#/tout", articles.length, decouvertes, "decouvertes")}
      ${groupesMarques.length ? `<section class="bloc" aria-labelledby="titre-marques"><h2 class="titre-section" id="titre-marques">Marques</h2><ul class="mosaique">${groupesMarques.map((g) => carteGroupe(g, "m")).join("")}</ul></section>` : ""}
      <section class="bloc" aria-labelledby="titre-categories"><h2 class="titre-section" id="titre-categories">Catégories</h2><ul class="mosaique mosaique--categories">${groupesCats.map((g) => carteGroupe(g, "c")).join("")}</ul></section>`;
    return "";
  }

  /** Liste d'articles : catégorie, marque, tout le catalogue ou recherche. */
  function pageListe(r) {
    const [vue, cle] = r.seg;
    let groupe = null;
    let titre = "Tout le catalogue";
    let base = articles;
    let facettes = categories; // pastilles proposées pour affiner
    let prefixeFacette = "c";
    if (vue === "c" || vue === "m") {
      groupe = (vue === "c" ? categories : marques).get(cle);
      if (!groupe) return pageIntrouvable();
      titre = groupe.nom;
      base = groupe.articles;
      facettes = vue === "c" ? marques : categories;
      prefixeFacette = vue === "c" ? "m" : "c";
    } else if (vue === "recherche") titre = "Recherche";

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
    etatListe.resultats = res;
    etatListe.affiches = 0;
    listes.liste = res;
    $("#grille").innerHTML = "";
    afficherSuite();

    $("#compte").textContent = `${res.length.toLocaleString("fr-FR")} article${res.length > 1 ? "s" : ""}`;
    $("#vide").hidden = res.length > 0;
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
    const liste = ids.map((id) => parId.get(id)).filter(Boolean);
    const manquants = ids.length - liste.length;
    listes.selection = liste;
    etatListe.resultats = [];
    etatListe.affiches = 0;
    const n = liste.length;

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
      <ul class="grille grille--selection">${liste.map((a) => tuile(a, "selection", !partagee)).join("")}</ul>`
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
    if (contexte && listes[contexte] && listes[contexte].some((a) => a.id === id)) return listes[contexte];
    for (const nom of ["liste", "selection", "une", "decouvertes"]) if (listes[nom] && listes[nom].some((a) => a.id === id)) return listes[nom];
    const a = parId.get(id);
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
    const a = parId.get(id);
    if (!fiche.el.open || !fiche.liste.some((x) => x.id === id)) fiche.liste = listeDeNavigation(id, fiche.contexte);
    fiche.i = Math.max(0, fiche.liste.findIndex((x) => x.id === id));
    const choisi = estChoisi(id);
    const sim = similaires(a);
    listes.similaires = sim;

    fiche.cadre.innerHTML = image(a, "fiche__image", true);
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
        ${etiquettes.length ? `<p class="etiquettes">${etiquettes.join("")}</p>` : ""}
        <h2 class="fiche__titre" id="fiche-titre">${echapper(a.titre)}</h2>
        ${a.sousTitre ? `<p class="fiche__sous">${echapper(a.sousTitre)}</p>` : ""}
        ${infosSup.length ? `<dl class="fiche__details">${infosSup.map(([k, v]) => `<div><dt>${echapper(k)}</dt><dd>${echapper(v)}</dd></div>`).join("")}</dl>` : ""}
        <div class="fiche__actions">
          <button type="button" class="bouton bouton--plein bouton-choisir${choisi ? " est-choisi" : ""}" data-sel="${a.id}" aria-pressed="${choisi}">${ICONE_COEUR}<span class="libelle">${choisi ? "Dans ma sélection" : "Ajouter à ma sélection"}</span></button>
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
    const choisis = selection.map((id) => parId.get(id)).filter(Boolean);
    switch (action.dataset.action) {
      case "copier":
        copier(texteSelection(choisis), "Liste copiée");
        break;
      case "partager":
        if (navigator.share) {
          navigator.share({ title: "Ma sélection", text: texteSelection(choisis), url: lienPartage(choisis.map((a) => a.id)) }).catch(() => {});
        } else copier(lienPartage(choisis.map((a) => a.id)), "Lien de partage copié");
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

  async function demarrer() {
    // Identité
    $("#barre-titre").textContent = `${CFG.titre || ""} ${CFG.titreAccent || ""}`.trim() || "Catalogue";
    if (CFG.logo) {
      const logo = $("#logo");
      logo.src = urlSure(CFG.logo);
      logo.alt = $("#barre-titre").textContent;
      logo.hidden = false;
      $("#barre-titre").classList.add("visuellement-cache");
    }
    if (CFG.accent) document.documentElement.style.setProperty("--accent", CFG.accent);
    $("#pied-texte").textContent = `${$("#barre-titre").textContent} — catalogue en images. Données issues de Google Sheets.`;

    const demo = CFG.exemple || new URLSearchParams(location.search).get("demo") === "1";
    const sources = demo ? [{ id: "exemple", nom: "Exemple", copie: "exemple" }] : CFG.sources || [];
    const charge = await window.Donnees.charger(sources);
    articles = charge.articles;
    console.groupCollapsed(`[catalogue] ${articles.length} articles — ${charge.infos.join(" · ")}`);
    charge.diagnostic.forEach((d) => console.info(d));
    console.groupEnd();

    indexer();
    remplirMenu();
    majCompteur();
    if (!articles.length) {
      page.innerHTML = `<div class="vide"><p class="vide__titre">Catalogue indisponible</p><p class="vide__texte">Les tableurs n'ont pas pu être chargés. Vérifiez config.js et la console du navigateur.</p></div>`;
      return;
    }
    surRoute();
  }

  demarrer();
})();
