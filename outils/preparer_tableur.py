#!/usr/bin/env python3
"""
Prépare un Google Sheet pour le catalogue.

Pourquoi ce script ? L'export CSV de Google Sheets perd les URL des cellules
« LINK » (formules HYPERLINK) et toutes les images (formules IMAGE ou photos
collées dans les cellules). Ce script télécharge le tableur au format .xlsx,
qui conserve tout, puis écrit :

  data/<nom>.csv     le tableur avec les vraies URL à la place de « LINK »
  data/<nom>.js      le même CSV, chargeable même en ouvrant index.html en local
  images/<nom>/      les photos collées dans les cellules, compressées en JPEG

Les liens raccourcis (ikako.vip, bit.ly…) sont résolus pour que le site
puisse retrouver l'ID de l'article et générer le lien QC RepTools.

Exemples :
  python3 outils/preparer_tableur.py --id 1V8HLT30eYrr_9rv4Ifq_Y59EHE01OU0Tu9Nqt2q_bRw --nom tableur1
  python3 outils/preparer_tableur.py --xlsx ~/Downloads/mon-tableur.xlsx --nom boutique

Aucune dépendance : Python 3 standard + « sips » (fourni avec macOS) pour
compresser les images. Sans sips, les images sont copiées telles quelles.
"""
import argparse
import csv
import io
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(RACINE, "outils", ".cache")

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# Domaines de liens raccourcis à résoudre
RACCOURCISSEURS = {"ikako.vip", "sl.kakobuy.com", "bit.ly", "tinyurl.com", "t.co", "cutt.ly", "rebrand.ly", "shorturl.at", "is.gd"}
# Un lien qui contient déjà l'ID d'un article (Weidian, Taobao, 1688) n'a plus besoin d'être suivi
RE_ID_ARTICLE = re.compile(r"weidian\.com/.*item(id)?=\d+|(taobao|tmall)\.com/.*[?&]id=\d+|1688\.com/offer/\d+", re.I)
# Textes de cellule qui ne sont qu'une étiquette de lien (on garde alors l'URL)
ETIQUETTES_LIEN = {"", "link", "lien", "url", "buy", "acheter", "voir", "here", "ici", "click", "clic", "qc"}


# ---------------------------------------------------------------- Lecture xlsx

def lire_relations(z, chemin):
    """Renvoie {rId: cible} pour la partie `chemin` du fichier xlsx."""
    rels = posixpath.join(posixpath.dirname(chemin), "_rels", posixpath.basename(chemin) + ".rels")
    if rels not in z.namelist():
        return {}
    sortie = {}
    for r in ET.fromstring(z.read(rels)).findall("rel:Relationship", NS):
        cible = r.get("Target")
        if r.get("TargetMode") != "External":
            cible = cible.lstrip("/") if cible.startswith("/") else posixpath.normpath(
                posixpath.join(posixpath.dirname(chemin), cible))
        sortie[r.get("Id")] = cible
    return sortie


def colonne_index(ref):
    """« AB12 » -> (ligne 12, colonne 27 en base 0)."""
    m = re.match(r"([A-Z]+)(\d+)", ref)
    col = 0
    for c in m.group(1):
        col = col * 26 + ord(c) - 64
    return int(m.group(2)), col - 1


def arg_formule(formule, nom):
    """Premier argument texte d'une formule, ex. IMAGE("url") -> url."""
    m = re.search(nom + r'\(\s*"((?:[^"]|"")*)"', formule or "", re.I)
    return m.group(1).replace('""', '"') if m else None


def lire_onglet(z, onglet):
    """Lit un onglet et renvoie (grille, medias).
    grille : {ligne: {colonne: {"t": texte, "l": lien, "i": image}}}
    medias : {(ligne, colonne): chemin du média dans le zip}"""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels_wb = lire_relations(z, "xl/workbook.xml")
    feuilles = [(s.get("name"), rels_wb[s.get(R + "id")]) for s in wb.iter("{%s}sheet" % NS["m"])]
    if onglet:
        trouve = [f for f in feuilles if f[0].strip().lower() == onglet.strip().lower()]
        if not trouve:
            sys.exit("Onglet introuvable : %s (disponibles : %s)" % (onglet, ", ".join(f[0] for f in feuilles)))
        nom_onglet, chemin = trouve[0]
    else:
        nom_onglet, chemin = feuilles[0]
    print("Onglet lu :", nom_onglet)

    partages = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            partages.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))

    ws = ET.fromstring(z.read(chemin))
    rels = lire_relations(z, chemin)
    grille = {}

    def cellule(ligne, col):
        return grille.setdefault(ligne, {}).setdefault(col, {"t": "", "l": "", "i": ""})

    for c in ws.iter("{%s}c" % NS["m"]):
        ligne, col = colonne_index(c.get("r"))
        typ = c.get("t")
        v = c.find("m:v", NS)
        f = c.find("m:f", NS)
        texte = v.text if v is not None and v.text else ""
        if typ == "s" and texte:
            texte = partages[int(texte)]
        elif typ == "inlineStr":
            texte = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
        if typ in (None, "n") and re.fullmatch(r"-?\d+\.0", texte):
            texte = texte[:-2]
        formule = f.text if f is not None else ""
        lien = arg_formule(formule, "HYPERLINK")
        image = arg_formule(formule, "IMAGE")
        if texte or lien or image:
            cel = cellule(ligne, col)
            cel["t"], cel["l"], cel["i"] = texte, lien or "", image or ""

    # Liens posés via « Insérer un lien » (et non par formule)
    for h in ws.iter("{%s}hyperlink" % NS["m"]):
        cible = rels.get(h.get(R + "id"))
        if cible and cible.startswith("http"):
            ligne, col = colonne_index(h.get("ref").split(":")[0])
            cel = cellule(ligne, col)
            cel["l"] = cel["l"] or cible

    # Photos collées dans les cellules (dessins ancrés)
    medias = {}
    dessin = ws.find("m:drawing", NS)
    if dessin is not None:
        chemin_dessin = rels[dessin.get(R + "id")]
        rels_dessin = lire_relations(z, chemin_dessin)
        racine = ET.fromstring(z.read(chemin_dessin))
        for ancre in list(racine):
            depart = ancre.find("xdr:from", NS)
            blip = ancre.find(".//a:blip", NS)
            if depart is None or blip is None:
                continue
            ligne = int(depart.find("xdr:row", NS).text) + 1
            col = int(depart.find("xdr:col", NS).text)
            media = rels_dessin.get(blip.get(R + "embed"))
            if media:
                medias[(ligne, col)] = media
    return grille, medias


# ------------------------------------------------------- Résolution des liens

class _SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def resoudre(url):
    """Suit les redirections d'un lien court jusqu'à l'URL finale (5 sauts max)."""
    ouvreur = urllib.request.build_opener(_SansRedirection)
    essais = 0
    for _ in range(12):
        if RE_ID_ARTICLE.search(urllib.parse.unquote(url)):
            return url
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (catalogue)"})
            ouvreur.open(req, timeout=15).close()
            return url
        except urllib.error.HTTPError as e:
            suivant = e.headers.get("Location")
            if e.code in (301, 302, 303, 307, 308) and suivant:
                url = urllib.parse.urljoin(url, suivant)
                continue
            if e.code == 429 or e.code >= 500:
                time.sleep(2 + essais)  # limite de débit : on patiente puis on réessaie
                essais += 1
                if essais <= 4:
                    continue
            return url
        except Exception:
            time.sleep(2)
            essais += 1
            if essais <= 4:
                continue
            return url
    return url


def resoudre_tous(liens):
    """Résout en parallèle, avec un cache pour que les relances soient rapides."""
    chemin_cache = os.path.join(CACHE, "liens.json")
    cache = {}
    if os.path.exists(chemin_cache):
        with open(chemin_cache, encoding="utf-8") as fh:
            cache = json.load(fh)
    a_faire = sorted({l for l in liens if urllib.parse.urlparse(l).hostname in RACCOURCISSEURS
                      and urllib.parse.urlparse(cache.get(l, l)).hostname in RACCOURCISSEURS})
    if a_faire:
        print("Résolution de %d liens courts…" % len(a_faire))
        with ThreadPoolExecutor(max_workers=3) as pool:
            for court, long in zip(a_faire, pool.map(resoudre, a_faire)):
                cache[court] = long
        os.makedirs(CACHE, exist_ok=True)
        with open(chemin_cache, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, indent=0)
    return cache


# ------------------------------------------------------------------- Images

def extraire_images(z, medias, nom, taille):
    """Écrit chaque photo collée en JPEG compressé, renvoie {(ligne, col): chemin relatif}."""
    dossier = os.path.join(RACINE, "images", nom)
    os.makedirs(dossier, exist_ok=True)
    sips = shutil.which("sips")
    sortie = {}

    def traiter(item):
        (ligne, col), media = item
        base = os.path.splitext(posixpath.basename(media))[0]
        ext = ".jpg" if sips else os.path.splitext(media)[1]
        dest = os.path.join(dossier, base + ext)
        if not os.path.exists(dest):
            if sips:
                tmp = os.path.join(CACHE, "img_" + posixpath.basename(media))
                with open(tmp, "wb") as fh:
                    fh.write(z.read(media))
                subprocess.run([sips, "-s", "format", "jpeg", "-s", "formatOptions", "65",
                                "-Z", str(taille), tmp, "--out", dest],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                os.remove(tmp)
            else:
                with open(dest, "wb") as fh:
                    fh.write(z.read(media))
        return (ligne, col), "images/%s/%s%s" % (nom, base, ext)

    os.makedirs(CACHE, exist_ok=True)
    print("Extraction de %d photos vers images/%s/…" % (len(medias), nom))
    with ThreadPoolExecutor(max_workers=8) as pool:
        for cle, chemin in pool.map(traiter, medias.items()):
            sortie[cle] = chemin
    return sortie


# -------------------------------------------------------------------- Main

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument("--id", help="ID du Google Sheet (la partie entre /d/ et /edit dans l'URL)")
    source.add_argument("--xlsx", help="fichier .xlsx déjà téléchargé")
    p.add_argument("--nom", required=True, help="nom court de la source, ex. tableur1 (sans espace)")
    p.add_argument("--onglet", help="nom de l'onglet à lire (par défaut le premier)")
    p.add_argument("--taille", type=int, default=480, help="taille max des photos extraites, en px (défaut 480)")
    p.add_argument("--sans-resolution", action="store_true", help="ne pas résoudre les liens courts")
    args = p.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9_-]+", args.nom):
        sys.exit("--nom ne doit contenir que lettres, chiffres, - et _")

    os.makedirs(CACHE, exist_ok=True)
    if args.id:
        chemin_xlsx = os.path.join(CACHE, args.id + ".xlsx")
        print("Téléchargement du tableur…")
        urllib.request.urlretrieve(
            "https://docs.google.com/spreadsheets/d/%s/export?format=xlsx" % args.id, chemin_xlsx)
    else:
        chemin_xlsx = os.path.expanduser(args.xlsx)

    with zipfile.ZipFile(chemin_xlsx) as z:
        grille, medias = lire_onglet(z, args.onglet)
        images = extraire_images(z, medias, args.nom, args.taille) if medias else {}

    if args.id:
        os.remove(chemin_xlsx)  # le .xlsx téléchargé peut peser des centaines de Mo

    liens = [c["l"] for ligne in grille.values() for c in ligne.values() if c["l"]]
    resolus = {} if args.sans_resolution else resoudre_tous(liens)

    # Construction du CSV : même disposition que le tableur, URL à la place des étiquettes
    nb_col = 1 + max(max(ligne) for ligne in grille.values() if ligne)
    nb_col = max(nb_col, 1 + max((c for _, c in images), default=0))
    derniere = max(max(grille), max((l for l, _ in images), default=0))
    tampon = io.StringIO()
    ecrivain = csv.writer(tampon, lineterminator="\n")
    for ligne in range(1, derniere + 1):
        valeurs = []
        for col in range(nb_col):
            cel = grille.get(ligne, {}).get(col, {"t": "", "l": "", "i": ""})
            if (ligne, col) in images:
                valeurs.append(images[(ligne, col)])
            elif cel["i"]:
                valeurs.append(cel["i"])
            elif cel["l"] and cel["t"].strip().lower() in ETIQUETTES_LIEN:
                valeurs.append(resolus.get(cel["l"], cel["l"]))
            else:
                valeurs.append(cel["t"])
        ecrivain.writerow(valeurs)
    contenu = tampon.getvalue()

    os.makedirs(os.path.join(RACINE, "data"), exist_ok=True)
    with open(os.path.join(RACINE, "data", args.nom + ".csv"), "w", encoding="utf-8") as fh:
        fh.write(contenu)
    genere = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(os.path.join(RACINE, "data", args.nom + ".js"), "w", encoding="utf-8") as fh:
        fh.write("/* Généré par outils/preparer_tableur.py — ne pas modifier à la main. */\n")
        fh.write("window.CATALOGUE_DONNEES = window.CATALOGUE_DONNEES || {};\n")
        fh.write("window.CATALOGUE_DONNEES[%s] = { genere: %s, csv: %s };\n"
                 % (json.dumps(args.nom), json.dumps(genere), json.dumps(contenu, ensure_ascii=False)))
    print("OK : data/%s.csv et data/%s.js (%d lignes, %d photos)" % (args.nom, args.nom, derniere, len(images)))


if __name__ == "__main__":
    main()
