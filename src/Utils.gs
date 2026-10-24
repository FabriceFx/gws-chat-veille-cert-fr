/**
 * FR : Utilitaires génériques : horloge, dates, textes (entités, balises, troncature, échappement), masquage des
 *      secrets, taille UTF-8, JSON tolérant, entiers, garde de temps, URL. Aucune logique métier ni appel réseau.
 *      Fonctions pures sauf mention (horloge, Utilities).
 * EN: Generic helpers: clock, dates, texts (entities, tags, truncation, escaping), secret masking, UTF-8 size,
 *     tolerant JSON, integers, time guard, URLs. No business logic and no network call. Pure functions unless stated
 *     (clock, Utilities).
 */

/**
 * FR : Instant courant. Point unique pour que le banc de test fixe l'horloge.
 * EN: Current instant. Single entry point so the test bench can pin the clock.
 * @return {Date}
 */
function maintenant_() {
  return new Date();
}

/**
 * FR : Formate un instant dans le fuseau du projet (« jj/mm/aaaa hh:mm » par défaut).
 * EN: Formats an instant in the project time zone ("dd/mm/yyyy hh:mm" by default).
 * @param {Date} date
 * @param {string} [format]
 * @return {string}
 */
function formaterInstant_(date, format = CONFIG.FORMAT_DATE_HEURE) {
  return Utilities.formatDate(date, CONFIG.FUSEAU, format);
}

/**
 * FR : Date affichée à partir d'un ISO stocké ; texte de repli si vide ou illisible.
 * EN: Displayed date from a stored ISO string; fallback text when empty or unreadable.
 * @param {string} iso
 * @param {string} repli
 * @return {string}
 */
function afficherIso_(iso, repli) {
  const date = dateDepuisIso_(iso);
  return date ? formaterInstant_(date) : repli;
}

/**
 * FR : Objet Date depuis un ISO stocké ; null si vide ou illisible.
 * EN: Date object from a stored ISO string; null when empty or unreadable.
 * @param {*} iso
 * @return {?Date}
 */
function dateDepuisIso_(iso) {
  if (!iso) return null;
  const ms = Date.parse(String(iso));
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * FR : Analyse une date de flux (RFC 822 de pubDate, ou ISO 8601 de dc:date) ; null si illisible ou hors bornes.
 * EN: Parses a feed date (RFC 822 pubDate, or ISO 8601 dc:date); null when unreadable or out of range.
 * @param {*} texte
 * @return {?Date}
 */
function analyserDateFlux_(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return null;
  // FR : « UT » et fuseaux nommés courants que Date.parse ne lit pas toujours. / EN: "UT" and named zones not always parsed.
  const corrige = brut.replace(/\bUT$/i, 'GMT').replace(/\b(CEST)$/i, '+0200').replace(/\b(CET)$/i, '+0100');
  const ms = Date.parse(corrige);
  if (!Number.isFinite(ms)) return null;
  const annee = new Date(ms).getUTCFullYear();
  return annee >= 1990 && annee <= 2999 ? new Date(ms) : null;
}

/**
 * FR : Secondes écoulées depuis un instant (ms).
 * EN: Seconds elapsed since an instant (ms).
 * @param {number} debutMs
 * @return {number}
 */
function secondesEcoulees_(debutMs) {
  return Math.round((maintenant_().getTime() - debutMs) / 1000);
}

/**
 * FR : Vrai si l'étape suivante (marge) dépasserait la durée maximale de l'exécution (garde de temps, RM-20).
 * EN: True when the next step (margin) would exceed the run's maximum duration (time guard, RM-20).
 * @param {number} debutMs
 * @param {number} margeMs
 * @return {boolean}
 */
function gardeTemps_(debutMs, margeMs) {
  return maintenant_().getTime() - debutMs + margeMs > CONFIG.DUREE_MAX_MS;
}

/**
 * FR : Pire cas d'un POST (garde de temps, RM-20) : pause entre messages + attentes de nouvel essai plafonnées +
 *      durée maximale de chaque essai (voir CONFIG.DUREE_APPEL_MAX_MS).
 * EN: Worst case of one POST (time guard, RM-20): pause between messages + capped retry waits + maximum duration of
 *     each attempt (see CONFIG.DUREE_APPEL_MAX_MS).
 * @return {number}
 */
function margePublicationMs_() {
  const { ESSAIS, RETRY_AFTER_MAX_MS } = CONFIG.NOUVEL_ESSAI;
  return CONFIG.PAUSE_ENTRE_MESSAGES_MS + (ESSAIS - 1) * RETRY_AFTER_MAX_MS + ESSAIS * CONFIG.DUREE_APPEL_MAX_MS;
}

/**
 * FR : Décode les entités HTML courantes (nommées, décimales, hexadécimales).
 * EN: Decodes common HTML entities (named, decimal, hexadecimal).
 * @param {*} texte
 * @return {string}
 */
function decoderEntites_(texte) {
  const nommees = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’',
    lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à',
    acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', deg: '°',
    Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç',
  };
  const point = (code) => {
    const nombre = Number(code);
    return Number.isInteger(nombre) && nombre > 0 && nombre <= 0x10ffff ? String.fromCodePoint(nombre) : '';
  };
  return String(texte ?? '')
    .replace(/&#(\d+);/g, (_, code) => point(code))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => point(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entite, nom) => nommees[nom] ?? nommees[nom.toLowerCase()] ?? entite);
}

/**
 * FR : Texte brut d'un fragment HTML (RM-4) : balises retirées d'abord, puis entités décodées, espaces normalisés.
 *      Ainsi un « &lt;b&gt; » échappé dans le flux reste un texte « <b> » (échappé ensuite à l'affichage).
 * EN: Plain text of an HTML fragment (RM-4): tags removed first, then entities decoded, spaces collapsed. An escaped
 *     "&lt;b&gt;" in the feed thus stays a "<b>" text (escaped later on display).
 * @param {*} html
 * @return {string}
 */
function texteDepuisHtml_(html) {
  const sansBalises = String(html ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ');
  return decoderEntites_(sansBalises).replace(/[\s\u00a0\u202f]+/g, ' ').trim();
}

/**
 * FR : Tronque un texte à une longueur maximale, « … » compris, en coupant de préférence à un mot.
 * EN: Truncates a text to a maximum length, "…" included, preferably at a word boundary.
 * @param {*} texte
 * @param {number} longueurMax
 * @return {string}
 */
function tronquer_(texte, longueurMax) {
  const plat = String(texte ?? '');
  const caracteres = Array.from(plat);
  if (caracteres.length <= longueurMax) return plat;
  const coupe = caracteres.slice(0, longueurMax - 1).join('');
  const dernierEspace = coupe.lastIndexOf(' ');
  const base = dernierEspace > (longueurMax * 2) / 3 ? coupe.slice(0, dernierEspace) : coupe;
  return `${base.trimEnd()}…`;
}

/**
 * FR : Échappe une valeur pour le HTML restreint de Chat (RM-13) : « & », « < », « > ».
 * EN: Escapes a value for Chat's restricted HTML (RM-13): "&", "<", ">".
 * @param {*} valeur
 * @return {string}
 */
function echapperChat_(valeur) {
  return String(valeur ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * FR : Échappe une valeur pour un e-mail HTML (guillemets compris).
 * EN: Escapes a value for an HTML e-mail (quotes included).
 * @param {*} valeur
 * @return {string}
 */
function echapperHtml_(valeur) {
  return echapperChat_(valeur).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * FR : Masque les secrets d'un texte avant journal ou e-mail (RM-22) : paramètres key / token d'une URL → « *** »,
 *      identifiant d'espace Chat → « *** », adresses e-mail → « [e-mail] » ; retours à la ligne supprimés.
 * EN: Masks secrets in a text before logging or e-mailing (RM-22): URL key / token parameters → "***", Chat space id →
 *     "***", e-mail addresses → "[e-mail]"; line breaks removed.
 * @param {*} texte
 * @return {string}
 */
function masquerTexte_(texte) {
  return String(texte ?? '')
    .replace(/([?&](?:key|token)=)[^&\s"'<>]*/gi, '$1***')
    .replace(/(spaces\/)[^/?\s"'<>,]+/gi, '$1***')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[e-mail]')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FR : URL masquée pour affichage (webhook : « https://chat.googleapis.com/v1/spaces/*** ») ; '' si vide.
 * EN: Masked URL for display (webhook: "https://chat.googleapis.com/v1/spaces/***"); '' when empty.
 * @param {*} url
 * @return {string}
 */
function masquerUrl_(url) {
  const texte = String(url ?? '').trim();
  if (!texte) return '';
  if (texte.toLowerCase().startsWith(CONFIG.PREFIXE_WEBHOOK)) return `${CONFIG.PREFIXE_WEBHOOK}***`;
  return masquerTexte_(texte);
}

/**
 * FR : Résumé journalisable d'une erreur : « Type · message masqué » (200 caractères).
 * EN: Loggable summary of an error: "Type · masked message" (200 characters).
 * @param {*} erreur
 * @return {string}
 */
function resumeErreur_(erreur) {
  const type = erreur?.name || typeof erreur;
  const message = masquerTexte_(erreur?.message ?? erreur);
  return `${type} · ${message}`.slice(0, 200);
}

/**
 * FR : Résumé d'une erreur imprévue : resumeErreur_ suivi des seuls noms de fonctions de la pile.
 * EN: Summary of an unexpected error: resumeErreur_ followed by the stack's function names only.
 * @param {*} erreur
 * @return {string}
 */
function resumePile_(erreur) {
  const fonctions = [...String(erreur?.stack ?? '').matchAll(/^\s*at (?:new )?([\w$.]+) \(/gm)].map((trouve) => trouve[1]);
  return [resumeErreur_(erreur), fonctions.length ? `pile/stack : ${fonctions.slice(0, 8).join(' < ')}` : ''].filter(Boolean).join(' · ');
}

/**
 * FR : Taille en octets UTF-8 d'un texte (contrôle de la taille des messages, fonction pure).
 * EN: UTF-8 byte size of a text (message size check, pure function).
 * @param {*} texte
 * @return {number}
 */
function octetsUtf8_(texte) {
  let total = 0;
  for (const caractere of String(texte ?? '')) {
    const code = caractere.codePointAt(0);
    if (code < 0x80) total += 1;
    else if (code < 0x800) total += 2;
    else if (code < 0x10000) total += 3;
    else total += 4;
  }
  return total;
}

/**
 * FR : Lit un JSON tolérant : valeur par défaut si le texte est vide ou illisible.
 * EN: Tolerant JSON read: default value when the text is empty or unreadable.
 * @param {*} texte
 * @param {*} defaut
 * @return {*}
 */
function lireJson_(texte, defaut) {
  if (!texte) return defaut;
  try {
    return JSON.parse(texte);
  } catch {
    return defaut;
  }
}

/**
 * FR : Entier strictement positif lu dans une propriété ; null si absent ou invalide (RM-26).
 * EN: Strictly positive integer read from a property; null when missing or invalid (RM-26).
 * @param {*} valeur
 * @return {?number}
 */
function entierPositif_(valeur) {
  const texte = String(valeur ?? '').trim();
  if (!/^\d+$/.test(texte)) return null;
  const nombre = Number(texte);
  return Number.isSafeInteger(nombre) && nombre >= 1 ? nombre : null;
}

/**
 * FR : Vrai si la valeur ressemble à une adresse e-mail.
 * EN: True when the value looks like an e-mail address.
 * @param {*} adresse
 * @return {boolean}
 */
function estAdresseEmail_(adresse) {
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(String(adresse ?? ''));
}

/**
 * FR : Hôte d'une URL en minuscules, '' si illisible.
 * EN: Lower-case host of a URL, '' when unreadable.
 * @param {*} url
 * @return {string}
 */
function hoteUrl_(url) {
  return (/^[a-z][a-z\d+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i.exec(String(url ?? '').trim())?.[1] ?? '').toLowerCase();
}

/**
 * FR : URL absolue à partir d'un lien éventuellement relatif (« /avis/… » → « https://hote/avis/… ») ; '' si impossible.
 * EN: Absolute URL from a possibly relative link ("/avis/…" → "https://host/avis/…"); '' when impossible.
 * @param {*} lien
 * @param {string} urlBase
 * @return {string}
 */
function urlAbsolue_(lien, urlBase) {
  const texte = String(lien ?? '').trim();
  if (!texte) return '';
  if (/^https?:\/\//i.test(texte)) return texte;
  const origine = /^(https?:\/\/[^/?#]+)/i.exec(String(urlBase ?? ''))?.[1] ?? '';
  if (!origine) return '';
  if (texte.startsWith('//')) return `https:${texte}`;
  if (texte.startsWith('/')) return `${origine}${texte}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(texte)) return '';
  return `${String(urlBase).replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/')}${texte}`;
}
