/*
 * Données du catalogue : lecture et analyse des tableurs.
 * (Repris de la v1 ; l'interface est dans app.js.)
 *
 *   1. Utilitaires
 *   2. Lecture CSV
 *   3. Lecture XLSX (sans bibliothèque)
 *   4. Analyse du tableur : en-têtes, colonnes, catégories, doublons
 *   5. Chargement des sources (en direct, sinon copie locale data/<id>.js)
 *
 * Cette version n'expose ni prix, ni photos QC, ni liens d'achat :
 * chaque article n'a qu'un titre, une image, des catégories et des infos texte.
 */
(function () {
  "use strict";

  const CFG = window.CONFIG || {};
  /* =====================================================================
   * 1. Utilitaires
   * ===================================================================== */

  /** Minuscule, sans accents ni espaces superflus : base de la recherche. */
  const normaliser = (s) =>
    String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  /** Échappe le HTML : tout le contenu du tableur passe par ici avant affichage. */
  const echapper = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /** N'accepte que des URL http(s) ou des chemins relatifs (jamais « javascript: »). */
  function urlSure(u) {
    const s = String(u ?? "").trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith("//")) return s;
    return "";
  }

  const RE_URL = /^https?:\/\/\S+$/i;
  const RE_CHEMIN_IMAGE = /^[\w./-]+\.(jpe?g|png|webp|gif|avif)$/i;
  const RE_EXT_IMAGE = /\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i;
  const RE_HOTE_IMAGE = /(drive\.google\.com\/thumbnail|googleusercontent\.com|geilicdn\.com|alicdn\.com|i\.imgur\.com|res\.cloudinary\.com|img-proxy)/i;
  const estImage = (u) => RE_EXT_IMAGE.test(u) || RE_HOTE_IMAGE.test(u);

  /** Transforme une valeur de cellule texte en cellule { texte, lien, image }. */
  function celluleDeTexte(texte) {
    const t = String(texte ?? "").trim();
    const cel = { texte: t, lien: "", image: "" };
    if (RE_URL.test(t) || RE_CHEMIN_IMAGE.test(t)) {
      if (estImage(t)) cel.image = t;
      else cel.lien = t;
    }
    return cel;
  }

  /** Petite empreinte stable (FNV-1a) pour identifier un article dans les favoris et l'URL. */
  function empreinte(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function antiRebond(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /** Lettre de colonne façon tableur : 0 -> A, 27 -> AB. */
  function lettre(i) {
    let s = "";
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  const RE_PRIX = /([$€£¥]|\b(usd|eur|cny|rmb|gbp|chf)\b)\s*\d|\d[\d\s.,]*\s*([$€£¥]|\b(usd|eur|cny|rmb|gbp|chf)\b)/i;

  /** « 1 234,50 » ou « 1,234.50 » -> 1234.5 */
  function lireDate(s) {
    const t = String(s ?? "").trim();
    let m;
    if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
      const a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return new Date(a, +m[2] - 1, +m[1]);
    }
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + parseFloat(t) * 86400000);
    const d = new Date(t);
    return isNaN(d) ? null : d;
  }

  /* =====================================================================
   * 2. Lecture CSV (RFC 4180 : guillemets, virgules et retours à la ligne
   *    dans les champs, séparateur , ; ou tabulation détecté automatiquement)
   * ===================================================================== */

  function lireCSV(texte) {
    texte = String(texte).replace(/^﻿/, "");
    // Détection du séparateur sur le début du fichier, hors guillemets
    const compte = { ",": 0, ";": 0, "\t": 0 };
    let dans = false;
    for (let i = 0; i < Math.min(texte.length, 4000); i++) {
      const c = texte[i];
      if (c === '"') dans = !dans;
      else if (!dans && c in compte) compte[c]++;
    }
    const sep = Object.keys(compte).sort((a, b) => compte[b] - compte[a])[0];

    const lignes = [];
    let ligne = [];
    let champ = "";
    let guillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (guillemets) {
        if (c === '"') {
          if (texte[i + 1] === '"') {
            champ += '"';
            i++;
          } else guillemets = false;
        } else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === sep) {
        ligne.push(champ);
        champ = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && texte[i + 1] === "\n") i++;
        ligne.push(champ);
        lignes.push(ligne);
        ligne = [];
        champ = "";
      } else champ += c;
    }
    if (champ || ligne.length) {
      ligne.push(champ);
      lignes.push(ligne);
    }
    return lignes.map((l) => l.map(celluleDeTexte));
  }

  /* =====================================================================
   * 3. Lecture XLSX
   *    Un .xlsx est un zip de fichiers XML. On lit le répertoire du zip,
   *    on décompresse avec DecompressionStream, et on parcourt le XML.
   *    Avantage sur le CSV : on récupère les URL des formules HYPERLINK,
   *    les images IMAGE("…") et les liens insérés.
   * ===================================================================== */

  async function ouvrirZip(buffer) {
    const v = new DataView(buffer);
    const octets = new Uint8Array(buffer);
    const dec = new TextDecoder();
    let fin = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) {
        fin = i;
        break;
      }
    }
    if (fin < 0) throw new Error("Ce fichier n'est pas un .xlsx valide (le Sheet est-il public ?)");
    const entrees = new Map();
    let p = v.getUint32(fin + 16, true);
    for (let k = 0, n = v.getUint16(fin + 10, true); k < n; k++) {
      const lnom = v.getUint16(p + 28, true);
      entrees.set(dec.decode(octets.subarray(p + 46, p + 46 + lnom)), {
        methode: v.getUint16(p + 10, true),
        taille: v.getUint32(p + 20, true),
        position: v.getUint32(p + 42, true),
      });
      p += 46 + lnom + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    async function lire(nom) {
      const e = entrees.get(nom);
      if (!e) return null;
      const debut = e.position + 30 + v.getUint16(e.position + 26, true) + v.getUint16(e.position + 28, true);
      const brut = octets.subarray(debut, debut + e.taille);
      if (e.methode === 0) return brut;
      const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(flux).arrayBuffer());
    }
    return {
      lire,
      async xml(nom) {
        const b = await lire(nom);
        return b ? new DOMParser().parseFromString(dec.decode(b), "application/xml") : null;
      },
    };
  }

  const balises = (doc, nom) => Array.from(doc.getElementsByTagNameNS("*", nom));

  function joindreChemin(base, relatif) {
    if (relatif.startsWith("/")) return relatif.slice(1);
    const parts = base.split("/").slice(0, -1);
    for (const seg of relatif.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }

  async function relations(zip, chemin) {
    const i = chemin.lastIndexOf("/");
    const doc = await zip.xml(chemin.slice(0, i) + "/_rels/" + chemin.slice(i + 1) + ".rels");
    const sortie = {};
    if (!doc) return sortie;
    for (const r of balises(doc, "Relationship")) {
      const cible = r.getAttribute("Target");
      sortie[r.getAttribute("Id")] = r.getAttribute("TargetMode") === "External" ? cible : joindreChemin(chemin, cible);
    }
    return sortie;
  }

  function refCellule(ref) {
    const m = /([A-Z]+)(\d+)/.exec(ref);
    let col = 0;
    for (const c of m[1]) col = col * 26 + c.charCodeAt(0) - 64;
    return [parseInt(m[2], 10) - 1, col - 1];
  }

  const argFormule = (f, nom) => {
    const m = new RegExp(nom + '\\(\\s*"((?:[^"]|"")*)"', "i").exec(f || "");
    return m ? m[1].replace(/""/g, '"') : "";
  };

  async function lireXlsx(buffer, onglet) {
    const zip = await ouvrirZip(buffer);
    const wb = await zip.xml("xl/workbook.xml");
    const relsWb = await relations(zip, "xl/workbook.xml");
    const feuilles = balises(wb, "sheet").map((s) => ({
      nom: s.getAttribute("name"),
      chemin: relsWb[s.getAttribute("r:id")],
    }));
    const feuille = (onglet && feuilles.find((f) => normaliser(f.nom) === normaliser(onglet))) || feuilles[0];

    const partages = [];
    const ss = await zip.xml("xl/sharedStrings.xml");
    if (ss) for (const si of balises(ss, "si")) partages.push(balises(si, "t").map((t) => t.textContent).join(""));

    const ws = await zip.xml(feuille.chemin);
    const rels = await relations(zip, feuille.chemin);
    const grille = [];
    const cellule = (l, c) => {
      const ligne = (grille[l] = grille[l] || []);
      return (ligne[c] = ligne[c] || { texte: "", lien: "", image: "" });
    };

    for (const c of balises(ws, "c")) {
      const [l, col] = refCellule(c.getAttribute("r"));
      const type = c.getAttribute("t");
      const v = balises(c, "v")[0];
      const f = balises(c, "f")[0];
      let texte = v ? v.textContent : "";
      if (type === "s" && texte) texte = partages[+texte] ?? "";
      else if (type === "inlineStr") texte = balises(c, "t").map((t) => t.textContent).join("");
      const formule = f ? f.textContent : "";
      const lien = argFormule(formule, "HYPERLINK");
      const image = argFormule(formule, "IMAGE");
      if (!texte && !lien && !image) continue;
      const cel = cellule(l, col);
      cel.texte = texte.trim();
      cel.lien = lien;
      cel.image = image;
      if (!lien && !image) Object.assign(cel, celluleDeTexte(cel.texte));
    }

    // Liens insérés via « Insérer un lien »
    for (const h of balises(ws, "hyperlink")) {
      const cible = rels[h.getAttribute("r:id")];
      if (cible && /^https?:/i.test(cible)) {
        const [l, col] = refCellule(h.getAttribute("ref").split(":")[0]);
        const cel = cellule(l, col);
        cel.lien = cel.lien || cible;
      }
    }

    // Photos collées dans les cellules : converties en URL locales (blob)
    const dessin = balises(ws, "drawing")[0];
    if (dessin) {
      const cheminDessin = rels[dessin.getAttribute("r:id")];
      const relsDessin = await relations(zip, cheminDessin);
      const doc = await zip.xml(cheminDessin);
      for (const ancre of Array.from(doc.documentElement.children)) {
        const depart = balises(ancre, "from")[0];
        const blip = balises(ancre, "blip")[0];
        if (!depart || !blip) continue;
        const media = relsDessin[blip.getAttribute("r:embed")];
        const octets = media && (await zip.lire(media));
        if (!octets) continue;
        const l = +balises(depart, "row")[0].textContent;
        const col = +balises(depart, "col")[0].textContent;
        cellule(l, col).image = URL.createObjectURL(new Blob([octets]));
      }
    }

    return Array.from(grille, (ligne) => Array.from(ligne || [], (c) => c || { texte: "", lien: "", image: "" }));
  }

  /* =====================================================================
   * 4. Analyse du tableur
   *    - trouve la ligne d'en-tête (pas forcément la première)
   *    - associe chaque colonne à un champ standard, d'après son nom ET
   *      d'après ses valeurs (une colonne « PRICE » remplie de liens est
   *      traitée comme un lien : les valeurs l'emportent sur l'en-tête)
   *    - les lignes ne contenant qu'un texte (ex. « SHOES ») sont des
   *      sections et deviennent la catégorie des lignes suivantes
   * ===================================================================== */

  // Les colonnes QC et prix restent détectées : c'est ce qui permet de les écarter de l'affichage.
  const CHAMPS = {
    qcImages: [/\bqc\b.*\b(photos?|images?|imgs?|pics?)\b/, /\b(photos?|images?|imgs?|pics?)\b.*\bqc\b/],
    qc: [/\bqc\b/, /reptools|rep\.tools/, /quality ?check/, /controle qualite/],
    titre: [/\b(item ?name|nom|titre|title|name|produit|product|article|designation|item|modele|model)\b/],
    prix: [/\b(prix|price|cout|cost|tarif|usd|eur|cny|rmb)\b/],
    image: [/\b(images?|pictures?|photos?|img|visuel|thumbnail|pics?)\b/],
    lien: [/\b(links?|liens?|url|buy|achat|acheter|shop|boutique|store)\b/],
    categorie: [/\b(categories?|category|categ|cat|rayon|section|type|famille)\b/],
    description: [/\b(description|desc|details?|notes?|commentaires?|remarques?)\b/],
    tags: [/\b(tags?|etiquettes?|labels?|mots? cles?|keywords?)\b/],
    date: [/\b(date|ajoute|added|cree|created|maj|updated)\b/],
  };
  const LIBELLES = {
    titre: "Nom",
    description: "Description",
    categorie: "Catégorie",
    prix: "Prix",
    image: "Image",
    lien: "Lien d'achat",
    qc: "Lien QC",
    qcImages: "Photos QC",
    tags: "Tags",
    date: "Date",
  };

  function champDEntete(entete) {
    const n = normaliser(entete);
    if (!n) return null;
    for (const champ of Object.keys(CHAMPS)) if (CHAMPS[champ].some((re) => re.test(n))) return champ;
    return null;
  }

  const estVide = (c) => !c || (!c.texte && !c.lien && !c.image);
  const nonVides = (ligne) => (ligne || []).filter((c) => !estVide(c));

  /** Une ligne de section : une seule cellule texte, sans lien ni image. */
  function estSection(ligne) {
    const pleines = nonVides(ligne);
    return pleines.length === 1 && !pleines[0].lien && !pleines[0].image && pleines[0].texte.length <= 60;
  }

  function trouverEntete(grille) {
    let meilleure = -1;
    let score = 1;
    for (let i = 0; i < Math.min(grille.length, 40); i++) {
      const s = (grille[i] || []).filter((c) => c && !c.lien && !c.image && champDEntete(c.texte)).length;
      if (s > score) {
        score = s;
        meilleure = i;
      }
    }
    return meilleure;
  }

  /** Type d'une valeur : image, qc, lien, prix, nombre ou texte. */
  function typeValeur(c) {
    if (c.image) return "image";
    if (c.lien) return /rep\.?tools|[/?&._-]qc([/?&._-]|$)/i.test(c.lien) ? "qc" : "lien";
    if (RE_PRIX.test(c.texte)) return "prix";
    if (/^\d+([.,]\d+)?$/.test(c.texte)) return "nombre";
    return "texte";
  }

  function analyserColonnes(entetes, lignes, diagnostic) {
    const nbCol = Math.max(entetes.length, ...lignes.map((l) => l.length), 0);
    const colonnes = [];
    for (let i = 0; i < nbCol; i++) {
      const stats = { n: 0, image: 0, qc: 0, lien: 0, prix: 0, nombre: 0, texte: 0, longueur: 0 };
      for (const l of lignes) {
        const c = l[i];
        if (estVide(c)) continue;
        stats.n++;
        stats[typeValeur(c)]++;
        stats.longueur += c.texte.length;
      }
      colonnes.push({ i, entete: (entetes[i] && entetes[i].texte) || "", stats, champ: null });
    }

    const manuel = CFG.mapping || {};
    const ratio = (s, k) => (s.n ? s[k] / s.n : 0);
    const candidats = [];
    for (const col of colonnes) {
      const s = col.stats;
      const parEntete = champDEntete(col.entete);
      const force = Object.keys(manuel).find((k) => normaliser(manuel[k]) === normaliser(col.entete) && col.entete);
      let champ = null;
      let confiance = 0;
      if (force) [champ, confiance] = [force, 3];
      else if (!s.n) continue;
      else if (parEntete === "qcImages") [champ, confiance] = ["qcImages", 2]; // « Photos QC » : une ou plusieurs URL par cellule
      else if (ratio(s, "image") >= 0.5) [champ, confiance] = [parEntete === "qc" || parEntete === "qcImages" ? "qcImages" : "image", 2];
      else if (ratio(s, "qc") >= 0.5 || (parEntete === "qc" && ratio(s, "lien") >= 0.5)) [champ, confiance] = ["qc", 2];
      else if (ratio(s, "lien") >= 0.5) [champ, confiance] = ["lien", 2];
      else if (ratio(s, "prix") >= 0.5 || (parEntete === "prix" && ratio(s, "nombre") >= 0.5)) [champ, confiance] = ["prix", 2];
      else if (parEntete && !["image", "lien", "qc", "qcImages", "prix"].includes(parEntete)) [champ, confiance] = [parEntete, 1];
      if (parEntete && champ && parEntete !== champ && !force) {
        diagnostic.push(`Colonne ${lettre(col.i)} « ${col.entete} » : les valeurs indiquent « ${LIBELLES[champ]} », pas « ${LIBELLES[parEntete]} ».`);
      }
      if (champ) candidats.push({ col, champ, confiance: confiance + ratio(s, "n") });
    }
    // Un champ = une colonne : en cas de concurrence, la plus fiable puis la plus à gauche
    candidats.sort((a, b) => b.confiance - a.confiance || a.col.i - b.col.i);
    const pris = new Set();
    for (const c of candidats) {
      if (pris.has(c.champ)) {
        diagnostic.push(`Colonne ${lettre(c.col.i)} « ${c.col.entete} » : « ${LIBELLES[c.champ]} » déjà attribué, gardée comme information supplémentaire.`);
        continue;
      }
      pris.add(c.champ);
      c.col.champ = c.champ;
    }
    // Pas de titre identifié : première colonne majoritairement textuelle
    if (!pris.has("titre")) {
      const col = colonnes.find((c) => !c.champ && c.stats.n && ratio(c.stats, "texte") >= 0.5);
      if (col) {
        col.champ = "titre";
        diagnostic.push(`Titre non trouvé dans les en-têtes : colonne ${lettre(col.i)} utilisée.`);
      }
    }
    return colonnes;
  }

  /** Transforme une grille (lignes de cellules) en articles. */
  function analyserGrille(grille, source, diagnostic) {
    const iEntete = trouverEntete(grille);
    const entetes = iEntete >= 0 ? grille[iEntete] : [];
    const signatureEntete = normaliser(nonVides(entetes).map((c) => c.texte).join("|"));
    const corps = grille.slice(iEntete + 1);
    const lignesDonnees = corps.filter((l) => nonVides(l).length && !estSection(l));
    if (iEntete < 0) diagnostic.push(`${source.nom} : aucune ligne d'en-tête reconnue, colonnes nommées A, B, C…`);
    const colonnes = analyserColonnes(entetes, lignesDonnees, diagnostic);

    const resume = colonnes.filter((c) => c.stats.n).map((c) => `${lettre(c.i)} « ${c.entete || "—"} » → ${c.champ ? LIBELLES[c.champ] : "info supplémentaire"}`);
    diagnostic.push(`${source.nom} : en-tête ligne ${iEntete + 1} ; ${resume.join(" ; ")}`);

    const articles = [];
    let section = "";
    corps.forEach((ligne, k) => {
      const pleines = nonVides(ligne);
      if (!pleines.length) return;
      if (estSection(ligne)) {
        section = pleines[0].texte;
        return;
      }
      if (normaliser(pleines.map((c) => c.texte).join("|")) === signatureEntete) return; // en-tête répété

      const v = {};
      const extras = [];
      for (const col of colonnes) {
        const c = ligne[col.i];
        if (estVide(c)) continue;
        if (col.champ) v[col.champ] = c;
        else extras.push({ libelle: col.entete || `Colonne ${lettre(col.i)}`, cellule: c });
      }
      if (!v.titre && !v.lien && !v.image) return;

      const lignesTitre = ((v.titre && v.titre.texte) || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const categories = [];
      if (v.categorie && v.categorie.texte) categories.push(...v.categorie.texte.split(/[;|]/).map((s) => s.trim()).filter(Boolean));
      else if (section) categories.push(section.trim());

      articles.push({
        source,
        ligne: iEntete + 2 + k,
        titre: lignesTitre[0] || "Sans titre",
        sousTitre: lignesTitre.slice(1).join(" · "),
        description: v.description ? v.description.texte : "",
        categories,
        tags: v.tags ? v.tags.texte.split(/[,;|#]/).map((s) => s.trim()).filter(Boolean) : [],
        image: v.image ? urlSure(v.image.image) : "",
        date: v.date ? lireDate(v.date.texte) : null,
        // Infos supplémentaires textuelles (ex. nombre de coloris) ; jamais de lien
        extras: extras.filter((x) => !x.cellule.lien && !x.cellule.image).map((x) => ({ libelle: x.libelle, texte: x.cellule.texte })),
        // Clé de doublon : le lien d'achat s'il existe, sinon titre + prix. Non affichée.
        _cle: v.lien
          ? "l:" + (v.lien.lien || v.lien.texte).replace(/[?&](affcode|ref|spm)=[^&]*/gi, "")
          : "t:" + normaliser(lignesTitre.join("|") + "|" + (v.prix ? v.prix.texte : "")),
      });
    });
    return articles;
  }

  /** Fusionne les doublons (même article présent dans plusieurs sections ou tableurs). */
  function dedoublonner(articles, diagnostic) {
    const index = new Map();
    const sortie = [];
    let doublons = 0;
    for (const a of articles) {
      const cle = a._cle;
      delete a._cle;
      const existant = index.get(cle);
      if (existant) {
        doublons++;
        for (const c of a.categories) if (!existant.categories.includes(c)) existant.categories.push(c);
        for (const t of a.tags) if (!existant.tags.includes(t)) existant.tags.push(t);
        if (!existant.sources.includes(a.source)) existant.sources.push(a.source);
        if (!existant.image && a.image) existant.image = a.image;
        continue;
      }
      a.id = empreinte(cle);
      a.sources = [a.source];
      index.set(cle, a);
      sortie.push(a);
    }
    if (doublons) diagnostic.push(`${doublons} doublon(s) fusionné(s) : leurs catégories sont regroupées sur une seule fiche.`);
    return sortie;
  }

  /* =====================================================================
   * 5. Chargement des sources
   * ===================================================================== */

  function chargerScript(src) {
    return new Promise((ok) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = ok; // absence de copie locale : géré plus loin
      document.head.appendChild(s);
    });
  }

  async function chargerSource(src) {
    const format = src.format || (/format=xlsx|\.xlsx(\?|$)/i.test(src.url || "") ? "xlsx" : "csv");
    if (src.url) {
      try {
        const r = await fetch(src.url, { cache: "no-cache" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const grille = format === "xlsx" ? await lireXlsx(await r.arrayBuffer(), src.onglet) : lireCSV(await r.text());
        return { grille, mode: "en direct" };
      } catch (e) {
        console.warn(`[catalogue] ${src.nom} : lecture en direct impossible (${e.message}), utilisation de la copie locale.`);
      }
    }
    if (src.copie) {
      await chargerScript(`data/${encodeURIComponent(src.copie)}.js`);
      const copie = (window.CATALOGUE_DONNEES || {})[src.copie];
      if (copie) {
        const date = copie.genere ? new Date(copie.genere).toLocaleDateString("fr-FR") : "";
        return { grille: lireCSV(copie.csv), mode: `copie locale${date ? " du " + date : ""}` };
      }
    }
    throw new Error(`${src.nom} : aucune donnée (ni URL accessible, ni copie data/${src.copie || src.id}.js)`);
  }

  /** Charge toutes les sources et renvoie { articles, infos, diagnostic }. */
  async function charger(sources) {
    const diagnostic = [];
    const infos = [];
    let tous = [];
    const resultats = await Promise.allSettled(sources.map(chargerSource));
    resultats.forEach((res, k) => {
      const src = sources[k];
      if (res.status === "rejected") {
        infos.push(`${src.nom} : indisponible`);
        console.error("[catalogue]", res.reason);
        return;
      }
      infos.push(`${src.nom} : ${res.value.mode}`);
      tous = tous.concat(analyserGrille(res.value.grille, src, diagnostic));
    });
    return { articles: dedoublonner(tous, diagnostic), infos, diagnostic };
  }

  window.Donnees = { charger, normaliser, echapper, urlSure, antiRebond };
})();
