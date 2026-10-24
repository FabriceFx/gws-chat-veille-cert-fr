/**
 * FR : Accès aux services Apps Script et au réseau : propriétés du script, identité du compte, couche HTTP unique
 *      (UrlFetchApp, nouvel essai exponentiel, Retry-After, RM-15), lecture du flux avec suivi manuel des redirections
 *      (RM-1), analyse XML (XmlService, RM-2), POST vers le webhook (RM-16), e-mails (MailApp, RM-17), déclencheurs
 *      (RM-23), verrou (RM-20), scopes (RM-24). Chaque service est appelé au moment de l'exécution, jamais au chargement
 *      du fichier (banc de test). L'URL du webhook n'est jamais journalisée.
 * EN: Apps Script services and network access: script properties, account identity, single HTTP layer (UrlFetchApp,
 *     exponential retry, Retry-After, RM-15), feed read with manual redirect following (RM-1), XML parsing
 *     (XmlService, RM-2), webhook POST (RM-16), e-mails (MailApp, RM-17), triggers (RM-23), lock (RM-20), scopes
 *     (RM-24). Every service is called at run time, never at file load (test bench). The webhook URL is never logged.
 */

// ---------------------------------------------------------------------------
// FR : Propriétés du script et identité. / EN: Script properties and identity.
// ---------------------------------------------------------------------------

/**
 * FR : Propriétés du script.
 * EN: Script properties.
 * @return {GoogleAppsScript.Properties.Properties}
 */
function proprietesScript_() {
  return PropertiesService.getScriptProperties();
}

/**
 * FR : Toutes les propriétés du script en un seul appel (objet nom → valeur). Jamais journalisé tel quel (secret).
 * EN: All script properties in a single call (name → value object). Never logged as is (secret).
 * @return {Object<string, string>}
 */
function lireProprietes_() {
  return proprietesScript_().getProperties() ?? {};
}

/**
 * FR : Écrit une propriété du script (états techniques).
 * EN: Writes a script property (technical states).
 * @param {string} cle FR : clé de CONFIG.CLES_PROPRIETES. EN: CONFIG.CLES_PROPRIETES key.
 * @param {string} valeur
 */
function ecrirePropriete_(cle, valeur) {
  proprietesScript_().setProperty(CONFIG.CLES_PROPRIETES[cle], String(valeur));
}

/**
 * FR : Supprime une propriété du script.
 * EN: Deletes a script property.
 * @param {string} cle FR : clé de CONFIG.CLES_PROPRIETES. EN: CONFIG.CLES_PROPRIETES key.
 */
function supprimerPropriete_(cle) {
  proprietesScript_().deleteProperty(CONFIG.CLES_PROPRIETES[cle]);
}

/**
 * FR : Adresse du compte qui exécute le script (déclencheur : son propriétaire) ; '' si illisible. Sans le scope
 *      userinfo.email (non déclaré, scopes minimaux), Apps Script peut renvoyer '' : ADRESSE_ALERTE est alors requise.
 * EN: Address of the account running the script (trigger: its owner); '' when unreadable. Without the userinfo.email
 *     scope (not declared, minimal scopes), Apps Script may return '': ADRESSE_ALERTE is then required.
 * @return {string}
 */
function adresseExecutant_() {
  try {
    return String(Session.getEffectiveUser().getEmail() ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// FR : HTTP (RM-1, RM-15). / EN: HTTP (RM-1, RM-15).
// ---------------------------------------------------------------------------

/**
 * FR : Délai avant un nouvel essai (fonction pure) : Retry-After en secondes ou date HTTP, plafonné à 30 s ; sinon
 *      attente exponentielle (1 s, 2 s, 4 s).
 * EN: Wait before a retry (pure function): Retry-After in seconds or HTTP date, capped at 30 s; otherwise exponential
 *     wait (1 s, 2 s, 4 s).
 * @param {*} retryAfter
 * @param {number} essai FR : numéro de l'essai qui vient d'échouer (1, 2…). EN: number of the failed attempt.
 * @param {number} maintenantMs
 * @return {number}
 */
function delaiNouvelEssai_(retryAfter, essai, maintenantMs) {
  const exponentiel = CONFIG.NOUVEL_ESSAI.ATTENTE_INITIALE_MS * 2 ** (essai - 1);
  const texte = String(retryAfter ?? '').trim();
  if (!texte) return exponentiel;
  const attenteMs = /^\d+$/.test(texte) ? Number(texte) * 1000 : Date.parse(texte) - maintenantMs;
  if (!Number.isFinite(attenteMs)) return exponentiel;
  return Math.min(Math.max(attenteMs, 0), CONFIG.NOUVEL_ESSAI.RETRY_AFTER_MAX_MS);
}

/**
 * FR : Valeur d'un en-tête de réponse, sans tenir compte de la casse ('' si absent ; premier élément d'une liste).
 * EN: Response header value, case-insensitive ('' when missing; first item of a list).
 * @param {Object<string, *>} entetes
 * @param {string} nom
 * @return {string}
 */
function lireEntete_(entetes, nom) {
  const cle = Object.keys(entetes ?? {}).find((candidat) => candidat.toLowerCase() === nom.toLowerCase());
  if (!cle) return '';
  const valeur = entetes[cle];
  return String(Array.isArray(valeur) ? valeur[0] ?? '' : valeur ?? '');
}

/**
 * FR : Une tentative HTTP : {code, texte, entetes} ; code 0 et « reseau » (masqué) pour une exception (réseau, délai,
 *      liste blanche). Les erreurs HTTP sont rendues sans exception (muteHttpExceptions).
 * EN: One HTTP attempt: {code, texte, entetes}; code 0 and masked "reseau" for an exception (network, timeout, allow
 *     list). HTTP errors are returned without exception (muteHttpExceptions).
 * @param {string} url
 * @param {{method?: string, payload?: string, contentType?: string, followRedirects?: boolean}} [requete]
 * @return {{code: number, texte: string, entetes: Object, reseau?: string}}
 */
function tenterHttp_(url, requete = {}) {
  const options = {
    method: requete.method ?? 'get',
    headers: { 'User-Agent': CONFIG.USER_AGENT },
    muteHttpExceptions: true,
    followRedirects: requete.followRedirects ?? true,
  };
  if (requete.payload !== undefined) Object.assign(options, { payload: requete.payload, contentType: requete.contentType });
  try {
    const reponse = UrlFetchApp.fetch(url, options);
    const entetes = typeof reponse.getAllHeaders === 'function' ? reponse.getAllHeaders() : reponse.getHeaders();
    return { code: reponse.getResponseCode(), texte: reponse.getContentText('UTF-8'), entetes: entetes ?? {} };
  } catch (erreur) {
    return { code: 0, texte: '', entetes: {}, reseau: resumeErreur_(erreur) };
  }
}

/**
 * FR : Appel HTTP avec nouvel essai sur 429, 5xx et erreur réseau / délai (RM-15) : 3 essais, attente exponentielle
 *      ou Retry-After ; les autres codes (2xx, 3xx, 400, 401, 403, 404…) sont rendus au premier essai. Le journal ne
 *      contient que l'hôte, jamais l'URL complète (webhook secret).
 * EN: HTTP call with retry on 429, 5xx and network error / timeout (RM-15): 3 attempts, exponential wait or
 *     Retry-After; other codes are returned at the first attempt. The log only holds the host, never the full URL.
 * @param {string} url
 * @param {Object} [requete] FR : voir tenterHttp_. EN: see tenterHttp_.
 * @return {{code: number, texte: string, entetes: Object, essais: number, reseau?: string}}
 */
function appelerHttp_(url, requete = {}) {
  const essais = CONFIG.NOUVEL_ESSAI.ESSAIS;
  let reponse = { code: 0, texte: '', entetes: {} };
  for (let essai = 1; essai <= essais; essai++) {
    reponse = tenterHttp_(url, requete);
    const transitoire = reponse.code === 0 || reponse.code === 429 || reponse.code >= 500;
    if (!transitoire || essai >= essais) return { ...reponse, essais: essai };
    const attenteMs = delaiNouvelEssai_(lireEntete_(reponse.entetes, 'Retry-After'), essai, maintenant_().getTime());
    console.warn(tBilingue_('journalNouvelEssai', essai, reponse.reseau || `HTTP ${reponse.code} — ${hoteUrl_(url)}`, attenteMs));
    Utilities.sleep(attenteMs);
  }
  return { ...reponse, essais };
}

/**
 * FR : Lit le flux en GET en suivant à la main les redirections (au plus REDIRECTIONS_MAX) pour connaître l'URL
 *      finale (résolution des liens relatifs, diagnostic, RM-1, RM-24).
 * EN: Reads the feed with GET, following redirects manually (at most REDIRECTIONS_MAX) to know the final URL (relative
 *     link resolution, diagnostic, RM-1, RM-24).
 * @param {string} urlDepart
 * @return {{code: number, texte: string, essais: number, urlFinale: string, redirections: string[], reseau?: string}}
 */
function lireFlux_(urlDepart) {
  const redirections = [];
  let url = urlDepart;
  for (let saut = 0; saut <= CONFIG.REDIRECTIONS_MAX; saut++) {
    const reponse = appelerHttp_(url, { followRedirects: false });
    if (![301, 302, 303, 307, 308].includes(reponse.code)) return { ...reponse, urlFinale: url, redirections };
    const suivante = urlAbsolue_(lireEntete_(reponse.entetes, 'Location'), url);
    if (!suivante) break;
    redirections.push(suivante);
    url = suivante;
  }
  return { code: 0, texte: '', entetes: {}, essais: 1, urlFinale: url, redirections, reseau: tBilingue_('erreurRedirections') };
}

/**
 * FR : POST JSON vers le webhook Chat (RM-13, RM-16). Pas de threadKey (RM-14). L'URL n'est jamais journalisée.
 * EN: JSON POST to the Chat webhook (RM-13, RM-16). No threadKey (RM-14). The URL is never logged.
 * @param {string} urlWebhook
 * @param {Object} charge FR : message (text + cardsV2). EN: message (text + cardsV2).
 * @return {{code: number, texte: string, essais: number, reseau?: string}}
 */
function posterWebhook_(urlWebhook, charge) {
  return appelerHttp_(urlWebhook, {
    method: 'post',
    payload: JSON.stringify(charge),
    contentType: 'application/json; charset=UTF-8',
  });
}

// ---------------------------------------------------------------------------
// FR : Analyse XML du flux (RM-2). / EN: Feed XML parsing (RM-2).
// ---------------------------------------------------------------------------

/**
 * FR : Texte d'un enfant d'un élément XML (nom local, espace de noms facultatif) ; '' si absent.
 * EN: Text of a child of an XML element (local name, optional namespace); '' when missing.
 * @param {GoogleAppsScript.XML_Service.Element} element
 * @param {string} nom
 * @param {GoogleAppsScript.XML_Service.Namespace} [espace]
 * @return {string}
 */
function texteEnfantXml_(element, nom, espace) {
  const enfant = espace ? element.getChild(nom, espace) : element.getChild(nom);
  return enfant ? String(enfant.getText() ?? '').trim() : '';
}

/**
 * FR : Analyse un flux RSS 2.0 avec XmlService. Renvoie la racine, la version et les items bruts {titre, lien, guid,
 *      dateTexte, description, etiquettes}. Lève une erreur si le XML est illisible ou si la racine n'est pas
 *      rss/channel ; dans ce dernier cas, erreur.messageNeutre = { cle: 'erreurRacine', parametres: [racine] }. BOM et espaces initiaux retirés (XmlService les refuse).
 * EN: Parses an RSS 2.0 feed with XmlService. Returns the root, the version and the raw items. Throws an error (short
 *     when the XML is unreadable or the root is not rss/channel; in the latter case, erreur.messageNeutre =
 *     { cle: 'erreurRacine', parametres: [root] }. BOM and leading spaces removed.
 * @param {string} texteXml
 * @return {{racine: string, version: string, items: Array<Object>}}
 */
function analyserXmlRss_(texteXml) {
  const nettoye = String(texteXml ?? '').replace(/^\uFEFF/, '').trimStart();
  const racine = XmlService.parse(nettoye).getRootElement();
  const nomRacine = racine.getName();
  const canal = nomRacine === 'rss' ? racine.getChild('channel') : null;
  if (!canal) {
    // FR : message neutre (clé + paramètres), traduit à l'affichage. / EN: neutral message (key + parameters), translated on display.
    const erreur = new Error(`<${nomRacine}>`);
    erreur.messageNeutre = { cle: 'erreurRacine', parametres: [nomRacine] };
    throw erreur;
  }
  const espaceDc = XmlService.getNamespace('http://purl.org/dc/elements/1.1/');
  const espaceContenu = XmlService.getNamespace('http://purl.org/rss/1.0/modules/content/');
  const items = canal.getChildren('item').map((item) => ({
    titre: texteEnfantXml_(item, 'title'),
    lien: texteEnfantXml_(item, 'link'),
    guid: texteEnfantXml_(item, 'guid'),
    dateTexte: texteEnfantXml_(item, 'pubDate') || texteEnfantXml_(item, 'date', espaceDc),
    description: texteEnfantXml_(item, 'description') || texteEnfantXml_(item, 'encoded', espaceContenu),
    etiquettes: item.getChildren('category').map((categorie) => String(categorie.getText() ?? '').trim()).filter(Boolean),
  }));
  return { racine: nomRacine, version: racine.getAttribute('version')?.getValue() ?? '', items };
}

// ---------------------------------------------------------------------------
// FR : E-mails, déclencheurs, verrou, scopes. / EN: E-mails, triggers, lock, scopes.
// ---------------------------------------------------------------------------

/**
 * FR : Envoie un e-mail d'alerte (MailApp, RM-17) : HTML et texte brut, nom d'expéditeur traduit.
 * EN: Sends an alert e-mail (MailApp, RM-17): HTML and plain text, translated sender name.
 * @param {{destinataire: string, objet: string, html: string, texte: string, langue: string}} email
 */
function envoyerEmail_({ destinataire, objet, html, texte, langue }) {
  MailApp.sendEmail({ to: destinataire, subject: objet, body: texte, htmlBody: html, name: t_('mailExpediteur', langue) });
}

/**
 * FR : Déclencheurs du projet attachés à une fonction.
 * EN: Project triggers attached to a function.
 * @param {string} nomFonction
 * @return {GoogleAppsScript.Script.Trigger[]}
 */
function declencheursDe_(nomFonction) {
  return ScriptApp.getProjectTriggers().filter((declencheur) => declencheur.getHandlerFunction() === nomFonction);
}

/**
 * FR : Supprime tous les déclencheurs d'une fonction ; renvoie leur nombre.
 * EN: Deletes every trigger of a function; returns how many.
 * @param {string} nomFonction
 * @return {number}
 */
function supprimerDeclencheurs_(nomFonction) {
  const declencheurs = declencheursDe_(nomFonction);
  declencheurs.forEach((declencheur) => ScriptApp.deleteTrigger(declencheur));
  return declencheurs.length;
}

/**
 * FR : Crée le déclencheur horaire sur relever (RM-23, D-3).
 * EN: Creates the hourly trigger on relever (RM-23, D-3).
 */
function creerDeclencheurHoraire_() {
  ScriptApp.newTrigger(CONFIG.FONCTION_DECLENCHEUR).timeBased().everyHours(CONFIG.INTERVALLE_HEURES).create();
}

/**
 * FR : Exécute une fonction sous le verrou du script (RM-20, attente 30 s) ; renvoie { obtenu: false } si occupé.
 * EN: Runs a function under the script lock (RM-20, 30 s wait); returns { obtenu: false } when busy.
 * @param {Function} fonction
 * @return {{obtenu: boolean, valeur?: *}}
 */
function sousVerrou_(fonction) {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(CONFIG.ATTENTE_VERROU_MS)) return { obtenu: false };
  try {
    return { obtenu: true, valeur: fonction() };
  } finally {
    verrou.releaseLock();
  }
}

/**
 * FR : Scopes OAuth accordés au script (noms courts) ; null si illisibles (RM-24).
 * EN: OAuth scopes granted to the script (short names); null when unreadable (RM-24).
 * @return {?string[]}
 */
function scopesAccordes_() {
  try {
    const scopes = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizedScopes();
    return (scopes ?? []).map((scope) => String(scope).replace('https://www.googleapis.com/auth/', ''));
  } catch {
    return null;
  }
}
