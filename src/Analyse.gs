/**
 * FR : Logique métier pure (aucun appel de service) : réglages et propriétés (RM-1, RM-5, RM-16, RM-18, RM-26),
 *      référence et catégorie (RM-3, RM-7), normalisation des éléments du flux (RM-2, RM-4), clé d'anti-doublon et
 *      mémoire (RM-7, RM-8), tri des nouveaux éléments (RM-5, RM-6, RM-12). Testable dans un banc Node vm.
 * EN: Pure business logic (no service call): settings and properties, reference and category, feed item
 *     normalisation, de-duplication key and memory, sorting of new items. Testable in a Node vm bench.
 */

// ---------------------------------------------------------------------------
// FR : Réglages (RM-26) et propriétés saisies. / EN: Settings (RM-26) and entered properties.
// ---------------------------------------------------------------------------

/**
 * FR : Réglages effectifs : valeur de CONFIG.REGLAGES, surchargée par la propriété de même nom si c'est un entier ≥ 1 ;
 *      MEMOIRE_MAX plafonnée à MEMOIRE_MAX_PLAFOND. Chaque réglage indique son origine et ses avertissements.
 * EN: Effective settings: CONFIG.REGLAGES value, overridden by the property of the same name when it is an integer
 *     ≥ 1; MEMOIRE_MAX capped at MEMOIRE_MAX_PLAFOND. Each setting states its origin and warnings.
 * @param {Object<string, string>} proprietes
 * @return {{valeurs: Object<string, number>, details: Array<{nom: string, valeur: number, source: string, invalide: boolean, plafonne: boolean}>}}
 */
function lireReglages_(proprietes) {
  const valeurs = {};
  const details = [];
  for (const [nom, defaut] of Object.entries(CONFIG.REGLAGES)) {
    const brut = proprietes?.[nom];
    const presente = brut !== undefined && brut !== null && String(brut).trim() !== '';
    const lue = presente ? entierPositif_(brut) : null;
    let valeur = lue ?? defaut;
    let plafonne = false;
    if (nom === 'MEMOIRE_MAX' && valeur > CONFIG.MEMOIRE_MAX_PLAFOND) {
      valeur = CONFIG.MEMOIRE_MAX_PLAFOND;
      plafonne = true;
    }
    valeurs[nom] = valeur;
    details.push({ nom, valeur, source: lue === null ? 'config' : 'propriete', invalide: presente && lue === null, plafonne });
  }
  return { valeurs, details };
}

/**
 * FR : Mode simulation effectif (RM-18) : propriété DRY_RUN « false » → réel, « true » → simulation (casse et espaces
 *      ignorés) ; absente ou autre valeur → CONFIG.DRY_RUN.
 * EN: Effective dry-run mode (RM-18): DRY_RUN property "false" → live, "true" → dry run (case and spaces ignored);
 *     missing or other value → CONFIG.DRY_RUN.
 * @param {Object<string, string>} proprietes
 * @return {{simulation: boolean, source: string}}
 */
function lireModeSimulation_(proprietes) {
  const valeur = String(proprietes?.[CONFIG.CLES_PROPRIETES.DRY_RUN] ?? '').trim().toLowerCase();
  if (valeur === 'false') return { simulation: false, source: 'propriete' };
  if (valeur === 'true') return { simulation: true, source: 'propriete' };
  return { simulation: CONFIG.DRY_RUN !== false, source: 'config' };
}

/**
 * FR : URL du flux (RM-1) : propriété URL_FLUX si elle est en https, sinon CONFIG.URL_FLUX.
 * EN: Feed URL (RM-1): URL_FLUX property when it is https, otherwise CONFIG.URL_FLUX.
 * @param {Object<string, string>} proprietes
 * @return {{url: string, source: string, invalide: boolean}}
 */
function lireUrlFlux_(proprietes) {
  const valeur = String(proprietes?.[CONFIG.CLES_PROPRIETES.URL_FLUX] ?? '').trim();
  if (!valeur) return { url: CONFIG.URL_FLUX, source: 'config', invalide: false };
  if (/^https:\/\/[^\s/?#"'<>]+[^\s"'<>]*$/i.test(valeur)) return { url: valeur, source: 'propriete', invalide: false };
  return { url: CONFIG.URL_FLUX, source: 'config', invalide: true };
}

/**
 * FR : Filtre de catégories (RM-5) : codes séparés par des virgules (ou points-virgules, espaces), casse ignorée,
 *      « AUTRE » accepté ; vide = toutes (codes null). Codes inconnus ignorés et rendus ; si aucun code n'est connu, toutes
 *      les catégories sont publiées (avertissement) plutôt que de tout taire.
 * EN: Category filter (RM-5): comma-separated codes, case ignored, "AUTRE" accepted; empty = all (codes null). Unknown
 *     codes ignored and returned; when no code is known, all categories are posted (warning) rather than silencing all.
 * @param {Object<string, string>} proprietes
 * @return {{codes: ?string[], inconnus: string[], toutesInconnues: boolean}}
 */
function lireFiltreCategories_(proprietes) {
  const saisis = [...new Set(String(proprietes?.[CONFIG.CLES_PROPRIETES.CATEGORIES] ?? '')
    .split(/[,;\s]+/).map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (!saisis.length) return { codes: null, inconnus: [], toutesInconnues: false };
  const connus = saisis.filter((code) => code in CONFIG.AFFICHAGE_CATEGORIES);
  const inconnus = saisis.filter((code) => !(code in CONFIG.AFFICHAGE_CATEGORIES));
  return connus.length ? { codes: connus, inconnus, toutesInconnues: false } : { codes: null, inconnus, toutesInconnues: true };
}

/**
 * FR : État de WEBHOOK_URL (RM-16) : 'absente', 'invalide' ou 'valide' (préfixe https://chat.googleapis.com/v1/spaces/).
 * EN: WEBHOOK_URL state (RM-16): 'absente', 'invalide' or 'valide'.
 * @param {Object<string, string>} proprietes
 * @return {{url: string, etat: string}}
 */
function lireWebhook_(proprietes) {
  const url = String(proprietes?.[CONFIG.CLES_PROPRIETES.WEBHOOK_URL] ?? '').trim();
  if (!url) return { url: '', etat: 'absente' };
  const valide = url.startsWith(CONFIG.PREFIXE_WEBHOOK) && url.length > CONFIG.PREFIXE_WEBHOOK.length && !/[\s"'<>]/.test(url);
  return { url, etat: valide ? 'valide' : 'invalide' };
}

/**
 * FR : Adresse d'alerte (RM-17) : ADRESSE_ALERTE si valide, sinon adresse du compte exécutant ('' si inconnue).
 * EN: Alert address (RM-17): ADRESSE_ALERTE when valid, otherwise the running account's address ('' when unknown).
 * @param {Object<string, string>} proprietes
 * @param {string} adresseCompte
 * @return {{adresse: string, source: string, invalide: boolean}}
 */
function lireAdresseAlerte_(proprietes, adresseCompte) {
  const saisie = String(proprietes?.[CONFIG.CLES_PROPRIETES.ADRESSE_ALERTE] ?? '').trim();
  if (saisie && estAdresseEmail_(saisie)) return { adresse: saisie, source: 'propriete', invalide: false };
  return { adresse: adresseCompte || '', source: 'proprietaire', invalide: Boolean(saisie) };
}

// ---------------------------------------------------------------------------
// FR : Référence, catégorie, clé (RM-3, RM-7). / EN: Reference, category, key (RM-3, RM-7).
// ---------------------------------------------------------------------------

/**
 * FR : Référence CERT-FR « CERTFR-AAAA-CODE-NNN » en majuscules trouvée dans les textes donnés ; '' sinon.
 * EN: Upper-case CERT-FR reference "CERTFR-YYYY-CODE-NNN" found in the given texts; '' otherwise.
 * @param {...*} textes
 * @return {string}
 */
function extraireReference_(...textes) {
  for (const texte of textes) {
    const trouve = /CERTFR-(\d{4})-([A-Z]{2,5})-(\d{1,5})/i.exec(String(texte ?? ''));
    if (trouve) return `CERTFR-${trouve[1]}-${trouve[2].toUpperCase()}-${trouve[3]}`;
  }
  return '';
}

/**
 * FR : Forme normalisée d'un mot (minuscules, sans accents, espaces réduits).
 * EN: Normalised form of a word (lower case, no accents, collapsed spaces).
 * @param {*} texte
 * @return {string}
 */
function normaliserMot_(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/**
 * FR : Catégorie d'un élément (RM-3) : (a) code de la référence — un code inconnu donne « AUTRE » (journalisé) ;
 *      (b) premier segment du chemin du lien ; (c) balise category ; sinon « AUTRE ».
 * EN: Item category (RM-3): (a) reference code — an unknown code gives "AUTRE" (logged); (b) first path segment of the
 *     link; (c) category tag; otherwise "AUTRE".
 * @param {string} reference
 * @param {string} lien
 * @param {string[]} etiquettes
 * @return {{code: string, source: string, codeInconnu: string}}
 */
function determinerCategorie_(reference, lien, etiquettes) {
  const codeReference = reference ? reference.split('-')[2] : '';
  if (codeReference) {
    if (codeReference in CONFIG.AFFICHAGE_CATEGORIES && codeReference !== CONFIG.CODE_AUTRE) {
      return { code: codeReference, source: 'reference', codeInconnu: '' };
    }
    return { code: CONFIG.CODE_AUTRE, source: 'reference', codeInconnu: codeReference };
  }
  const segment = normaliserMot_(/^https?:\/\/[^/?#]+\/([^/?#]+)/i.exec(String(lien ?? ''))?.[1] ?? '');
  if (segment && CONFIG.CHEMINS_CATEGORIES[segment]) return { code: CONFIG.CHEMINS_CATEGORIES[segment], source: 'chemin', codeInconnu: '' };
  for (const etiquette of etiquettes ?? []) {
    const code = CONFIG.ETIQUETTES_CATEGORIES[normaliserMot_(etiquette)];
    if (code) return { code, source: 'etiquette', codeInconnu: '' };
  }
  return { code: CONFIG.CODE_AUTRE, source: 'aucune', codeInconnu: segment || '?' };
}

/**
 * FR : Lien normalisé pour la clé (RM-7) : hôte en minuscules, http → https, domaines CERT-FR confondus en un seul,
 *      sans paramètres, ancre ni barre finale. Une valeur qui n'est pas une URL est rendue sans espaces aux bords.
 * EN: Normalised link for the key (RM-7): lower-case host, http → https, CERT-FR domains merged into one, without
 *     parameters, anchor or trailing slash. A non-URL value is returned trimmed.
 * @param {*} lien
 * @return {string}
 */
function normaliserLien_(lien) {
  const texte = String(lien ?? '').trim();
  const trouve = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(texte);
  if (!trouve) return texte;
  let hote = trouve[1].toLowerCase().replace(/:(80|443)$/, '');
  if (CONFIG.DOMAINES_CERT.includes(hote)) hote = CONFIG.DOMAINE_CANONIQUE;
  const chemin = trouve[2].replace(/\/+$/, '');
  return `https://${hote}${chemin}`;
}

/**
 * FR : Clé d'anti-doublon (RM-7) : référence, à défaut guid (normalisé s'il s'agit d'une URL), à défaut lien normalisé.
 * EN: De-duplication key (RM-7): reference, otherwise guid (normalised when it is a URL), otherwise normalised link.
 * @param {{reference: string, guid: string, lien: string}} element
 * @return {string}
 */
function cleElement_({ reference, guid, lien }) {
  if (reference) return reference;
  if (String(guid ?? '').trim()) return normaliserLien_(guid);
  return normaliserLien_(lien);
}

/**
 * FR : Vrai si le lien est en https sur un domaine CERT-FR (bouton autorisé, RM-13).
 * EN: True when the link is https on a CERT-FR domain (button allowed, RM-13).
 * @param {*} lien
 * @return {boolean}
 */
function estLienCertFr_(lien) {
  const texte = String(lien ?? '').trim();
  if (!/^https:\/\//i.test(texte) || /[\s"'<>\\]/.test(texte)) return false;
  return CONFIG.DOMAINES_CERT.includes(hoteUrl_(texte)) && !/^https:\/\/[^/?#]*@/i.test(texte);
}

/**
 * FR : Lien http sur un domaine CERT-FR réécrit en https (même hôte, même chemin) pour que le bouton reste possible
 *      (RM-13) ; tout autre lien est rendu tel quel.
 * EN: http link on a CERT-FR domain rewritten to https (same host, same path) so the button stays possible (RM-13);
 *     any other link is returned as is.
 * @param {string} lien
 * @return {string}
 */
function securiserLienCert_(lien) {
  if (/^http:\/\//i.test(lien) && CONFIG.DOMAINES_CERT.includes(hoteUrl_(lien))) return lien.replace(/^http:/i, 'https:');
  return lien;
}

// ---------------------------------------------------------------------------
// FR : Éléments du flux (RM-2, RM-4). / EN: Feed items (RM-2, RM-4).
// ---------------------------------------------------------------------------

/**
 * FR : Normalise les items bruts (RM-2, RM-4) : item sans titre ou sans lien ignoré et compté ; titre et résumé nettoyés ;
 *      lien absolu ; date en objet Date (illisible → heure de lecture, signalé) ; référence, catégorie, clé ; deux
 *      items de même clé n'en font qu'un (le premier, le plus récent dans l'ordre du flux).
 * EN: Normalises raw items (RM-2, RM-4): item without title or link skipped and counted; title and summary cleaned;
 *     absolute link; Date object (unreadable → read time, flagged); reference, category, key; two items with the same
 *     key make one (the first, most recent in feed order).
 * @param {Array<Object>} itemsBruts
 * @param {string} urlBase FR : URL finale du flux. EN: final feed URL.
 * @param {Date} instantLecture
 * @return {{elements: Array<Object>, ignores: number, doublons: number, categoriesInconnues: Array<{code: string, cle: string}>, datesIllisibles: string[]}}
 */
function normaliserElements_(itemsBruts, urlBase, instantLecture) {
  const elements = [];
  const vues = new Set();
  const resultat = { elements, ignores: 0, doublons: 0, categoriesInconnues: [], datesIllisibles: [] };
  for (const brut of itemsBruts ?? []) {
    const titre = texteDepuisHtml_(brut.titre);
    const lien = securiserLienCert_(urlAbsolue_(texteDepuisHtml_(brut.lien), urlBase));
    if (!titre || !lien) {
      resultat.ignores++;
      continue;
    }
    const guid = String(brut.guid ?? '').trim();
    const reference = extraireReference_(lien, guid, brut.titre);
    const cle = cleElement_({ reference, guid, lien });
    if (vues.has(cle)) {
      resultat.doublons++;
      continue;
    }
    vues.add(cle);
    const categorie = determinerCategorie_(reference, lien, brut.etiquettes);
    if (categorie.codeInconnu) resultat.categoriesInconnues.push({ code: categorie.codeInconnu, cle });
    const date = analyserDateFlux_(brut.dateTexte);
    if (!date) resultat.datesIllisibles.push(cle);
    elements.push({
      cle, reference, titre, lien, guid,
      categorie: categorie.code,
      sourceCategorie: categorie.source,
      date: date ?? new Date(instantLecture.getTime()),
      dateLisible: Boolean(date),
      resume: resumer_(brut.description, titre),
    });
  }
  return resultat;
}

/**
 * FR : Résumé (RM-4) : description nettoyée, tronquée à RESUME_MAX caractères « … » compris ; '' si vide ou identique
 *      au titre (comparaison sans casse ni accents).
 * EN: Summary (RM-4): cleaned description, truncated to RESUME_MAX characters "…" included; '' when empty or identical
 *     to the title (case- and accent-insensitive).
 * @param {*} description
 * @param {string} titre
 * @return {string}
 */
function resumer_(description, titre) {
  const texte = texteDepuisHtml_(description);
  if (!texte || normaliserMot_(texte) === normaliserMot_(titre)) return '';
  return tronquer_(texte, CONFIG.RESUME_MAX);
}

// ---------------------------------------------------------------------------
// FR : Mémoire et tri (RM-5, RM-6, RM-8, RM-12). / EN: Memory and sorting.
// ---------------------------------------------------------------------------

/**
 * FR : Mémoire lue (RM-8, RM-11) : tableau de clés, ou null si la propriété est absente ou illisible (amorçage).
 * EN: Memory read (RM-8, RM-11): key array, or null when the property is missing or unreadable (bootstrap).
 * @param {*} texte
 * @return {?string[]}
 */
function lireMemoire_(texte) {
  const valeur = lireJson_(texte, null);
  return Array.isArray(valeur) ? valeur.map(String) : null;
}

/**
 * FR : Ajoute des clés en tête de la mémoire (la plus récente en tête), sans doublon, bornée à max (RM-8).
 * EN: Adds keys at the head of the memory (most recent first), without duplicates, capped at max (RM-8).
 * @param {string[]} memoire
 * @param {string[]} cles FR : de la plus récente à la plus ancienne. EN: most recent to oldest.
 * @param {number} max
 * @return {string[]}
 */
function ajouterCles_(memoire, cles, max) {
  return [...new Set([...cles, ...(memoire ?? [])])].slice(0, max);
}

/**
 * FR : JSON de la mémoire tenant dans MEMOIRE_OCTETS_MAX (les clés les plus anciennes sont retirées si besoin).
 * EN: Memory JSON fitting in MEMOIRE_OCTETS_MAX (oldest keys removed when needed).
 * @param {string[]} memoire
 * @return {{json: string, nombre: number, tronquee: boolean}}
 */
function serialiserMemoire_(memoire) {
  let liste = [...memoire];
  let json = JSON.stringify(liste);
  while (liste.length && octetsUtf8_(json) > CONFIG.MEMOIRE_OCTETS_MAX) {
    liste = liste.slice(0, -1);
    json = JSON.stringify(liste);
  }
  return { json, nombre: liste.length, tronquee: liste.length < memoire.length };
}

/**
 * FR : Répartit les éléments absents de la mémoire (RM-5, RM-6, RM-8, RM-12) : écartés par catégorie, écartés par
 *      ancienneté, candidats triés du plus ancien au plus récent, puis coupés au plafond (reportés).
 * EN: Splits the items missing from memory: discarded by category, discarded by age, candidates sorted oldest to
 *     newest, then cut at the cap (deferred).
 * @param {Array<Object>} elements
 * @param {string[]} memoire
 * @param {{codes: ?string[]}} filtre
 * @param {Object<string, number>} reglages
 * @param {Date} instant
 * @return {{nouveaux: Array<Object>, ecartesCategorie: Array<Object>, ecartesAnciennete: Array<Object>, aPublier: Array<Object>, reportes: Array<Object>}}
 */
function repartirNouveaux_(elements, memoire, filtre, reglages, instant) {
  const connues = new Set(memoire);
  const nouveaux = elements.filter((element) => !connues.has(element.cle));
  const limiteMs = instant.getTime() - reglages.AGE_MAX_JOURS * 24 * 3600 * 1000;
  const ecartesCategorie = [];
  const ecartesAnciennete = [];
  const candidats = [];
  nouveaux.forEach((element, rang) => {
    if (filtre.codes && !filtre.codes.includes(element.categorie)) ecartesCategorie.push(element);
    else if (element.date.getTime() < limiteMs) ecartesAnciennete.push(element);
    else candidats.push({ element, rang });
  });
  // FR : plus ancien d'abord ; à date égale, ordre inverse du flux (le flux liste le plus récent en tête).
  // EN: oldest first; on equal dates, reverse feed order (the feed lists the newest first).
  candidats.sort((premier, second) => premier.element.date.getTime() - second.element.date.getTime() || second.rang - premier.rang);
  const tries = candidats.map(({ element }) => element);
  const plafond = reglages.MAX_PUBLICATIONS_PAR_EXECUTION;
  return { nouveaux, ecartesCategorie, ecartesAnciennete, aPublier: tries.slice(0, plafond), reportes: tries.slice(plafond) };
}

/**
 * FR : Clés triées de la plus récente à la plus ancienne (ordre d'écriture en mémoire).
 * EN: Keys sorted from most recent to oldest (memory write order).
 * @param {Array<Object>} elements
 * @return {string[]}
 */
function clesDuPlusRecent_(elements) {
  return [...elements].sort((premier, second) => second.date.getTime() - premier.date.getTime()).map((element) => element.cle);
}
