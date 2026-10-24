'use strict';

/**
 * FR : Banc de test Node du projet « gws-chat-veille-cert-fr » (veille CERT-FR publiée dans un espace Google Chat).
 *      Charge les fichiers src/*.gs dans un contexte vm avec des simulations fidèles des services Apps Script utilisés :
 *      UrlFetchApp (flux RSS CERT-FR fictif, redirections 301-308 avec Location, webhook Chat entrant qui enregistre
 *      chaque POST et répond 200 / 400 / 401 / 403 / 404 / 429 avec Retry-After / 5xx / exception réseau, liste blanche
 *      urlFetchWhitelist du manifeste), XmlService (analyseur XML strict avec espaces de noms), PropertiesService
 *      (limite de 9 Ko par valeur), LockService, ScriptApp (déclencheurs, scopes accordés), MailApp, Session, Utilities
 *      (formatDate, sleep qui avance l'horloge). Chaque appel simulé exige le scope correspondant du manifeste et lève,
 *      sinon, l'erreur réelle d'Apps Script. Horloge contrôlée (maintenant_), journal capturé (console).
 *      Aucun appel réseau, aucune dépendance npm, données fictives seulement (références CERTFR-2099-…,
 *      prenom.nom@exemple.test, ID d'espace, clé et jeton de webhook inventés).
 *      Lancement : node tests/banc.js [--verbeux] [--seul=<texte>]   (ou npm test à la racine du dépôt)
 * EN: Node test bench of the "gws-chat-veille-cert-fr" project (CERT-FR watch posted to a Google Chat space).
 *     Loads src/*.gs into a vm context with faithful simulations of the Apps Script services in use: UrlFetchApp
 *     (fictitious CERT-FR RSS feed, 301-308 redirects with Location, incoming Chat webhook recording every POST and
 *     answering 200 / 400 / 401 / 403 / 404 / 429 with Retry-After / 5xx / network exception, manifest
 *     urlFetchWhitelist), XmlService (strict XML parser with namespaces), PropertiesService (9 KB per value),
 *     LockService, ScriptApp (triggers, granted scopes), MailApp, Session, Utilities (formatDate, sleep advancing the
 *     clock). Every simulated call requires the matching manifest scope and otherwise throws the real Apps Script
 *     error. Controlled clock (maintenant_), captured log (console).
 *     No network call, no npm dependency, fake data only.
 *     Run: node tests/banc.js [--verbeux] [--seul=<text>]   (or npm test at the repository root)
 */
process.env.TZ = 'Europe/Paris';

const vm = require('node:vm');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOSSIER_SRC = path.join(__dirname, '..', 'src');
// FR : ordre de chargement explicite (pas de Classeur.gs : script autonome) / EN: explicit load order (standalone script)
const ORDRE_FICHIERS = Object.freeze([
  'Config.gs', 'I18n.gs', 'Utils.gs', 'Services.gs', 'Main.gs', 'Tests.gs',
  'Analyse.gs', 'Cartes.gs', 'Alertes.gs', 'Traitement.gs', 'Publication.gs', 'Diagnostic.gs',
]);
const VERBEUX = process.argv.includes('--verbeux');

/* ======================= CONFIGURATION DU BANC ======================= */

/**
 * FR : Le banc impose sa configuration (valeurs du cadrage et du design) : les tests ne dépendent jamais des réglages de
 *      production. Fusion profonde dans CONFIG (les objets imbriqués non cités gardent leurs autres clés).
 * EN: The bench enforces its configuration (scoping and design values): tests never depend on production settings.
 */
const SURCHARGE_CONFIG = Object.freeze({
  DRY_RUN: true,
  LANGUE_DEFAUT: 'fr',
  FUSEAU: 'Europe/Paris',
  FORMAT_DATE_HEURE: 'dd/MM/yyyy HH:mm',
  URL_FLUX: 'https://cert.cyber.gouv.fr/feed/',
  PREFIXE_WEBHOOK: 'https://chat.googleapis.com/v1/spaces/',
  REGLAGES: { AGE_MAX_JOURS: 7, MAX_PUBLICATIONS_PAR_EXECUTION: 20, MEMOIRE_MAX: 300, SEUIL_ECHEC_HEURES: 6, SEUIL_SILENCE_JOURS: 5 },
  RESUME_MAX: 300,
  TEXTE_MAX: 4000,
  PAUSE_ENTRE_MESSAGES_MS: 1100,
  NOUVEL_ESSAI: { ESSAIS: 3, ATTENTE_INITIALE_MS: 1000, RETRY_AFTER_MAX_MS: 30000 },
  ATTENTE_VERROU_MS: 30000,
  DUREE_MAX_MS: 5 * 60 * 1000,
  DUREE_APPEL_MAX_MS: 30000,
  DELAI_REPETITION_ALERTE_MS: 24 * 3600 * 1000,
  FONCTION_DECLENCHEUR: 'relever',
  INTERVALLE_HEURES: 1,
});

const HEURE = 3600 * 1000;
const JOUR = 24 * HEURE;
const MAINTENANT_DEFAUT = '2026-10-22T10:00:00'; // FR : heure de Paris (UTC+2) / EN: Paris time (UTC+2)
const MS_MAINTENANT = Date.parse(MAINTENANT_DEFAUT);
const RESPONSABLE = 'prenom.nom@exemple.test';
const PROPRIETAIRE = 'apps-script.fictif@exemple.test';
const ID_ESPACE = 'ESPACE-FICTIF-0001';
const CLE_WEBHOOK = 'CLE-FICTIVE-0123';
const JETON_WEBHOOK = 'JETON-FICTIF-4567';
const URL_WEBHOOK = `https://chat.googleapis.com/v1/spaces/${ID_ESPACE}/messages?key=${CLE_WEBHOOK}&token=${JETON_WEBHOOK}`;
const URL_FLUX = 'https://cert.cyber.gouv.fr/feed/';
const URL_ANCIEN_FLUX = 'https://www.cert.ssi.gouv.fr/feed/';
const MANIFESTE = Object.freeze(JSON.parse(fs.readFileSync(path.join(DOSSIER_SRC, 'appsscript.json'), 'utf8')));
const SCOPE = (nom) => `https://www.googleapis.com/auth/${nom}`;
// FR : scopes attendus (cadrage §6) / EN: expected scopes (scoping §6)
const SCOPES_ATTENDUS = Object.freeze(['script.external_request', 'script.scriptapp', 'script.send_mail'].map(SCOPE));

/**
 * FR : Table « service simulé → scope(s) requis » : un seul suffit parmi ceux listés.
 * EN: "simulated service → required scope(s)" table: any one of the listed scopes suffices.
 */
const SCOPES_REQUIS = Object.freeze({
  'Session.getActiveUser': [SCOPE('userinfo.email')],
  'Session.getEffectiveUser': [SCOPE('userinfo.email')],
  'UrlFetchApp.fetch': [SCOPE('script.external_request')],
  'MailApp.sendEmail': [SCOPE('script.send_mail')],
  'ScriptApp.newTrigger': [SCOPE('script.scriptapp')],
  'ScriptApp.getProjectTriggers': [SCOPE('script.scriptapp')],
  'ScriptApp.deleteTrigger': [SCOPE('script.scriptapp')],
});

/** FR : sources .gs / EN: .gs sources */
function sources() {
  return fs.readdirSync(DOSSIER_SRC).filter((nom) => nom.endsWith('.gs')).map((nom) => ({ nom, code: fs.readFileSync(path.join(DOSSIER_SRC, nom), 'utf8') }));
}

/** FR : exception telle qu'Apps Script la lève (name « Exception ») / EN: exception as Apps Script throws it */
function exceptionAppsScript(message) {
  const erreur = new Error(String(message).replace(/^Exception:\s*/, ''));
  erreur.name = 'Exception';
  return erreur;
}

/** FR : lève l'erreur réelle d'Apps Script si le manifeste n'accorde pas le scope / EN: throws the real Apps Script error */
function exigerScope(etat, service) {
  const requis = SCOPES_REQUIS[service];
  assert.ok(requis, `service sans scope connu / service without known scope : ${service}`);
  if (requis.some((scope) => etat.scopes.includes(scope))) return;
  throw exceptionAppsScript(`Les autorisations spécifiées ne sont pas suffisantes pour appeler ${service}. Autorisations requises : ${requis[0]}`);
}

/**
 * FR : Formate une date comme Utilities.formatDate (jetons yyyy, MM, dd, HH, mm, ss), par Intl, indépendamment du code.
 * EN: Formats a date like Utilities.formatDate (yyyy, MM, dd, HH, mm, ss tokens), through Intl, independently of the code.
 */
function formaterDate(date, fuseau, format) {
  const parties = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(date.getTime())).map((partie) => [partie.type, partie.value]));
  const jetons = { yyyy: parties.year, MM: parties.month, dd: parties.day, HH: parties.hour, mm: parties.minute, ss: parties.second };
  return String(format).replace(/yyyy|MM|dd|HH|mm|ss/g, (jeton) => jetons[jeton]);
}

/** FR : date « jj/mm/aaaa hh:mm » à Paris d'un instant (ms) / EN: Paris "dd/mm/yyyy hh:mm" date of an instant (ms) */
function dateParis(ms) {
  return formaterDate(new Date(ms), 'Europe/Paris', 'dd/MM/yyyy HH:mm');
}

/* ======================= ANALYSE DU CODE SOURCE (syntaxe Apps Script) ======================= */


/**
 * FR : Masque (par des espaces, sauts de ligne conservés) les commentaires, chaînes, textes de gabarits et expressions
 *      régulières littérales d'un code source ; le code des expressions ${…} des gabarits est gardé. Analyseur minimal,
 *      sans dépendance, suffisant pour repérer une syntaxe dans le code exécutable seulement.
 * EN: Masks comments, strings, template text and regex literals (line breaks kept); ${…} code is kept. Minimal scanner.
 */
function masquerTextes(source) {
  const sortie = source.split('');
  const longueur = source.length;
  const blanchir = (debut, fin) => { for (let curseur = debut; curseur < fin && curseur < longueur; curseur++) if (sortie[curseur] !== '\n') sortie[curseur] = ' '; };
  const MOTS_AVANT_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
  const pile = [];
  let precedent = '';
  let dernierMot = '';
  const lireGabarit = (debut) => {
    let curseur = debut;
    while (curseur < longueur) {
      if (source[curseur] === '\\') { curseur += 2; continue; }
      if (source[curseur] === '`') { blanchir(debut, curseur); return { fin: curseur + 1, ouvert: false }; }
      if (source[curseur] === '$' && source[curseur + 1] === '{') { blanchir(debut, curseur); pile.push(0); return { fin: curseur + 2, ouvert: true }; }
      curseur++;
    }
    blanchir(debut, longueur);
    return { fin: longueur, ouvert: false };
  };
  const apresGabarit = ({ fin, ouvert }) => { precedent = ouvert ? '{' : 'a'; dernierMot = ''; return fin; };
  let i = 0;
  while (i < longueur) {
    const car = source[i];
    const suivant = source[i + 1];
    if (car === '/' && suivant === '/') {
      const fin = source.indexOf('\n', i) < 0 ? longueur : source.indexOf('\n', i);
      blanchir(i, fin);
      i = fin;
    } else if (car === '/' && suivant === '*') {
      const fin = source.indexOf('*/', i + 2) < 0 ? longueur : source.indexOf('*/', i + 2) + 2;
      blanchir(i, fin);
      i = fin;
    } else if (car === "'" || car === '"') {
      let curseur = i + 1;
      while (curseur < longueur && source[curseur] !== car && source[curseur] !== '\n') curseur += source[curseur] === '\\' ? 2 : 1;
      blanchir(i, curseur + 1);
      i = curseur + 1;
      precedent = 'a';
      dernierMot = '';
    } else if (car === '`') {
      i = apresGabarit(lireGabarit(i + 1));
    } else if (car === '}' && pile.length && pile[pile.length - 1] === 0) {
      pile.pop();
      i = apresGabarit(lireGabarit(i + 1));
    } else if (car === '/' && (!precedent || /[(,=:[!&|?{};+\-*%<>~^]/.test(precedent) || (MOTS_AVANT_REGEX.has(dernierMot) && /\w/.test(precedent)))) {
      let curseur = i + 1;
      let classe = false;
      while (curseur < longueur && source[curseur] !== '\n') {
        if (source[curseur] === '\\') { curseur += 2; continue; }
        if (source[curseur] === '[') classe = true;
        else if (source[curseur] === ']') classe = false;
        else if (source[curseur] === '/' && !classe) break;
        curseur++;
      }
      curseur++;
      while (curseur < longueur && /[a-z]/i.test(source[curseur])) curseur++;
      blanchir(i, curseur);
      i = curseur;
      precedent = 'a';
      dernierMot = '';
    } else if (/[\w$]/.test(car)) {
      let curseur = i;
      while (curseur < longueur && /[\w$]/.test(source[curseur])) curseur++;
      dernierMot = source.slice(i, curseur);
      precedent = source[curseur - 1];
      i = curseur;
    } else {
      if (car === '{' && pile.length) pile[pile.length - 1]++;
      if (car === '}' && pile.length) pile[pile.length - 1]--;
      if (!/\s/.test(car)) { precedent = car; dernierMot = ''; }
      i++;
    }
  }
  return sortie.join('');
}

/** FR : syntaxes postérieures à ES2020 refusées par l'analyseur d'Apps Script / EN: post-ES2020 syntaxes refused by Apps Script */
const SYNTAXES_REFUSEES = Object.freeze([
  ['affectation logique (||=, &&=, ??=) — ES2021', /\|\|=|&&=|\?\?=/],
  ['séparateur numérique (1_000) — ES2021', /(?<![\w$])(?:0[xXbBoO][\da-fA-F]*_[\da-fA-F]|\d[\d.]*_\d)/],
  ['champ privé de classe (#nom) — ES2022', /(?<![\w$])#[A-Za-z_$]/],
  ['bloc statique de classe (static {) — ES2022', /\bstatic\s*\{/],
]);

/** FR : relevés « fichier:ligne — syntaxe — extrait » d'un code source / EN: "file:line — syntax — excerpt" findings */
function syntaxesPosterieuresEs2020(nom, source) {
  const lignesCode = masquerTextes(source).split('\n');
  const lignesSource = source.split('\n');
  const releves = [];
  lignesCode.forEach((ligne, index) => {
    for (const [syntaxe, motif] of SYNTAXES_REFUSEES) {
      if (motif.test(ligne)) releves.push(`${nom}:${index + 1} — ${syntaxe} — ${lignesSource[index].trim().slice(0, 120)}`);
    }
  });
  return releves;
}

/* ======================= SIMULATION DE XmlService ======================= */

/**
 * FR : Analyseur XML minimal et strict (comme XmlService.parse) : prologue, commentaires, instructions, CDATA, entités XML
 *      (les 5 prédéfinies et numériques ; toute autre entité ou « & » isolé est refusé), espaces de noms (xmlns, xmlns:p),
 *      balises mal fermées refusées. Renvoie le nœud racine { prefixe, local, uri, attributs, enfants }.
 * EN: Minimal strict XML parser (like XmlService.parse): prolog, comments, PIs, CDATA, XML entities (5 predefined and
 *     numeric; any other entity or lone "&" refused), namespaces, badly closed tags refused.
 */
function analyserXml(texte) {
  const source = String(texte ?? '').replace(/^\uFEFF/, '');
  let pos = 0;
  const echouer = (message) => { throw exceptionAppsScript(`Error on line ${source.slice(0, pos).split('\n').length}: ${message}`); };
  const ENTITES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  const decoder = (brut) => {
    if (/&(?!(?:#x[0-9a-fA-F]+|#\d+|[A-Za-z][\w.-]*);)/.test(brut)) echouer("The entity name must immediately follow the '&' in the entity reference.");
    return brut.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][\w.-]*);/g, (_, nom) => {
      if (nom.startsWith('#x')) return String.fromCodePoint(parseInt(nom.slice(2), 16));
      if (nom.startsWith('#')) return String.fromCodePoint(Number(nom.slice(1)));
      if (!(nom in ENTITES)) echouer(`The entity "${nom}" was referenced, but not declared.`);
      return ENTITES[nom];
    });
  };
  const sauterBlancs = () => { while (pos < source.length && /\s/.test(source[pos])) pos++; };
  const sauterJusqua = (fin, message) => {
    const index = source.indexOf(fin, pos);
    if (index < 0) echouer(message);
    pos = index + fin.length;
  };
  const sauterDivers = () => {
    for (;;) {
      sauterBlancs();
      if (source.startsWith('<?', pos)) sauterJusqua('?>', 'XML document structures must start and end within the same entity.');
      else if (source.startsWith('<!--', pos)) sauterJusqua('-->', 'XML document structures must start and end within the same entity.');
      else if (source.startsWith('<!DOCTYPE', pos)) sauterJusqua('>', 'DOCTYPE non fermé / unclosed DOCTYPE.');
      else return;
    }
  };
  const lireNom = () => {
    const trouve = /^[A-Za-z_][\w.:-]*/.exec(source.slice(pos));
    if (!trouve) echouer('The markup in the document following the root element must be well-formed.');
    pos += trouve[0].length;
    return trouve[0];
  };
  const separer = (nom) => (nom.includes(':') ? [nom.slice(0, nom.indexOf(':')), nom.slice(nom.indexOf(':') + 1)] : ['', nom]);
  const lireElement = (espacesParent) => {
    if (source[pos] !== '<') echouer('Content is not allowed in prolog.');
    pos++;
    const nom = lireNom();
    const bruts = [];
    for (;;) {
      sauterBlancs();
      if (source.startsWith('/>', pos) || source[pos] === '>') break;
      if (pos >= source.length) echouer(`Element type "${nom}" must be followed by either attribute specifications, ">" or "/>".`);
      const nomAttribut = lireNom();
      sauterBlancs();
      if (source[pos] !== '=') echouer(`Attribute name "${nomAttribut}" associated with an element type "${nom}" must be followed by the ' = ' character.`);
      pos++;
      sauterBlancs();
      const guillemet = source[pos];
      if (guillemet !== '"' && guillemet !== "'") echouer(`Open quote is expected for attribute "${nomAttribut}".`);
      const fin = source.indexOf(guillemet, pos + 1);
      if (fin < 0) echouer('Unclosed attribute value.');
      bruts.push([nomAttribut, decoder(source.slice(pos + 1, fin))]);
      pos = fin + 1;
    }
    const espaces = { ...espacesParent };
    for (const [nomAttribut, valeur] of bruts) {
      if (nomAttribut === 'xmlns') espaces[''] = valeur;
      else if (nomAttribut.startsWith('xmlns:')) espaces[nomAttribut.slice(6)] = valeur;
    }
    const [prefixe, local] = separer(nom);
    if (prefixe && !(prefixe in espaces)) echouer(`The prefix "${prefixe}" for element "${nom}" is not bound.`);
    const noeud = {
      prefixe, local, uri: espaces[prefixe] ?? '', enfants: [],
      attributs: bruts.filter(([nomAttribut]) => nomAttribut !== 'xmlns' && !nomAttribut.startsWith('xmlns:')).map(([nomAttribut, valeur]) => {
        const [prefixeAttribut, localAttribut] = separer(nomAttribut);
        return { local: localAttribut, uri: prefixeAttribut ? espaces[prefixeAttribut] ?? '' : '', valeur };
      }),
    };
    if (source.startsWith('/>', pos)) { pos += 2; return noeud; }
    pos++;
    for (;;) {
      if (pos >= source.length) echouer(`XML document structures must start and end within the same entity (<${nom}>).`);
      if (source.startsWith('</', pos)) {
        pos += 2;
        const fermeture = lireNom();
        if (fermeture !== nom) echouer(`The element type "${nom}" must be terminated by the matching end-tag "</${nom}>".`);
        sauterBlancs();
        if (source[pos] !== '>') echouer(`The end-tag for element type "${nom}" must end with a '>' delimiter.`);
        pos++;
        return noeud;
      }
      if (source.startsWith('<!--', pos)) sauterJusqua('-->', 'Comment not closed.');
      else if (source.startsWith('<![CDATA[', pos)) {
        const fin = source.indexOf(']]>', pos);
        if (fin < 0) echouer('The CDATA section must end with "]]>".');
        noeud.enfants.push(source.slice(pos + 9, fin));
        pos = fin + 3;
      } else if (source.startsWith('<?', pos)) sauterJusqua('?>', 'PI not closed.');
      else if (source[pos] === '<') noeud.enfants.push(lireElement(espaces));
      else {
        const fin = source.indexOf('<', pos);
        const brut = source.slice(pos, fin < 0 ? source.length : fin);
        noeud.enfants.push(decoder(brut));
        pos = fin < 0 ? source.length : fin;
      }
    }
  };
  if (!source.trim()) echouer('Premature end of file.');
  sauterDivers();
  const racine = lireElement({ xml: 'http://www.w3.org/XML/1998/namespace' });
  sauterDivers();
  if (pos < source.length) echouer('The markup in the document following the root element must be well-formed.');
  return racine;
}

/** FR : Namespace XmlService / EN: XmlService Namespace */
function espaceXml(prefixe, uri) {
  return { getPrefix: () => prefixe, getURI: () => uri };
}

/**
 * FR : Element XmlService : getChild(nom) / getChildren(nom) sans espace = enfants SANS espace de noms (comme Apps Script) ;
 *      getText = texte direct (texte et CDATA) ; getAttribute(nom) = attribut sans espace de noms.
 * EN: XmlService Element: getChild(name) / getChildren(name) without namespace = children WITHOUT namespace.
 */
function elementXml(noeud) {
  const enfants = (nom, espace) => noeud.enfants.filter((enfant) => typeof enfant === 'object'
    && (nom === undefined || enfant.local === nom) && (nom === undefined || enfant.uri === (espace ? espace.getURI() : ''))).map(elementXml);
  return {
    getName: () => noeud.local,
    getNamespace: () => espaceXml(noeud.prefixe, noeud.uri),
    getChild: (nom, espace) => enfants(nom, espace)[0] ?? null,
    getChildren: (nom, espace) => enfants(nom, espace),
    getText: () => noeud.enfants.filter((enfant) => typeof enfant === 'string').join(''),
    getChildText: (nom, espace) => enfants(nom, espace)[0]?.getText() ?? null,
    getAttribute: (nom, espace) => {
      const attribut = noeud.attributs.find((candidat) => candidat.local === nom && candidat.uri === (espace ? espace.getURI() : ''));
      return attribut ? { getName: () => attribut.local, getValue: () => attribut.valeur } : null;
    },
  };
}

/* ======================= FLUX RSS FICTIF ======================= */

/** FR : échappement XML d'un texte / EN: XML escaping of a text */
function echapperXml(texte) {
  return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** FR : chemin du site CERT-FR par code de catégorie / EN: CERT-FR site path by category code */
const CHEMINS = Object.freeze({ ALE: 'alerte', AVI: 'avis', ACT: 'actualite', CTI: 'cti', IOC: 'ioc', DUR: 'dur', INF: 'information' });

/**
 * FR : Élément de flux fictif daté (ms) : lien https://cert.cyber.gouv.fr/<chemin>/<référence>/, guid = lien, pubDate RFC 822.
 *      extra : titre, titreXml (brut), lien (null = absent), guid ('' = absent), dateTexte, description (CDATA), categories.
 * EN: Fictitious dated feed item (ms).
 */
function pubA(reference, ms, extra = {}) {
  const code = reference.split('-')[2];
  const lien = `https://cert.cyber.gouv.fr/${CHEMINS[code] ?? 'autre'}/${reference}/`;
  return { reference, titre: `Publication fictive ${reference}`, lien, guid: lien, dateTexte: new Date(ms).toUTCString(), description: `Résumé fictif de ${reference}.`, ...extra };
}

/** FR : élément publié il y a n heures (par rapport à MAINTENANT_DEFAUT) / EN: item published n hours ago */
function pub(reference, heuresAvant = 1, extra = {}) {
  return pubA(reference, MS_MAINTENANT - heuresAvant * HEURE, extra);
}

/** FR : flux RSS 2.0 fictif (le plus récent en tête comme le vrai flux) / EN: fictitious RSS 2.0 feed */
function fluxRss(items) {
  const corps = items.map((element) => {
    const parties = [];
    if (element.titreXml !== undefined) parties.push(`<title>${element.titreXml}</title>`);
    else if (element.titre !== null) parties.push(`<title>${echapperXml(element.titre)}</title>`);
    if (element.lien !== null) parties.push(`<link>${echapperXml(element.lien)}</link>`);
    if (element.guid) parties.push(`<guid isPermaLink="true">${echapperXml(element.guid)}</guid>`);
    if (element.dateTexte !== null) parties.push(`<pubDate>${element.dateTexte}</pubDate>`);
    if (element.description) parties.push(`<description><![CDATA[${element.description}]]></description>`);
    for (const categorie of element.categories ?? []) parties.push(`<category>${echapperXml(categorie)}</category>`);
    return `    <item>${parties.join('')}</item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n`
    + '    <title>CERT-FR (flux fictif du banc)</title>\n    <link>https://cert.cyber.gouv.fr/</link>\n    <description>Flux fictif</description>\n'
    + `${corps}\n  </channel>\n</rss>\n`;
}

/** FR : réponse 200 d'un flux / EN: 200 feed answer */
function reponseFlux(items) {
  return { code: 200, texte: fluxRss(items), entetes: { 'Content-Type': 'application/rss+xml; charset=UTF-8' } };
}

/* ======================= CRÉATION DU BANC ======================= */

/** FR : fusion profonde de CONFIG, définie dans le realm du contexte / EN: deep CONFIG merge, defined in the context realm */
const SOURCE_FUSION = `function __fusionnerConfig(base, surcharge) {
  const estObjet = (valeur) => valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur);
  const fusion = (gauche, droite) => {
    const resultat = { ...gauche };
    for (const [cle, valeur] of Object.entries(droite ?? {})) {
      resultat[cle] = estObjet(valeur) && estObjet(gauche[cle]) ? fusion(gauche[cle], valeur) : valeur;
    }
    return Object.freeze(resultat);
  };
  return fusion(base, surcharge);
}`;

const BANCS_DU_TEST = [];

/** FR : identifiant lisible d'un message posté (référence, « amorcage » ou « test ») / EN: readable id of a posted message */
function identifiantCharge(charge) {
  const carte = charge?.cardsV2?.[0];
  if (carte?.cardId === 'publication') return String(carte.card.header.subtitle).split(' · ')[1];
  return carte?.cardId ?? '?';
}

/** FR : objet réponse HTTPResponse simulé / EN: simulated HTTPResponse object */
function reponseHttp({ code = 200, texte = '', entetes = {}, sansEntetes = false }) {
  return {
    getResponseCode: () => code,
    getContentText: () => texte,
    getAllHeaders: () => (sansEntetes ? undefined : { ...entetes }),
    getHeaders: () => (sansEntetes ? undefined : { ...entetes }),
  };
}

/**
 * FR : Crée un banc : contexte vm, simulations et état observable.
 *      options : proprietes, items (flux à URL_FLUX), flux {url: réponse | fonction}, fileFlux (réponses successives),
 *      webhook (fonction (charge, numero) → réponse | undefined = 200), maintenant, scopes, verrouLibre, declencheurs.
 * EN: Creates a bench: vm context, simulations and observable state.
 */
function creerBanc(options = {}) {
  const contexte = vm.createContext({});
  const DateContexte = vm.runInContext('Date', contexte);
  const proprietesInitiales = Object.fromEntries(Object.entries(options.proprietes ?? {}).filter(([, valeur]) => valeur !== undefined));
  const etat = {
    proprietes: proprietesInitiales,
    horloge: options.maintenant ? Date.parse(options.maintenant) : MS_MAINTENANT,
    scopes: [...(options.scopes ?? MANIFESTE.oauthScopes)],
    journal: [], requetes: [], posts: [], mails: [], pauses: [], evenements: [], ecritures: [], violations: [],
    declencheurs: [], numeroDeclencheur: 0,
    flux: { ...(options.items ? { [URL_FLUX]: reponseFlux(options.items) } : {}), ...(options.flux ?? {}) },
    fileFlux: [...(options.fileFlux ?? [])],
    webhook: options.webhook ?? null,
    verrouLibre: options.verrouLibre ?? true, verrouTenu: false, attentesVerrou: [],
  };

  const journaliser = (niveau) => (...elements) => {
    etat.journal.push({ niveau, texte: elements.map((element) => (typeof element === 'string' ? element : JSON.stringify(element))).join(' ') });
  };
  const consoleBanc = { log: journaliser('log'), info: journaliser('info'), warn: journaliser('warn'), error: journaliser('error') };

  const declencheur = (fonction, details) => {
    etat.numeroDeclencheur++;
    const identifiant = `declencheur-fictif-${etat.numeroDeclencheur}`;
    return { ...details, getHandlerFunction: () => fonction, getUniqueId: () => identifiant, getEventType: () => 'CLOCK', getTriggerSource: () => 'CLOCK' };
  };
  for (const fonction of options.declencheurs ?? []) etat.declencheurs.push(declencheur(fonction, { heures: 1 }));

  /** FR : webhook Chat simulé / EN: simulated Chat webhook */
  const repondreWebhook = (url, requete) => {
    const methode = String(requete.method ?? 'get').toLowerCase();
    if (methode !== 'post') etat.violations.push(`webhook appelé en ${methode} / webhook called with ${methode}`);
    if (!/^application\/json/i.test(String(requete.contentType ?? ''))) etat.violations.push(`webhook sans contentType JSON : ${requete.contentType}`);
    const charge = JSON.parse(requete.payload);
    etat.posts.push({ url, charge, contentType: requete.contentType, instant: etat.horloge, payload: requete.payload });
    etat.evenements.push(`POST:${identifiantCharge(charge)}`);
    const prevue = etat.webhook ? etat.webhook(charge, etat.posts.length) : undefined;
    const reponse = prevue ?? { code: 200, texte: '{"name":"spaces/AAA/messages/BBB"}' };
    if (reponse.avance) etat.horloge += reponse.avance;
    if (reponse.exception) throw exceptionAppsScript(reponse.exception);
    return reponseHttp(reponse);
  };

  /** FR : site CERT-FR simulé (redirections suivies si followRedirects n'est pas false) / EN: simulated CERT-FR site */
  const repondreFlux = (url, requete) => {
    const prevue = etat.fileFlux.length ? etat.fileFlux.shift() : etat.flux[url];
    const reponse = typeof prevue === 'function' ? prevue(url) : prevue;
    if (!reponse) return reponseHttp({ code: 404, texte: '<html><body>Not Found</body></html>' });
    if (reponse.exception) throw exceptionAppsScript(reponse.exception);
    if (reponse.code >= 300 && reponse.code < 400 && requete.followRedirects !== false) {
      const suivante = reponse.entetes?.Location;
      return UrlFetchApp.fetch(suivante, requete);
    }
    return reponseHttp(reponse);
  };

  const UrlFetchApp = {
    fetch(url, requete = {}) {
      exigerScope(etat, 'UrlFetchApp.fetch');
      const liste = MANIFESTE.urlFetchWhitelist;
      if (Array.isArray(liste) && !liste.some((prefixe) => String(url).startsWith(prefixe))) {
        throw exceptionAppsScript(`L'URL n'est pas autorisée par urlFetchWhitelist (appsscript.json) : ${url}`);
      }
      const methode = String(requete.method ?? 'get').toLowerCase();
      etat.requetes.push({ url, methode, followRedirects: requete.followRedirects, entetes: { ...(requete.headers ?? {}) }, muteHttpExceptions: requete.muteHttpExceptions });
      if (String(url).startsWith('https://chat.googleapis.com/')) return repondreWebhook(url, requete);
      if (methode !== 'get') etat.violations.push(`appel ${methode} hors webhook : ${url}`);
      return repondreFlux(url, requete);
    },
  };

  const proprietesScript = {
    getProperties: () => ({ ...etat.proprietes }),
    getProperty: (cle) => etat.proprietes[cle] ?? null,
    getKeys: () => Object.keys(etat.proprietes),
    setProperty(cle, valeur) {
      const texte = String(valeur);
      if (Buffer.byteLength(texte, 'utf8') > 9 * 1024) throw exceptionAppsScript(`Argument trop grand : value (${cle})`);
      etat.proprietes[cle] = texte;
      etat.ecritures.push(cle);
      etat.evenements.push(`set:${cle}`);
      return proprietesScript;
    },
    deleteProperty(cle) {
      delete etat.proprietes[cle];
      etat.ecritures.push(`-${cle}`);
      etat.evenements.push(`del:${cle}`);
      return proprietesScript;
    },
  };

  const globaux = {
    console: consoleBanc,
    Logger: { log: journaliser('log') },
    UrlFetchApp,
    XmlService: {
      parse: (texte) => {
        const racine = analyserXml(texte);
        return { getRootElement: () => elementXml(racine) };
      },
      getNamespace: (premier, second) => (second === undefined ? espaceXml('', premier) : espaceXml(premier, second)),
    },
    PropertiesService: { getScriptProperties: () => proprietesScript },
    LockService: {
      getScriptLock: () => ({
        tryLock: (ms) => {
          etat.attentesVerrou.push(ms);
          if (!etat.verrouLibre) return false;
          etat.verrouTenu = true;
          return true;
        },
        waitLock: (ms) => {
          etat.attentesVerrou.push(ms);
          if (!etat.verrouLibre) throw exceptionAppsScript('Lock timeout: another process was holding the lock for too long.');
          etat.verrouTenu = true;
        },
        releaseLock: () => { etat.verrouTenu = false; },
        hasLock: () => etat.verrouTenu,
      }),
    },
    Session: {
      getEffectiveUser: () => {
        exigerScope(etat, 'Session.getEffectiveUser');
        return { getEmail: () => PROPRIETAIRE };
      },
      getActiveUser: () => {
        exigerScope(etat, 'Session.getActiveUser');
        return { getEmail: () => PROPRIETAIRE };
      },
      getActiveUserLocale: () => 'fr',
      getScriptTimeZone: () => 'Europe/Paris',
    },
    MailApp: {
      sendEmail: (premier, ...suite) => {
        exigerScope(etat, 'MailApp.sendEmail');
        const message = typeof premier === 'object' ? { ...premier } : { to: premier, subject: suite[0], body: suite[1], ...(suite[2] ?? {}) };
        if (!message.to) throw exceptionAppsScript('Destinataire absent / Missing recipient');
        etat.mails.push(message);
        etat.evenements.push(`MAIL:${message.subject}`);
      },
      getRemainingDailyQuota: () => 100,
    },
    ScriptApp: {
      AuthMode: Object.freeze({ FULL: 'FULL', LIMITED: 'LIMITED', NONE: 'NONE' }),
      getProjectTriggers: () => {
        exigerScope(etat, 'ScriptApp.getProjectTriggers');
        return [...etat.declencheurs];
      },
      deleteTrigger: (cible) => {
        exigerScope(etat, 'ScriptApp.deleteTrigger');
        etat.declencheurs = etat.declencheurs.filter((candidat) => candidat.getUniqueId() !== cible.getUniqueId());
      },
      newTrigger: (fonction) => {
        exigerScope(etat, 'ScriptApp.newTrigger');
        const details = {};
        const constructeur = {
          timeBased: () => constructeur,
          everyHours: (heures) => { details.heures = heures; return constructeur; },
          everyMinutes: (minutes) => { details.minutes = minutes; return constructeur; },
          everyDays: (jours) => { details.jours = jours; return constructeur; },
          atHour: (heure) => { details.heure = heure; return constructeur; },
          create: () => {
            const cree = declencheur(fonction, details);
            etat.declencheurs.push(cree);
            return cree;
          },
        };
        return constructeur;
      },
      getAuthorizationInfo: () => ({ getAuthorizationStatus: () => 'NOT_REQUIRED', getAuthorizedScopes: () => [...etat.scopes] }),
    },
    Utilities: {
      formatDate: (date, fuseau, format) => formaterDate(date, fuseau, format),
      sleep: (ms) => {
        etat.pauses.push(ms);
        etat.horloge += ms;
      },
    },
    SURCHARGE_CONFIG: JSON.parse(JSON.stringify({ ...SURCHARGE_CONFIG, ...(options.config ?? {}) })),
  };
  Object.assign(contexte, globaux);

  vm.runInContext(SOURCE_FUSION, contexte, { filename: 'banc-fusion.js' });
  for (const nom of ORDRE_FICHIERS) {
    let source = fs.readFileSync(path.join(DOSSIER_SRC, nom), 'utf8');
    if (nom === 'Config.gs') {
      // FR : injecte la configuration du banc dans CONFIG (fusion profonde) / EN: injects the bench configuration into CONFIG
      const debut = source.indexOf('const CONFIG = Object.freeze({');
      const fin = source.indexOf('\n});', debut);
      assert.ok(debut >= 0 && fin > debut, 'Config.gs : motif CONFIG introuvable / CONFIG pattern not found');
      source = `${source.slice(0, debut)}const CONFIG = __fusionnerConfig({${source.slice(debut + 'const CONFIG = Object.freeze({'.length, fin)}\n}, SURCHARGE_CONFIG);${source.slice(fin + 4)}`;
    }
    vm.runInContext(source, contexte, { filename: nom });
  }
  // FR : horloge contrôlée (garde de temps comprise) / EN: controlled clock (time guard included)
  contexte.maintenant_ = () => new DateContexte(etat.horloge);

  const copie = (valeur) => (valeur === undefined ? undefined : JSON.parse(JSON.stringify(valeur)));
  const banc = {
    contexte,
    etat,
    evaluer: (code) => vm.runInContext(code, contexte),
    evaluerJson: (code) => copie(vm.runInContext(code, contexte)),
    relever: (evenement) => copie(contexte.relever(evenement)),
    avancer: (ms) => { etat.horloge += ms; return banc; },
    definirFlux: (items, url = URL_FLUX) => { etat.flux[url] = reponseFlux(items); return banc; },
    /** FR : efface les traces (journal, requêtes, POST, e-mails, pauses) entre deux exécutions / EN: clears traces */
    vider: () => {
      for (const cle of ['journal', 'requetes', 'posts', 'mails', 'pauses', 'evenements', 'ecritures']) etat[cle] = [];
      return banc;
    },
    journal: () => etat.journal.map((ligne) => ligne.texte).join('\n'),
    lignes: (motif) => etat.journal.filter((ligne) => motif.test(ligne.texte)),
    /** FR : jetons de la dernière ligne de synthèse / EN: tokens of the last summary line */
    synthese: () => {
      const ligne = [...etat.journal].reverse().find((candidate) => / \| resultat=/.test(candidate.texte));
      assert.ok(ligne, 'ligne de synthèse absente / summary line missing');
      return Object.fromEntries(ligne.texte.split(' | ').slice(1).map((jeton) => [jeton.slice(0, jeton.indexOf('=')), jeton.slice(jeton.indexOf('=') + 1)]));
    },
    memoire: () => (etat.proprietes.ELEMENTS_VUS === undefined ? null : JSON.parse(etat.proprietes.ELEMENTS_VUS)),
    json: (cle) => (etat.proprietes[cle] === undefined ? undefined : JSON.parse(etat.proprietes[cle])),
    publications: () => etat.posts.filter((post) => post.charge.cardsV2?.[0]?.cardId === 'publication'),
    /** FR : identifiants des POST dans l'ordre (tentatives comprises) / EN: POST ids in order (attempts included) */
    postes: () => etat.posts.map((post) => identifiantCharge(post.charge)),
    gets: () => etat.requetes.filter((requete) => requete.methode === 'get'),
    sujets: () => etat.mails.map((mail) => mail.subject),
  };
  BANCS_DU_TEST.push(banc);
  return banc;
}

/** FR : propriétés d'un banc en mode réel / EN: live-mode bench properties */
const PROPRIETES_REELLES = Object.freeze({ DRY_RUN: 'false', WEBHOOK_URL: URL_WEBHOOK, ADRESSE_ALERTE: RESPONSABLE });
const CLES_ANCIENNES = Object.freeze(['CERTFR-2099-AVI-0900', 'CERTFR-2099-AVI-0899']);

/** FR : banc en mode réel avec une mémoire existante (pas d'amorçage) / EN: live-mode bench with existing memory */
function bancReel(options = {}) {
  return creerBanc({ ...options, proprietes: { ...PROPRIETES_REELLES, ELEMENTS_VUS: JSON.stringify(CLES_ANCIENNES), ...(options.proprietes ?? {}) } });
}

/** FR : webhook qui répond la réponse donnée pour une référence / EN: webhook answering the given answer for a reference */
function webhookPour(reponses) {
  return (charge) => reponses[identifiantCharge(charge)];
}

/** FR : nombre d'occurrences d'un motif dans le journal / EN: number of matches in the log */
function compter(texte, motif) {
  return (texte.match(new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : `${motif.flags}g`)) ?? []).length;
}

/* ======================= TESTS ======================= */

const tests = [];
/** FR : enregistre un test / EN: registers a test */
function test(nom, fonction) {
  tests.push({ nom, fonction });
}

/* ----------------------- Socle : manifeste, syntaxe, traductions ----------------------- */

function test_manifeste_et_chargement() {
  const banc = creerBanc();
  assert.equal(MANIFESTE.timeZone, 'Europe/Paris');
  assert.equal(MANIFESTE.runtimeVersion, 'V8');
  assert.deepEqual([...MANIFESTE.oauthScopes].sort(), [...SCOPES_ATTENDUS].sort(), 'scopes minimaux du cadrage §6');
  assert.deepEqual(MANIFESTE.dependencies?.enabledAdvancedServices ?? [], [], 'aucun service avancé / no advanced service');
  for (const prefixe of ['https://cert.cyber.gouv.fr/', 'https://www.cert.ssi.gouv.fr/', 'https://chat.googleapis.com/v1/spaces/']) {
    assert.ok(MANIFESTE.urlFetchWhitelist.includes(prefixe), `liste blanche sans ${prefixe}`);
  }
  assert.deepEqual([...banc.evaluerJson('CONFIG.SCOPES_ATTENDUS')].map(SCOPE).sort(), [...MANIFESTE.oauthScopes].sort());
  assert.match(fs.readFileSync(path.join(DOSSIER_SRC, 'Config.gs'), 'utf8'), /\n {2}DRY_RUN: true,/, 'DRY_RUN: true dans Config.gs');
  assert.deepEqual(sources().map(({ nom }) => nom).filter((nom) => !ORDRE_FICHIERS.includes(nom)), [], 'fichier .gs absent de ORDRE_FICHIERS');
  const code = sources().map(({ code: texte }) => masquerTextes(texte)).join('\n');
  assert.doesNotMatch(code, /\b(?:SpreadsheetApp|GmailApp|DriveApp|DocumentApp|CalendarApp|AdminDirectory|AdminReports|Chat\.Spaces)\b/, 'service hors cadrage utilisé');
  // FR : le chargement n'appelle aucun service (aucune requête, aucune écriture) / EN: loading calls no service
  assert.deepEqual([banc.etat.requetes.length, banc.etat.ecritures.length, banc.etat.mails.length], [0, 0, 0]);
}
test('Socle — manifeste (V8, Europe/Paris, 3 scopes, liste blanche CERT-FR + Chat, aucun service avancé), DRY_RUN: true, chargement sans appel de service', test_manifeste_et_chargement);

function test_syntaxe_es2020() {
  const positifs = {
    'x ||= 1;': 1, 'x &&= y;': 1, 'x ??= {};': 1, 'const n = 1_000;': 1, 'const h = 0xFF_FF;': 1, 'class A { #prive = 1; lire() { return this.#prive; } }': 1,
    'class A { static { init(); } }': 1, 'const t = `${(() => { x ||= 1; return x; })()}`;': 1,
  };
  const negatifs = [
    "const url = `${base}#gid=${id}&range=A${ligne}`;", "const style = 'color:#ffffff;';", 'const c = "#045973";', '// x ||= 1 dans un commentaire',
    '/* static { } */', "texte.replace(/&#x([0-9a-f]+);/gi, '')", 'const a = b || c; const d = e ?? f; const g = h && i;', 'const essai_1 = 2; const v1_2 = 3;',
    'const s = `a ||= b ${x} #y`;', "const r = /a||=b/.test('x');", 'const q = x / 2 / y;',
  ];
  for (const [code, nombre] of Object.entries(positifs)) assert.equal(syntaxesPosterieuresEs2020('exemple.gs', code).length, nombre, `non détecté : ${code}`);
  for (const code of negatifs) assert.deepEqual(syntaxesPosterieuresEs2020('exemple.gs', code), [], `faux positif : ${code}`);
  const releves = sources().flatMap(({ nom, code }) => syntaxesPosterieuresEs2020(nom, code));
  assert.deepEqual(releves, [], `syntaxe refusée par Apps Script (clasp push) :\n      ${releves.join('\n      ')}`);
}
test('Compatibilité Apps Script — aucune syntaxe postérieure à ES2020 dans src/ (||=, &&=, ??=, 1_000, #privé, static {})', test_syntaxe_es2020);

function test_traductions() {
  const banc = creerBanc();
  assert.deepEqual(banc.evaluerJson('verifierTraductions_()'), []);
  assert.doesNotMatch(banc.journal(), /Traductions manquantes/);
  const textes = banc.evaluer('TEXTES');
  const motifs = [/\bt_\(\s*'(\w+)'/g, /\btBilingue_\(\s*'(\w+)'/g, /\bbilingueParLangue_\(\s*'(\w+)'/g,
    /'((?:diag|mail|journal|erreur|avert|carte|amorcage|test|categorie|info|texte|reference|traductions)[A-Z]\w*)'/g];
  const utilisees = new Set();
  for (const { code } of sources()) for (const motif of motifs) for (const trouve of code.matchAll(motif)) utilisees.add(trouve[1]);
  assert.ok(utilisees.size > 120, `trop peu de clés trouvées (${utilisees.size})`);
  const manquantes = [...utilisees].flatMap((cle) => ['fr', 'en'].filter((langue) => !(cle in textes[langue])).map((langue) => `${langue}.${cle}`));
  assert.deepEqual(manquantes, [], 'clé utilisée absente de TEXTES');
  // FR : mêmes paramètres {n} en FR et en EN / EN: same {n} placeholders in FR and EN
  const parametres = (texte) => [...new Set(String(texte).match(/\{\d+\}/g) ?? [])].sort().join(',');
  const ecarts = Object.keys(textes.fr).filter((cle) => parametres(textes.fr[cle]) !== parametres(textes.en[cle]));
  assert.deepEqual(ecarts, [], 'paramètres {n} différents entre FR et EN');
  // FR : tBilingue_ ne répète pas un texte identique / EN: tBilingue_ does not repeat an identical text
  assert.equal(banc.evaluer("tBilingue_('diagStatutOk')"), 'OK');
  assert.equal(banc.evaluer("tBilingue_('diagStatutErreur')"), 'ERREUR / ERROR');
  // FR : textes affichés FR et EN (RM-26) : libellés du design §2 / EN: design §2 labels
  const libelles = ['Ale', 'Avi', 'Act', 'Cti', 'Ioc', 'Dur', 'Inf', 'Autre'].map((code) => [textes.fr[`categorie${code}`], textes.en[`categorie${code}`]]);
  assert.deepEqual(libelles, [['Alerte', 'Alert'], ['Avis de sécurité', 'Security advisory'], ["Bulletin d'actualité", 'News bulletin'], ['Rapport de menace', 'Threat report'],
    ['Indicateurs de compromission', 'Indicators of compromise'], ['Guide de durcissement', 'Hardening guide'], ['Information', 'Information'], ['Autre', 'Other']]);
}
test('Traductions — verifierTraductions_() vide ; chaque clé utilisée dans src/ existe en fr et en ; mêmes paramètres {n} ; tBilingue_ sans répétition ; libellés du design §2', test_traductions);

function test_tests_editeur() {
  const banc = creerBanc();
  const resultat = banc.evaluerJson('testerSansApi()');
  assert.deepEqual(resultat.echecs, []);
  assert.ok(resultat.reussis >= 25, `testerSansApi : ${resultat.reussis} réussis`);
  assert.deepEqual([banc.etat.requetes.length, banc.etat.ecritures.length, banc.etat.mails.length], [0, 0, 0], 'testerSansApi sans appel ni écriture');
}
test('Tests.gs — testerSansApi() réussit dans le banc, sans appel de service ni écriture', test_tests_editeur);

/* ----------------------- CA-1 à CA-3 : lecture et analyse ----------------------- */

function test_ca01_extraction() {
  const longue = `<p>${'Plusieurs vulnérabilités ont été découvertes dans un produit fictif, permettant une exécution de code. '.repeat(5)}</p>`;
  const msA = Date.parse('2026-10-22T05:40:00Z');
  const items = [
    pubA('CERTFR-2099-ACT-001', Date.parse('2026-10-22T07:05:00Z'), { titre: 'Bulletin fictif de la semaine 43', description: 'Bulletin fictif de la semaine 43' }),
    pubA('CERTFR-2099-AVI-0001', Date.parse('2026-10-22T07:12:00Z'), { titre: 'Multiples vulnérabilités dans un produit fictif', description: longue, dateTexte: 'Thu, 22 Oct 2026 09:12:00 +0200' }),
    pubA('CERTFR-2099-ALE-001', msA, { titreXml: 'Vulnérabilité critique dans Produit &amp;amp; Cie &lt;b&gt;fictif&lt;/b&gt;', description: 'Une vulnérabilité &amp; exploitée.' }),
  ];
  const banc = bancReel({ items });
  const analyse = banc.evaluerJson(`lireEtAnalyserFlux_('${URL_FLUX}', maintenant_())`).analyse;
  assert.equal(analyse.elements.length, 3);
  const parReference = Object.fromEntries(analyse.elements.map((element) => [element.reference, element]));
  const alerte = parReference['CERTFR-2099-ALE-001'];
  assert.equal(alerte.titre, 'Vulnérabilité critique dans Produit & Cie fictif', 'entités décodées, balises retirées, espaces normalisés');
  assert.equal(alerte.categorie, 'ALE');
  assert.equal(alerte.cle, 'CERTFR-2099-ALE-001');
  assert.equal(alerte.lien, 'https://cert.cyber.gouv.fr/alerte/CERTFR-2099-ALE-001/');
  assert.equal(alerte.resume, 'Une vulnérabilité & exploitée.');
  assert.equal(Date.parse(alerte.date), msA);
  const avis = parReference['CERTFR-2099-AVI-0001'];
  assert.equal(avis.categorie, 'AVI');
  assert.equal(Date.parse(avis.date), Date.parse('2026-10-22T07:12:00Z'), 'pubDate avec fuseau +0200');
  assert.ok(Array.from(avis.resume).length <= 300 && Array.from(avis.resume).length >= 250, `résumé de ${Array.from(avis.resume).length} caractères`);
  assert.ok(avis.resume.endsWith('…'));
  assert.doesNotMatch(avis.resume, /<p>|<\/p>/);
  assert.equal(parReference['CERTFR-2099-ACT-001'].resume, '', 'résumé identique au titre omis');
  assert.equal(parReference['CERTFR-2099-ACT-001'].categorie, 'ACT');
  // FR : date affichée en heure de Paris (été puis hiver) / EN: date displayed in Paris time (summer then winter)
  assert.equal(banc.evaluer(`formaterInstant_(new Date(${msA}))`), '22/10/2026 07:40');
  assert.equal(banc.evaluer(`formaterInstant_(new Date(${Date.parse('2026-12-01T09:00:00Z')}))`), '01/12/2026 10:00');
  // FR : de bout en bout : 3 cartes, date « Publié le » à Paris, résumé tronqué dans la carte / EN: end to end
  const bilan = banc.relever();
  assert.equal(bilan.publies, 3);
  const carteAlerte = banc.publications().find((post) => identifiantCharge(post.charge) === 'CERTFR-2099-ALE-001').charge;
  const widgets = carteAlerte.cardsV2[0].card.sections[0].widgets;
  const dateWidget = widgets.find((widget) => widget.decoratedText?.startIcon?.knownIcon === 'CLOCK');
  assert.equal(dateWidget.decoratedText.text, dateParis(msA));
  assert.equal(dateWidget.decoratedText.topLabel, 'Publié le');
  // FR : pubDate illisible → heure de lecture, journalisée (RM-4) / EN: unreadable pubDate → read time, logged
  const illisible = bancReel({ items: [pub('CERTFR-2099-AVI-0002', 1, { dateTexte: 'pas une date' })] });
  const elements = illisible.evaluerJson(`lireEtAnalyserFlux_('${URL_FLUX}', maintenant_())`).analyse.elements;
  assert.equal(Date.parse(elements[0].date), MS_MAINTENANT);
  illisible.relever();
  assert.match(illisible.journal(), /Date illisible, heure de lecture utilisée : cle=CERTFR-2099-AVI-0002/);
  assert.equal(illisible.publications().length, 1);
}
test('CA-1 (RM-1, RM-4) — 3 éléments : référence, catégorie, titre décodé (&amp; → &, balises retirées), lien, date à Paris, résumé tronqué à 300 « … » (omis si = titre) ; date illisible → heure de lecture journalisée', test_ca01_extraction);

function test_ca02_structure() {
  const items = [pub('CERTFR-2099-AVI-0001', 3), pub('CERTFR-2099-AVI-0002', 2)];
  const cas = [
    ['503 persistant', [{ code: 503, texte: 'Service Unavailable' }, { code: 503 }, { code: 503 }], /HTTP 503 après 3 essais/],
    ['XML illisible', [{ code: 200, texte: '<rss><channel><item><title>coupé' }], /n'est pas un flux RSS lisible/],
    ['page HTML anti-robot', [{ code: 200, texte: '<!DOCTYPE html><html><body><p>Vérification & contrôle</p></body></html>' }], /n'est pas un flux RSS lisible/],
    ['racine Atom', [{ code: 200, texte: '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>x</title></entry></feed>' }], /racine <feed> au lieu de <rss><channel>/],
    ['0 élément', [{ code: 200, texte: fluxRss([]) }], /aucune publication exploitable/],
    ['aucun élément valide', [{ code: 200, texte: fluxRss([pub('CERTFR-2099-AVI-0003', 1, { lien: null, guid: '' })]) }], /aucune publication exploitable/],
    ['corps vide', [{ code: 200, texte: '' }], /n'est pas un flux RSS lisible/],
  ];
  for (const [nom, fileFlux, motif] of cas) {
    const banc = bancReel({ items, fileFlux });
    const memoireAvant = banc.etat.proprietes.ELEMENTS_VUS;
    const bilan = banc.relever();
    assert.equal(bilan.resultat, 'echec_flux', nom);
    assert.equal(banc.etat.posts.length, 0, `${nom} : aucun POST`);
    assert.equal(banc.etat.proprietes.ELEMENTS_VUS, memoireAvant, `${nom} : mémoire inchangée`);
    assert.ok(!banc.etat.ecritures.includes('ELEMENTS_VUS'), `${nom} : mémoire non réécrite`);
    assert.match(banc.journal(), motif, nom);
    const derniere = banc.json('DERNIERE_EXECUTION');
    assert.equal(derniere.resultat, 'echec_flux', `${nom} : échec compté`);
    assert.equal(derniere.premierEchec, new Date(MS_MAINTENANT).toISOString(), `${nom} : premier échec daté`);
    assert.equal(derniere.derniereLectureReussie, undefined);
    assert.equal(banc.synthese().resultat, 'echec_flux');
  }
  // FR : 503 persistant : 3 GET, attentes 1 s puis 2 s / EN: persistent 503: 3 GETs, 1 s then 2 s waits
  const persistant = bancReel({ items, fileFlux: [{ code: 503 }, { code: 503 }, { code: 503 }] });
  persistant.relever();
  assert.equal(persistant.gets().length, 3);
  assert.deepEqual(persistant.etat.pauses, [1000, 2000]);
  // FR : un élément sans lien parmi 3 : ignoré et compté, les 2 autres traités / EN: one item without link among 3
  const partiel = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 3), pub('CERTFR-2099-AVI-0002', 2, { lien: null, guid: '' }), pub('CERTFR-2099-AVI-0003', 1)] });
  const bilan = partiel.relever();
  assert.deepEqual(partiel.postes(), ['CERTFR-2099-AVI-0001', 'CERTFR-2099-AVI-0003']);
  assert.equal(bilan.ignores, 1);
  assert.equal(partiel.synthese().ignores, '1');
  assert.equal(partiel.synthese().lus, '2');
  assert.match(partiel.journal(), /Élément ignoré : sans titre ou sans lien/);
  // FR : sans titre aussi / EN: without title too
  const sansTitre = bancReel({ items: [pub('CERTFR-2099-AVI-0004', 2, { titre: null }), pub('CERTFR-2099-AVI-0005', 1)] });
  assert.equal(sansTitre.relever().ignores, 1);
  assert.deepEqual(sansTitre.postes(), ['CERTFR-2099-AVI-0005']);
}
test('CA-2 (RM-2) — 503 après 3 essais, XML illisible, page HTML, racine Atom, 0 élément, corps vide : aucun POST, mémoire inchangée, échec compté ; un élément sans lien (ou sans titre) ignoré et compté, les autres traités', test_ca02_structure);

function test_ca03_categories() {
  const base = 'https://cert.cyber.gouv.fr';
  const items = [
    pub('CERTFR-2099-ALE-001', 9),
    pub('CERTFR-2099-AVI-0001', 9),
    pub('CERTFR-2099-ACT-001', 9),
    pub('CERTFR-2099-CTI-001', 9),
    pub('CERTFR-2099-IOC-001', 9),
    pub('CERTFR-2099-DUR-001', 9),
    pub('CERTFR-2099-INF-001', 9),
    pub('CERTFR-2099-XYZ-001', 9, { lien: `${base}/autre/CERTFR-2099-XYZ-001/` }),
    pub('CERTFR-2099-ALE-002', 9, { lien: `${base}/avis/CERTFR-2099-ALE-002/` }),
    { titre: 'Bulletin sans référence', lien: `${base}/actualite/bulletin-fictif/`, guid: '', dateTexte: new Date(MS_MAINTENANT - HEURE).toUTCString() },
    { titre: 'Alerte référencée par le guid', lien: `${base}/alerte/fictive/`, guid: 'CERTFR-2099-ALE-003', dateTexte: new Date(MS_MAINTENANT - HEURE).toUTCString() },
    { titre: 'Page avec étiquette', lien: `${base}/page/fictive/`, guid: '', categories: ['Avis de sécurité'], dateTexte: new Date(MS_MAINTENANT - HEURE).toUTCString() },
    { titre: 'Page sans indice', lien: `${base}/inconnu/fictif/`, guid: '', dateTexte: new Date(MS_MAINTENANT - HEURE).toUTCString() },
  ];
  const banc = bancReel({ items });
  const elements = banc.evaluerJson(`lireEtAnalyserFlux_('${URL_FLUX}', maintenant_())`).analyse.elements;
  const categories = Object.fromEntries(elements.map((element) => [element.cle, element.categorie]));
  assert.deepEqual(categories, {
    'CERTFR-2099-ALE-001': 'ALE', 'CERTFR-2099-AVI-0001': 'AVI', 'CERTFR-2099-ACT-001': 'ACT', 'CERTFR-2099-CTI-001': 'CTI', 'CERTFR-2099-IOC-001': 'IOC',
    'CERTFR-2099-DUR-001': 'DUR', 'CERTFR-2099-INF-001': 'INF', 'CERTFR-2099-XYZ-001': 'AUTRE', 'CERTFR-2099-ALE-002': 'ALE',
    [`${base}/actualite/bulletin-fictif`]: 'ACT', 'CERTFR-2099-ALE-003': 'ALE', [`${base}/page/fictive`]: 'AVI', [`${base}/inconnu/fictif`]: 'AUTRE',
  });
  banc.relever();
  assert.match(banc.journal(), /Catégorie inconnue : code=XYZ cle=CERTFR-2099-XYZ-001/);
  assert.match(banc.journal(), /Catégorie inconnue : code=inconnu cle=https:\/\/cert\.cyber\.gouv\.fr\/inconnu\/fictif/);
  const autre = banc.publications().find((post) => identifiantCharge(post.charge) === 'CERTFR-2099-XYZ-001').charge;
  assert.equal(autre.cardsV2[0].card.header.title, '❔ Autre');
}
test('CA-3 (RM-3) — catégories par référence (ALE, AVI, ACT, CTI, IOC, DUR, INF), la référence prime sur le chemin ; à défaut chemin, puis étiquette ; code XYZ ou rien → « Autre », journalisé', test_ca03_categories);

/* ----------------------- CA-4 à CA-8 : filtres, anti-doublon, mémoire ----------------------- */

function test_ca04_filtre_categories() {
  const items = [pub('CERTFR-2099-CTI-001', 1), pub('CERTFR-2099-AVI-0001', 2), pub('CERTFR-2099-ALE-001', 3)];
  const banc = bancReel({ items, proprietes: { CATEGORIES: 'ALE,CTI' } });
  const bilan = banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-ALE-001', 'CERTFR-2099-CTI-001']);
  assert.ok(banc.memoire().includes('CERTFR-2099-AVI-0001'), 'avis mémorisé sans publication');
  assert.equal(bilan.ecartesCategorie, 1);
  assert.equal(banc.synthese().ecartes_categorie, '1');
  // FR : filtre retiré : l'avis n'est pas republié / EN: filter removed: the advisory is not posted
  delete banc.etat.proprietes.CATEGORIES;
  banc.vider().avancer(HEURE);
  banc.relever();
  assert.equal(banc.etat.posts.length, 0);
  // FR : casse et espaces tolérés, code inconnu signalé / EN: case and spaces tolerated, unknown code reported
  const souple = bancReel({ items, proprietes: { CATEGORIES: ' ale ; cti, XYZ ' } });
  souple.relever();
  assert.deepEqual(souple.postes(), ['CERTFR-2099-ALE-001', 'CERTFR-2099-CTI-001']);
  assert.match(souple.journal(), /CATEGORIES contient des codes inconnus ignorés : XYZ/);
  // FR : vide = toutes / EN: empty = all
  const toutes = bancReel({ items, proprietes: { CATEGORIES: '' } });
  toutes.relever();
  assert.equal(toutes.etat.posts.length, 3);
}
test('CA-4 (RM-5) — CATEGORIES=ALE,CTI : l\'avis est mémorisé sans être publié ; filtre retiré ensuite : pas de republication ; casse tolérée, code inconnu signalé ; vide = toutes', test_ca04_filtre_categories);

function test_ca05_anciennete() {
  const items = [
    pub('CERTFR-2099-AVI-0003', 7 * 24),
    pub('CERTFR-2099-AVI-0002', 7 * 24 + 1 / 60),
    pub('CERTFR-2099-AVI-0001', 8 * 24),
    pub('CERTFR-2099-AVI-0004', 6 * 24 + 23),
  ];
  const banc = bancReel({ items });
  const bilan = banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0003', 'CERTFR-2099-AVI-0004'], 'limite à 7 jours exactement incluse');
  assert.equal(bilan.ecartesAnciennete, 2);
  assert.equal(banc.synthese().ecartes_anciennete, '2');
  const memoire = banc.memoire();
  for (const cle of ['CERTFR-2099-AVI-0001', 'CERTFR-2099-AVI-0002']) assert.ok(memoire.includes(cle), `${cle} mémorisé`);
  banc.vider().avancer(HEURE);
  banc.relever();
  assert.equal(banc.etat.posts.length, 0, 'trop ancien jamais publié ensuite');
}
test('CA-5 (RM-6) — un élément de 8 jours (ou 7 j + 1 min) n\'est pas publié, est mémorisé et compté « trop ancien » ; 7 jours exactement et 6 j 23 h publiés', test_ca05_anciennete);

function test_ca06_anti_doublon() {
  // FR : même élément dans deux lectures / EN: same item in two reads
  const banc = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)] });
  banc.relever();
  banc.avancer(HEURE).relever();
  assert.equal(banc.etat.posts.length, 1);
  // FR : même avis sur l'ancien domaine en http puis le nouveau en https / EN: old http domain then new https domain
  const domaines = bancReel({ items: [pub('CERTFR-2099-AVI-0002', 1, { lien: 'http://www.cert.ssi.gouv.fr/avis/CERTFR-2099-AVI-0002/', guid: 'http://www.cert.ssi.gouv.fr/avis/CERTFR-2099-AVI-0002/' })] });
  domaines.relever();
  const bouton = domaines.publications()[0].charge.cardsV2[0].card.sections[0].widgets.find((widget) => widget.buttonList).buttonList.buttons[0];
  assert.equal(bouton.onClick.openLink.url, 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2099-AVI-0002/', 'lien http CERT-FR réécrit en https');
  domaines.avancer(HEURE).definirFlux([pub('CERTFR-2099-AVI-0002', 2)]).relever();
  assert.equal(domaines.etat.posts.length, 1);
  // FR : sans référence : lien normalisé (hôte, http, domaine, barre finale, paramètres, ancre) / EN: no reference: normalised link
  const sansReference = (lien) => ({ titre: 'Bulletin fictif sans référence', lien, guid: '', dateTexte: new Date(MS_MAINTENANT - HEURE).toUTCString() });
  const liens = bancReel({ items: [sansReference('http://WWW.CERT.SSI.GOUV.FR/actualite/bulletin-fictif-43/')] });
  liens.relever();
  assert.deepEqual(liens.memoire().slice(0, 1), ['https://cert.cyber.gouv.fr/actualite/bulletin-fictif-43']);
  liens.avancer(HEURE).definirFlux([sansReference('https://cert.cyber.gouv.fr/actualite/bulletin-fictif-43/?utm=x#haut')]).relever();
  assert.equal(liens.etat.posts.length, 1);
  // FR : deux éléments de même clé dans une même lecture n'en font qu'un / EN: two same-key items in one read make one
  const doublon = bancReel({ items: [pub('CERTFR-2099-AVI-0003', 1), pub('CERTFR-2099-AVI-0003', 2, { lien: 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2099-AVI-0003/' })] });
  doublon.relever();
  assert.equal(doublon.etat.posts.length, 1);
  // FR : mémoire plafonnée à 300 clés, les plus récentes en tête / EN: memory capped at 300 keys, most recent first
  const anciennes = Array.from({ length: 300 }, (_, rang) => `CERTFR-2000-AVI-${String(rang + 1).padStart(4, '0')}`);
  const plafond = bancReel({ items: [pub('CERTFR-2099-AVI-0011', 1), pub('CERTFR-2099-AVI-0010', 2)], proprietes: { ELEMENTS_VUS: JSON.stringify(anciennes) } });
  plafond.relever();
  const memoire = plafond.memoire();
  assert.equal(memoire.length, 300);
  assert.deepEqual(memoire.slice(0, 2), ['CERTFR-2099-AVI-0011', 'CERTFR-2099-AVI-0010']);
  assert.deepEqual(memoire.slice(2), anciennes.slice(0, 298), 'les 2 plus anciennes retirées');
  // FR : MEMOIRE_MAX trop grand → plafonné (9 Ko) et signalé / EN: too large MEMOIRE_MAX → capped and reported
  const grand = bancReel({ items: [pub('CERTFR-2099-AVI-0012', 1)], proprietes: { MEMOIRE_MAX: '5000', ELEMENTS_VUS: JSON.stringify(anciennes.concat(anciennes.map((cle) => cle.replace('2000', '2001')))) } });
  grand.relever();
  assert.equal(grand.memoire().length, 350);
  assert.match(grand.journal(), /Réglage MEMOIRE_MAX plafonné à 350/);
  assert.ok(Buffer.byteLength(grand.etat.proprietes.ELEMENTS_VUS) <= 9 * 1024);
}
test('CA-6 (RM-7, RM-8) — même élément sur deux lectures : 1 POST ; ancien domaine http puis nouveau https : 1 POST ; lien sans référence normalisé ; doublon dans une lecture ; mémoire plafonnée à 300 (plus récentes gardées), MEMOIRE_MAX plafonné à 350', test_ca06_anti_doublon);

function test_ca07_echec_partiel() {
  const items = [pub('CERTFR-2099-AVI-0003', 1), pub('CERTFR-2099-AVI-0002', 2), pub('CERTFR-2099-AVI-0001', 3)];
  const banc = bancReel({ items, webhook: webhookPour({ 'CERTFR-2099-AVI-0002': { code: 503, texte: 'Service Unavailable' } }) });
  const bilan = banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0001', 'CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0002'], '503 persistant = 3 POST, le 3e non tenté');
  assert.deepEqual(banc.etat.pauses, [1100, 1000, 2000]);
  const memoire = banc.memoire();
  assert.ok(memoire.includes('CERTFR-2099-AVI-0001'));
  assert.ok(!memoire.includes('CERTFR-2099-AVI-0002') && !memoire.includes('CERTFR-2099-AVI-0003'));
  assert.deepEqual([bilan.publies, bilan.echecs, bilan.reportes, bilan.resultat], [1, 1, 1, 'partiel']);
  assert.equal(banc.etat.mails.length, 0, 'échec transitoire : pas d\'alerte');
  assert.match(banc.journal(), /Échec de publication : cle=CERTFR-2099-AVI-0002 http=503/);
  // FR : exécution suivante : 2e et 3e seulement, mémoire écrite après chaque 200 / EN: next run: 2nd and 3rd only
  banc.etat.webhook = null;
  banc.vider().avancer(HEURE);
  banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0003']);
  assert.deepEqual(banc.etat.evenements.filter((evenement) => /^POST|ELEMENTS_VUS$/.test(evenement)),
    ['POST:CERTFR-2099-AVI-0002', 'set:ELEMENTS_VUS', 'POST:CERTFR-2099-AVI-0003', 'set:ELEMENTS_VUS'], 'mémoire enregistrée après chaque publication');
  assert.deepEqual(banc.memoire().slice(0, 3), ['CERTFR-2099-AVI-0003', 'CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0001']);
}
test('CA-7 (RM-9) — webhook en 503 persistant sur le 2e de 3 : 3 POST pour le 2e, 1er mémorisé, 2e et 3e non ; exécution suivante : 2e et 3e seulement, mémoire écrite après chaque 200', test_ca07_echec_partiel);

function test_ca08_mise_a_jour() {
  const banc = bancReel({ items: [pub('CERTFR-2099-ALE-001', 0.5, { titre: 'Alerte fictive (mise à jour du 22 octobre)', description: 'Nouvelle version.' })], proprietes: { ELEMENTS_VUS: JSON.stringify(['CERTFR-2099-ALE-001']) } });
  const bilan = banc.relever();
  assert.equal(banc.etat.posts.length, 0);
  assert.equal(bilan.nouveaux, 0);
  assert.equal(bilan.resultat, 'ok');
}
test('CA-8 (RM-10) — un élément déjà mémorisé revenu avec un nouveau titre et une nouvelle date n\'est pas republié', test_ca08_mise_a_jour);

/* ----------------------- CA-9 à CA-12 : amorçage, publication, carte, fils ----------------------- */

function test_ca09_amorcage() {
  const quarante = Array.from({ length: 40 }, (_, rang) => pub(`CERTFR-2099-AVI-${String(40 - rang).padStart(4, '0')}`, rang + 1));
  const banc = creerBanc({ items: quarante, proprietes: { ...PROPRIETES_REELLES } });
  const bilan = banc.relever();
  assert.deepEqual(banc.postes(), ['amorcage'], 'un seul POST : le message d\'amorçage');
  const charge = banc.etat.posts[0].charge;
  assert.equal(charge.cardsV2[0].card.header.title, '✅ Veille CERT-FR active');
  assert.match(charge.text, /40 publication\(s\) antérieure\(s\) non reprise\(s\)/);
  assert.match(JSON.stringify(charge), /40 publications antérieures non reprises/);
  const legende = charge.cardsV2[0].card.sections[0].widgets[2].textParagraph.text;
  for (const emoji of ['🚨', '🛡️', '📰', '🕵️', '🔎', '🔒', 'ℹ️', '❔']) assert.ok(legende.includes(emoji), `légende sans ${emoji}`);
  assert.equal(banc.memoire().length, 40);
  assert.equal(banc.memoire()[0], 'CERTFR-2099-AVI-0040', 'plus récente en tête');
  const evenements = banc.etat.evenements;
  assert.ok(evenements.indexOf('POST:amorcage') < evenements.indexOf('set:ELEMENTS_VUS'), 'mémoire écrite après la réponse 200');
  assert.equal(bilan.resultat, 'amorcage');
  assert.equal(banc.json('DERNIERE_EXECUTION').dernierNouvelElement, new Date(MS_MAINTENANT).toISOString());
  // FR : exécution suivante : 1 nouvel élément → 1 POST / EN: next run: 1 new item → 1 POST
  banc.vider().avancer(HEURE).definirFlux([pubA('CERTFR-2099-AVI-0041', MS_MAINTENANT + HEURE / 2), ...quarante]);
  banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0041']);
  // FR : 503 persistant puis 404 : ELEMENTS_VUS absente, amorçage retenté / EN: persistent 503 then 404: retried
  const panne = creerBanc({ items: quarante, proprietes: { ...PROPRIETES_REELLES }, webhook: () => ({ code: 503 }) });
  panne.relever();
  assert.deepEqual(panne.postes(), ['amorcage', 'amorcage', 'amorcage']);
  assert.equal(panne.etat.proprietes.ELEMENTS_VUS, undefined);
  assert.match(panne.journal(), /Message d'amorçage refusé \(HTTP 503\)/);
  panne.etat.webhook = () => ({ code: 404, texte: 'Not found' });
  panne.vider().avancer(HEURE).relever();
  assert.deepEqual(panne.postes(), ['amorcage']);
  assert.equal(panne.etat.proprietes.ELEMENTS_VUS, undefined);
  assert.equal(panne.synthese().resultat, 'webhook_refuse');
  assert.equal(panne.etat.mails.length, 1);
  panne.etat.webhook = null;
  panne.vider().avancer(HEURE).relever();
  assert.deepEqual(panne.postes(), ['amorcage'], 'amorçage retenté');
  assert.equal(panne.memoire().length, 40);
  // FR : simulation : aucun POST, ELEMENTS_VUS absente, journal / EN: dry run: no POST, missing memory, log
  const simulation = creerBanc({ items: quarante, proprietes: { WEBHOOK_URL: URL_WEBHOOK } });
  simulation.relever();
  assert.equal(simulation.etat.posts.length, 0);
  assert.equal(simulation.etat.proprietes.ELEMENTS_VUS, undefined);
  assert.match(simulation.journal(), /SIMULATION — amorçage : 40 clés seraient mémorisées, 1 message d'amorçage serait posté/);
  assert.equal(simulation.synthese().resultat, 'simulation');
}
test('CA-9 (RM-11) — premier lancement, 40 éléments : 1 seul POST (amorçage), 40 clés après le 200 ; puis 1 nouvel élément = 1 POST ; 503 persistant ou 404 : ELEMENTS_VUS absente, amorçage retenté ; simulation : aucun POST, journal', test_ca09_amorcage);

function test_ca10_plafond_ordre() {
  const vingtCinq = Array.from({ length: 25 }, (_, rang) => pub(`CERTFR-2099-AVI-${String(25 - rang).padStart(4, '0')}`, rang + 1));
  const banc = bancReel({ items: vingtCinq });
  const bilan = banc.relever();
  const attendus = Array.from({ length: 25 }, (_, rang) => `CERTFR-2099-AVI-${String(rang + 1).padStart(4, '0')}`);
  assert.deepEqual(banc.postes(), attendus.slice(0, 20), 'du plus ancien au plus récent');
  assert.equal(banc.etat.pauses.length, 19);
  assert.ok(banc.etat.pauses.every((pause) => pause >= 1100));
  const instants = banc.etat.posts.map((post) => post.instant);
  assert.ok(instants.slice(1).every((instant, rang) => instant - instants[rang] >= 1100), 'au moins 1,1 s entre deux POST');
  assert.deepEqual([bilan.publies, bilan.reportes, bilan.resultat], [20, 5, 'partiel']);
  assert.equal(banc.synthese().reportes, '5');
  banc.vider().avancer(HEURE).relever();
  assert.deepEqual(banc.postes(), attendus.slice(20));
}
test('CA-10 (RM-12) — 25 candidats : 20 publiés du plus ancien au plus récent, ≥ 1,1 s entre chaque, 5 reportés publiés à l\'exécution suivante', test_ca10_plafond_ordre);

function test_ca11_carte() {
  const codes = ['ALE', 'AVI', 'ACT', 'CTI', 'IOC', 'DUR', 'INF', 'XYZ'];
  const items = [
    ...codes.map((code, rang) => pub(`CERTFR-2099-${code}-00${rang + 1}`, 20 - rang)),
    pub('CERTFR-2099-AVI-0050', 5, { titreXml: 'Faille &amp;lt;b&amp;gt; critique &amp; =HYPERLINK("https://exemple.test") &lt;a href="https://exemple.test"&gt;ici&lt;/a&gt;' }),
    pub('CERTFR-2099-AVI-0051', 4, { lien: 'https://exemple.test/avis/CERTFR-2099-AVI-0051/' }),
    pub('CERTFR-2099-AVI-0052', 3, { lien: 'https://cert.cyber.gouv.fr.exemple.test/avis/CERTFR-2099-AVI-0052/' }),
    pub('CERTFR-2099-AVI-0053', 2, { titre: 'T'.repeat(5000), description: 'D'.repeat(20000) }),
  ];
  const banc = bancReel({ items });
  banc.relever();
  const cartes = Object.fromEntries(banc.publications().map((post) => [identifiantCharge(post.charge), post.charge]));
  assert.equal(Object.keys(cartes).length, 12);
  for (const [reference, charge] of Object.entries(cartes)) {
    assert.ok(typeof charge.text === 'string' && charge.text.length > 0 && charge.text.length <= 4000, `${reference} : text`);
    assert.ok(Array.isArray(charge.cardsV2) && charge.cardsV2[0].cardId === 'publication', `${reference} : cardsV2`);
    assert.ok(Buffer.byteLength(JSON.stringify(charge)) < 32 * 1024, `${reference} : moins de 32 Ko`);
    assert.doesNotMatch(JSON.stringify(charge), /<a[\s>]/i, `${reference} : aucun lien HTML`);
  }
  // FR : échappement (titre contenant <b> et &, formule, balise <a>) / EN: escaping
  const piege = cartes['CERTFR-2099-AVI-0050'];
  const titreCarte = piege.cardsV2[0].card.sections[0].widgets[0].textParagraph.text;
  assert.equal(titreCarte, '<b>Faille &lt;b&gt; critique &amp; =HYPERLINK("https://exemple.test") ici</b>');
  assert.match(piege.text, /Faille &lt;b&gt; critique &amp; =HYPERLINK/);
  // FR : bouton vers le lien CERT-FR / EN: button to the CERT-FR link
  const widgetsAvis = cartes['CERTFR-2099-AVI-002'].cardsV2[0].card.sections[0].widgets;
  assert.deepEqual(widgetsAvis.map((widget) => Object.keys(widget)[0]), ['textParagraph', 'decoratedText', 'decoratedText', 'textParagraph', 'buttonList'], 'ordre des widgets du design §3');
  assert.deepEqual(widgetsAvis[4].buttonList.buttons[0], { text: 'Consulter sur le CERT-FR', onClick: { openLink: { url: 'https://cert.cyber.gouv.fr/avis/CERTFR-2099-AVI-002/' } } });
  assert.equal(cartes['CERTFR-2099-AVI-002'].text, '🛡️ Avis de sécurité — CERTFR-2099-AVI-002 — Publication fictive CERTFR-2099-AVI-002');
  // FR : lien hors domaine (et domaine sosie) : pas de bouton, lien en texte / EN: foreign (and lookalike) domain: no button
  for (const reference of ['CERTFR-2099-AVI-0051', 'CERTFR-2099-AVI-0052']) {
    const json = JSON.stringify(cartes[reference]);
    assert.doesNotMatch(json, /buttonList|openLink/, `${reference} : pas de bouton`);
    assert.match(json, /Lien non vérifié \(hors domaine CERT-FR\) : https:\/\/[^"]*exemple\.test/);
  }
  // FR : marqueurs : distincts entre catégories, identiques dans une même catégorie / EN: markers distinct / identical
  const marqueur = (reference) => {
    const carte = cartes[reference].cardsV2[0].card;
    return { titre: carte.header.title, ligne: carte.sections[0].widgets.find((widget) => widget.decoratedText?.topLabel === 'Catégorie').decoratedText.text };
  };
  const parCategorie = codes.map((code, rang) => marqueur(`CERTFR-2099-${code}-00${rang + 1}`));
  assert.equal(new Set(parCategorie.map((repere) => repere.titre)).size, 8, 'en-têtes distincts');
  assert.equal(new Set(parCategorie.map((repere) => repere.ligne)).size, 8, 'lignes Catégorie distinctes');
  assert.equal(new Set(parCategorie.map((repere) => [...repere.titre][0])).size, 8, 'émojis distincts');
  assert.deepEqual(marqueur('CERTFR-2099-AVI-002'), marqueur('CERTFR-2099-AVI-0050'), 'même catégorie, même marqueur');
  assert.deepEqual(parCategorie.map((repere) => repere.titre), ['🚨 ALERTE', '🛡️ Avis de sécurité', "📰 Bulletin d'actualité", '🕵️ Rapport de menace',
    '🔎 Indicateurs de compromission', '🔒 Guide de durcissement', 'ℹ️ Information', '❔ Autre']);
  // FR : l'alerte reste la plus visible : bandeau, repli en capitales / EN: alert most visible: banner, upper-case fallback
  const alerte = cartes['CERTFR-2099-ALE-001'];
  assert.match(alerte.cardsV2[0].card.sections[0].widgets[0].textParagraph.text, /^<b><font color="#C5221F">🚨 ALERTE — vulnérabilité exploitée ou critique : à examiner en priorité<\/font><\/b>$/);
  assert.match(alerte.text, /^🚨 ALERTE — CERTFR-2099-ALE-001 — /);
  assert.equal(cartes['CERTFR-2099-AVI-0053'].text.length <= 4000, true);
}
test('CA-11 (RM-13) — cardsV2 + text ; titre avec <b>, & et formule échappé ; bouton vers le lien CERT-FR ; lien hors domaine ou sosie sans bouton ; 8 marqueurs distincts, même marqueur dans une catégorie ; alerte avec bandeau ; tailles bornées', test_ca11_carte);

function test_ca12_fils() {
  const banc = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 2), pub('CERTFR-2099-ALE-001', 1)] });
  banc.relever();
  banc.contexte.envoyerMessageTest();
  const amorcage = creerBanc({ items: [pub('CERTFR-2099-AVI-0001', 2)], proprietes: { ...PROPRIETES_REELLES } });
  amorcage.relever();
  const posts = [...banc.etat.posts, ...amorcage.etat.posts];
  assert.equal(posts.length, 4);
  for (const post of posts) {
    assert.doesNotMatch(post.payload, /thread/i, 'aucun thread ni threadKey');
    assert.equal(post.url, URL_WEBHOOK, 'URL du webhook inchangée (ni threadKey ni messageReplyOption)');
    assert.equal(post.contentType, 'application/json; charset=UTF-8');
  }
}
test('CA-12 (RM-14) — aucun thread / threadKey dans les POST (publication, test, amorçage), URL du webhook non modifiée, JSON UTF-8', test_ca12_fils);

/* ----------------------- CA-13 à CA-17 : erreurs, alertes, simulation, test, secret ----------------------- */

function test_ca13_webhook_erreurs() {
  // FR : 429 avec Retry-After: 2 → nouvel essai après 2 s / EN: 429 with Retry-After: 2 → retried after 2 s
  let numero = 0;
  const limite = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], webhook: () => (++numero === 1 ? { code: 429, entetes: { 'Retry-After': '2' } } : undefined) });
  limite.relever();
  assert.deepEqual(limite.postes(), ['CERTFR-2099-AVI-0001', 'CERTFR-2099-AVI-0001']);
  assert.deepEqual(limite.etat.pauses, [2000]);
  assert.equal(limite.etat.posts[1].instant - limite.etat.posts[0].instant, 2000);
  assert.ok(limite.memoire().includes('CERTFR-2099-AVI-0001'));
  // FR : Retry-After plafonné à 30 s / EN: Retry-After capped at 30 s
  let essai = 0;
  const plafond = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], webhook: () => (++essai === 1 ? { code: 429, entetes: { 'retry-after': '120' } } : undefined) });
  plafond.relever();
  assert.deepEqual(plafond.etat.pauses, [30000]);
  // FR : 401, 403, 404 sur le 1er de 3 : arrêt, rien de mémorisé, alerte « webhook refusé » / EN: stop, nothing stored, alert
  const items = [pub('CERTFR-2099-AVI-0003', 1), pub('CERTFR-2099-AVI-0002', 2), pub('CERTFR-2099-AVI-0001', 3)];
  for (const code of [401, 403, 404]) {
    const banc = bancReel({ items, webhook: () => ({ code, texte: '{"error":{"code":403}}' }) });
    const memoireAvant = banc.etat.proprietes.ELEMENTS_VUS;
    const bilan = banc.relever();
    assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0001'], `${code} : aucun autre POST`);
    assert.equal(banc.etat.proprietes.ELEMENTS_VUS, memoireAvant, `${code} : aucun des 3 mémorisé`);
    assert.equal(bilan.resultat, 'webhook_refuse');
    assert.deepEqual(banc.sujets(), ["[Veille CERT-FR] ALERTE — l'espace Chat refuse les publications"], `${code} : alerte`);
    assert.equal(banc.etat.mails[0].to, RESPONSABLE);
    assert.match(banc.etat.mails[0].body, new RegExp(`HTTP ${code}`));
    assert.equal(banc.synthese().alertes, 'webhookRefuse');
    // FR : toujours refusé 1 h plus tard : pas de second e-mail ; rétabli ensuite / EN: still refused 1 h later: no 2nd e-mail
    banc.vider().avancer(HEURE).relever();
    assert.equal(banc.etat.mails.length, 0, `${code} : pas de second e-mail dans les 24 h`);
    banc.etat.webhook = null;
    banc.vider().avancer(HEURE).relever();
    assert.equal(banc.etat.posts.length, 3);
    assert.deepEqual(banc.sujets(), ["[Veille CERT-FR] Rétabli — L'espace Chat accepte de nouveau les publications"]);
  }
  // FR : WEBHOOK_URL absente ou mal formée en mode réel : aucun POST, alerte « non configuré » / EN: missing or malformed
  for (const valeur of [undefined, 'https://exemple.test/webhook', 'http://chat.googleapis.com/v1/spaces/X/messages']) {
    const banc = bancReel({ items, proprietes: { WEBHOOK_URL: valeur } });
    const memoireAvant = banc.etat.proprietes.ELEMENTS_VUS;
    const bilan = banc.relever();
    assert.equal(banc.etat.posts.length, 0, `${valeur} : aucun POST`);
    assert.equal(bilan.resultat, 'webhook_absent');
    assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ALERTE — webhook Chat non configuré']);
    assert.equal(banc.etat.proprietes.ELEMENTS_VUS, memoireAvant);
    assert.match(banc.journal(), /WEBHOOK_URL est absente ou mal formée/);
  }
  // FR : exception réseau sur le flux puis succès : nouvel essai / EN: network exception on the feed then success: retried
  const reseau = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], fileFlux: [{ exception: 'Address unavailable: https://cert.cyber.gouv.fr/feed/' }] });
  const bilanReseau = reseau.relever();
  assert.equal(bilanReseau.publies, 1);
  assert.equal(reseau.gets().length, 2);
  assert.deepEqual(reseau.etat.pauses.slice(0, 1), [1000]);
  assert.match(reseau.journal(), /Essai 1 en échec \(Exception · Address unavailable/);
}
test('CA-13 (RM-15, RM-16) — 429 Retry-After: 2 réessayé après 2 s (plafond 30 s) ; 401/403/404 sur le 1er de 3 : aucun autre POST, rien mémorisé, une alerte « webhook refusé » (pas de répétition, puis rétabli) ; WEBHOOK_URL absente ou mal formée : aucun POST, alerte « non configuré » ; exception réseau réessayée', test_ca13_webhook_erreurs);

function test_ca14_flux_en_echec() {
  const items = [pub('CERTFR-2099-AVI-0900', 30)];
  const derniere = (heures) => JSON.stringify({ derniereLectureReussie: new Date(MS_MAINTENANT - heures * HEURE).toISOString(), dernierNouvelElement: new Date(MS_MAINTENANT - HEURE).toISOString() });
  const panne = () => ({ code: 503, texte: 'indisponible' });
  // FR : dernière lecture réussie il y a 7 h, lecture en échec : une alerte / EN: last successful read 7 h ago: one alert
  const banc = bancReel({ items, proprietes: { DERNIERE_EXECUTION: derniere(7) }, flux: { [URL_FLUX]: panne } });
  banc.relever();
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis 7 h']);
  const mail = banc.etat.mails[0];
  assert.equal(mail.to, RESPONSABLE);
  assert.equal(mail.name, 'Veille CERT-FR');
  assert.match(mail.body, /Code HTTP\s+503/);
  assert.match(mail.body, /Seuil configuré\s+6 h/);
  assert.match(mail.htmlBody, /role="presentation"/);
  assert.match(mail.htmlBody, /\[ALERTE\]/);
  assert.ok(banc.json('ALERTES_ENVOYEES').fluxEchec.dernierEnvoi);
  assert.equal(banc.synthese().alertes, 'fluxEchec');
  // FR : 1 h plus tard, toujours en échec : pas de seconde alerte / EN: 1 h later, still failing: no second alert
  banc.vider().avancer(HEURE).relever();
  assert.equal(banc.etat.mails.length, 0);
  // FR : plus de 24 h après le premier envoi, toujours en échec : nouvelle alerte / EN: over 24 h later: new alert
  banc.vider().avancer(23 * HEURE).relever();
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis 31 h']);
  // FR : retour à la normale : un e-mail « rétabli » / EN: back to normal: one "restored" e-mail
  banc.etat.flux[URL_FLUX] = reponseFlux(items);
  banc.vider().avancer(HEURE).relever();
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] Rétabli — Le flux CERT-FR est de nouveau lisible']);
  assert.equal(banc.json('ALERTES_ENVOYEES').fluxEchec, undefined);
  assert.equal(banc.json('DERNIERE_EXECUTION').derniereLectureReussie, new Date(banc.etat.horloge).toISOString());
  banc.vider().avancer(HEURE).relever();
  assert.equal(banc.etat.mails.length, 0, 'un seul « rétabli »');
  // FR : 5 h, 6 h exactement : pas d'alerte ; 6 h + 1 min : alerte / EN: 5 h, exactly 6 h: no alert; 6 h + 1 min: alert
  for (const [heures, attendu] of [[5, 0], [6, 0], [6 + 1 / 60, 1]]) {
    const seuil = bancReel({ items, proprietes: { DERNIERE_EXECUTION: derniere(heures) }, flux: { [URL_FLUX]: panne } });
    seuil.relever();
    assert.equal(seuil.etat.mails.length, attendu, `${heures} h`);
  }
  // FR : sans lecture réussie antérieure : depuis la première tentative / EN: without earlier success: since the first attempt
  const jamais = bancReel({ items, flux: { [URL_FLUX]: panne } });
  jamais.relever();
  assert.equal(jamais.etat.mails.length, 0);
  jamais.vider().avancer(7 * HEURE).relever();
  assert.deepEqual(jamais.sujets(), ['[Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis 7 h']);
  // FR : aucune alerte n'est postée dans Chat / EN: no alert is posted to Chat
  for (const post of [...banc.etat.posts, ...jamais.etat.posts]) assert.doesNotMatch(post.payload, /Alerte de fonctionnement|illisible depuis|\[Veille CERT-FR\]/);
  assert.equal(jamais.etat.posts.length, 0);
}
test('CA-14 (RM-17) — dernière lecture réussie il y a 7 h + échec : une alerte « flux en échec » ; 5 h ou 6 h : aucune ; 1 h plus tard : pas de seconde ; après 24 h : nouvelle ; retour à la normale : un « rétabli » ; sans lecture réussie : depuis la 1re tentative ; rien dans Chat', test_ca14_flux_en_echec);

function test_ca15_simulation() {
  const etatAlertes = JSON.stringify({ webhookAbsent: { debut: '2026-10-20T08:00:00.000Z', dernierEnvoi: '2026-10-20T08:00:00.000Z' } });
  const items = [pub('CERTFR-2099-AVI-0003', 1), pub('CERTFR-2099-AVI-0002', 2), pub('CERTFR-2099-ALE-001', 3), pub('CERTFR-2099-AVI-0900', 30)];
  for (const valeur of [undefined, 'true', ' TRUE ', 'oui']) {
    const banc = creerBanc({ items, proprietes: { DRY_RUN: valeur, WEBHOOK_URL: URL_WEBHOOK, ADRESSE_ALERTE: RESPONSABLE, ELEMENTS_VUS: JSON.stringify(CLES_ANCIENNES), ALERTES_ENVOYEES: etatAlertes } });
    const bilan = banc.relever();
    assert.equal(banc.etat.posts.length, 0, `DRY_RUN=${valeur} : zéro POST`);
    assert.ok(banc.etat.requetes.every((requete) => requete.methode === 'get' && requete.url === URL_FLUX), 'seule la lecture du flux');
    assert.equal(banc.etat.proprietes.ELEMENTS_VUS, JSON.stringify(CLES_ANCIENNES), 'mémoire inchangée');
    assert.equal(banc.etat.proprietes.ALERTES_ENVOYEES, etatAlertes, 'ALERTES_ENVOYEES inchangée');
    assert.deepEqual(banc.etat.ecritures, ['DERNIERE_EXECUTION'], 'seul l\'état de la dernière exécution est écrit');
    assert.equal(banc.etat.mails.length, 0, 'aucun MailApp');
    assert.equal(bilan.resultat, 'simulation');
    const journal = banc.journal();
    assert.equal(compter(journal, /SIMULATION — message non posté : cle=/), 3);
    for (const reference of ['CERTFR-2099-ALE-001', 'CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0003']) {
      assert.match(journal, new RegExp(`SIMULATION — message non posté : cle=${reference} categorie=[A-Z]+ taille=\\d+ octets titre="Publication fictive ${reference}"`));
    }
    assert.equal(banc.lignes(/SIMULATION — JSON du premier message/).length, 1, 'JSON du premier seulement');
    assert.match(banc.lignes(/SIMULATION — JSON du premier message/)[0].texte, /"cardsV2"/);
    const synthese = banc.synthese();
    assert.equal(synthese.dryRun, 'true');
    assert.equal(synthese.resultat, 'simulation');
  }
  // FR : simulation + flux en échec depuis 7 h : alerte décrite, jamais envoyée / EN: dry run + failing feed: alert described only
  const echec = creerBanc({
    items, flux: { [URL_FLUX]: () => ({ code: 500 }) },
    proprietes: { ADRESSE_ALERTE: RESPONSABLE, ELEMENTS_VUS: JSON.stringify(CLES_ANCIENNES), DERNIERE_EXECUTION: JSON.stringify({ derniereLectureReussie: new Date(MS_MAINTENANT - 7 * HEURE).toISOString() }) },
  });
  echec.relever();
  assert.equal(echec.etat.mails.length, 0);
  assert.equal(echec.etat.proprietes.ALERTES_ENVOYEES, undefined);
  assert.match(echec.journal(), /SIMULATION — e-mail non envoyé : fluxEchec — \[Veille CERT-FR\] ALERTE — flux CERT-FR illisible depuis 7 h/);
  assert.equal(echec.synthese().alertes, 'simulees:fluxEchec');
  // FR : simulation sans webhook : simple mention / EN: dry run without webhook: plain mention
  const sansWebhook = creerBanc({ items, proprietes: { ELEMENTS_VUS: JSON.stringify(CLES_ANCIENNES) } });
  sansWebhook.relever();
  assert.match(sansWebhook.journal(), /WEBHOOK_URL absente ou mal formée \(sans conséquence en simulation\)/);
  assert.equal(sansWebhook.etat.mails.length, 0);
  // FR : DRY_RUN=false (casse tolérée) → réel / EN: DRY_RUN=false → live
  const reel = bancReel({ items, proprietes: { DRY_RUN: ' FALSE ' } });
  reel.relever();
  assert.equal(reel.etat.posts.length, 3);
}
test('CA-15 (RM-18) — simulation (CONFIG ou propriété true/oui) : zéro POST, mémoire et ALERTES_ENVOYEES inchangées, aucun MailApp, journal des 3 messages et JSON du premier ; alerte décrite (simulees:fluxEchec) ; DRY_RUN=false → réel', test_ca15_simulation);

function test_ca16_test_et_verrou() {
  const memoire = JSON.stringify(CLES_ANCIENNES);
  const banc = creerBanc({ items: [pub('CERTFR-2099-AVI-0001', 1)], proprietes: { WEBHOOK_URL: URL_WEBHOOK, ELEMENTS_VUS: memoire } });
  assert.equal(banc.contexte.envoyerMessageTest(), 200);
  assert.deepEqual(banc.postes(), ['test'], 'un seul message, même en simulation');
  const charge = banc.etat.posts[0].charge;
  assert.equal(charge.cardsV2[0].card.header.title, '🧪 TEST — Veille CERT-FR');
  assert.match(charge.text, /^🧪 TEST — Veille CERT-FR — message de test du 22\/10\/2026 10:00/);
  assert.match(JSON.stringify(charge), /Simulation \(DRY_RUN activé\) : seul ce message de test est posté/);
  assert.doesNotMatch(JSON.stringify(charge), /CERTFR-/);
  assert.equal(banc.etat.proprietes.ELEMENTS_VUS, memoire);
  assert.deepEqual(banc.etat.ecritures, [], 'aucune écriture');
  assert.equal(banc.gets().length, 0, 'le flux n\'est pas lu');
  assert.match(banc.journal(), /Message de test envoyé \(HTTP 200\)/);
  // FR : mode réel : libellé « Mode réel » ; mémoire absente reste absente / EN: live mode label; missing memory stays missing
  const reel = creerBanc({ proprietes: { ...PROPRIETES_REELLES } });
  reel.contexte.envoyerMessageTest();
  assert.match(JSON.stringify(reel.etat.posts[0].charge), /Mode réel \(DRY_RUN désactivé\)/);
  assert.equal(reel.etat.proprietes.ELEMENTS_VUS, undefined);
  // FR : webhook absent ou refusé : exception, rien de plus / EN: missing or refused webhook: exception
  const absent = creerBanc();
  assert.throws(() => absent.contexte.envoyerMessageTest(), /WEBHOOK_URL est absente ou mal formée/);
  assert.equal(absent.etat.posts.length, 0);
  const refuse = creerBanc({ proprietes: { WEBHOOK_URL: URL_WEBHOOK }, webhook: () => ({ code: 403, texte: 'PERMISSION_DENIED' }) });
  assert.throws(() => refuse.contexte.envoyerMessageTest(), /Message de test refusé \(HTTP 403\)/);
  assert.equal(refuse.etat.posts.length, 1);
  // FR : verrou non obtenu : rien n'est lu ni posté / EN: lock not obtained: nothing read nor posted
  const occupe = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], verrouLibre: false });
  const bilan = occupe.relever();
  assert.equal(bilan.resultat, 'verrou_non_obtenu');
  assert.deepEqual([occupe.etat.requetes.length, occupe.etat.posts.length, occupe.etat.ecritures.length, occupe.etat.mails.length], [0, 0, 0, 0]);
  assert.deepEqual(occupe.etat.attentesVerrou, [30000]);
  assert.deepEqual(occupe.synthese(), { resultat: 'verrou_non_obtenu' });
  assert.match(occupe.journal(), /Une autre exécution est en cours/);
  assert.throws(() => occupe.contexte.envoyerMessageTest(), /Une autre exécution est en cours/);
  assert.equal(occupe.etat.posts.length, 0);
  // FR : le verrou est relâché après une relève / EN: the lock is released after a run
  const libre = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)] });
  libre.relever();
  assert.equal(libre.etat.verrouTenu, false);
}
test('CA-16 (RM-19, RM-20) — envoyerMessageTest() : un seul message « TEST », même en simulation, mémoire intacte, flux non lu ; webhook absent ou 403 : exception ; verrou non obtenu : rien lu ni posté, synthèse réduite ; verrou relâché', test_ca16_test_et_verrou);

function test_ca17_secret() {
  const textes = [];
  const recueillir = (banc) => {
    textes.push(banc.journal());
    for (const mail of banc.etat.mails) textes.push(mail.subject, mail.body, mail.htmlBody);
  };
  const items = [pub('CERTFR-2099-AVI-0003', 1), pub('CERTFR-2099-AVI-0002', 2), pub('CERTFR-2099-AVI-0001', 3)];
  // FR : exception réseau contenant l'URL complète, puis succès / EN: network exception holding the full URL, then success
  let numero = 0;
  const reseau = bancReel({ items, webhook: () => (++numero === 1 ? { exception: `Address unavailable: ${URL_WEBHOOK}` } : undefined) });
  reseau.relever();
  assert.match(reseau.journal(), /Essai 1 en échec/);
  recueillir(reseau);
  // FR : 400 dont le corps cite l'espace, 401, absent / EN: 400 whose body quotes the space, 401, missing
  const refus = bancReel({ items, webhook: webhookPour({ 'CERTFR-2099-AVI-0002': { code: 400, texte: `{"error":{"message":"Invalid card in spaces/${ID_ESPACE}"}}` } }) });
  refus.relever();
  recueillir(refus);
  const refuse = bancReel({ items, webhook: () => ({ code: 401, texte: `Unauthorized ${URL_WEBHOOK}` }) });
  refuse.relever();
  recueillir(refuse);
  // FR : message de test refusé (le corps cite l'URL) / EN: refused test message (body quotes the URL)
  const test = creerBanc({ proprietes: { WEBHOOK_URL: URL_WEBHOOK }, webhook: () => ({ code: 404, texte: `Not found: ${URL_WEBHOOK}` }) });
  try {
    test.contexte.envoyerMessageTest();
    assert.fail('exception attendue');
  } catch (erreur) {
    textes.push(String(erreur.message), String(erreur.stack));
  }
  recueillir(test);
  const testReseau = creerBanc({ proprietes: { WEBHOOK_URL: URL_WEBHOOK }, webhook: () => ({ exception: `Timeout: ${URL_WEBHOOK}` }) });
  assert.throws(() => testReseau.contexte.envoyerMessageTest(), (erreur) => { textes.push(erreur.message); return true; });
  recueillir(testReseau);
  // FR : diagnostic avec webhook valide puis mal formé / EN: diagnostic with valid then malformed webhook
  const diagnostic = creerBanc({ items, proprietes: { WEBHOOK_URL: URL_WEBHOOK, ELEMENTS_VUS: '[]' } });
  textes.push(diagnostic.contexte.diagnostiquer());
  recueillir(diagnostic);
  const malForme = creerBanc({ items, proprietes: { WEBHOOK_URL: URL_WEBHOOK.replace('https:', 'http:') } });
  textes.push(malForme.contexte.diagnostiquer());
  recueillir(malForme);
  // FR : simulation / EN: dry run
  const simulation = creerBanc({ items, proprietes: { WEBHOOK_URL: URL_WEBHOOK, ELEMENTS_VUS: '[]' } });
  simulation.relever();
  recueillir(simulation);
  const tout = textes.join('\n');
  assert.ok(tout.length > 5000);
  for (const secret of [ID_ESPACE, CLE_WEBHOOK, JETON_WEBHOOK]) assert.ok(!tout.includes(secret), `secret « ${secret} » divulgué`);
  assert.doesNotMatch(tout, /key=(?!\*\*\*)[^\s&"'<]+/, 'paramètre key= en clair');
  assert.doesNotMatch(tout, /token=(?!\*\*\*)[^\s&"'<]+/, 'paramètre token= en clair');
  assert.match(tout, /https:\/\/chat\.googleapis\.com\/v1\/spaces\/\*\*\*/, 'URL masquée présente au diagnostic');
  assert.equal(diagnostic.evaluer(`masquerUrl_('${URL_WEBHOOK}')`), 'https://chat.googleapis.com/v1/spaces/***');
}
test('CA-17 (RM-22) — ni l\'ID d\'espace, ni la clé, ni le jeton du webhook dans le journal, les e-mails, le diagnostic ou les exceptions (exception réseau, corps d\'erreur 400/401/404 citant l\'URL)', test_ca17_secret);

/* ----------------------- CA-18 : déclencheur et diagnostic ----------------------- */

function test_ca18_declencheur_diagnostic() {
  const banc = creerBanc({ declencheurs: ['autreFonction'] });
  banc.contexte.installerDeclencheur();
  banc.contexte.installerDeclencheur();
  const surRelever = banc.etat.declencheurs.filter((declencheur) => declencheur.getHandlerFunction() === 'relever');
  assert.equal(surRelever.length, 1, 'un seul déclencheur sur relever');
  assert.equal(surRelever[0].heures, 1, 'toutes les heures');
  assert.ok(banc.etat.declencheurs.some((declencheur) => declencheur.getHandlerFunction() === 'autreFonction'), 'autre déclencheur conservé');
  assert.match(banc.journal(), /Déclencheur horaire installé sur relever\(\)/);
  assert.equal(banc.contexte.supprimerDeclencheur(), 1);
  assert.equal(banc.etat.declencheurs.length, 1);
  assert.match(banc.journal(), /1 déclencheur\(s\) supprimé\(s\) sur relever\(\)/);
  // FR : diagnostic : aucun POST, aucune écriture, lignes à mot-état / EN: diagnostic: no POST, no write, status-word lines
  const items = [pub('CERTFR-2099-AVI-0002', 1), pub('CERTFR-2099-AVI-0001', 2), pub('CERTFR-2099-ALE-001', 3), pub('CERTFR-2099-XYZ-001', 4)];
  const derniere = JSON.stringify({ date: new Date(MS_MAINTENANT - HEURE).toISOString(), resultat: 'ok', derniereLectureReussie: new Date(MS_MAINTENANT - HEURE).toISOString() });
  const diag = bancReel({ items, declencheurs: ['relever'], proprietes: { DERNIERE_EXECUTION: derniere, CONFIRMER_REINITIALISATION: 'oui', AGE_MAX_JOURS: 'abc' } });
  const texte = diag.contexte.diagnostiquer();
  assert.equal(diag.etat.posts.length, 0, 'aucun POST');
  assert.ok(diag.etat.requetes.every((requete) => requete.methode === 'get'));
  assert.deepEqual(diag.etat.ecritures, [], 'aucune écriture');
  const lignes = texte.split('\n');
  assert.match(lignes[0], /^=== Diagnostic Veille CERT-FR — 22\/10\/2026 10:00 \/ CERT-FR watch diagnostic — 22\/10\/2026 10:00 ===$/);
  assert.match(lignes[lignes.length - 1], /^=== Fin du diagnostic/);
  for (const ligne of lignes.slice(1, -1)) assert.match(ligne, /^(OK|ATTENTION|ERREUR|INFO)\b/, `ligne sans mot-état : ${ligne}`);
  assert.match(texte, /OK\s+Flux : HTTP 200 · URL finale https:\/\/cert\.cyber\.gouv\.fr\/feed\/ \(pas de redirection\)/);
  assert.match(texte, /OK\s+Éléments : 4 lus, 0 ignorés/);
  assert.match(texte, /OK\s+Catégories : AVI×2, ALE×1, AUTRE×1/);
  assert.match(texte, /ATTENTION \/ WARNING\s+Références non reconnues : 1/);
  assert.match(texte, /OK\s+WEBHOOK_URL : présente, forme valide \(https:\/\/chat\.googleapis\.com\/v1\/spaces\/\*\*\*\)/);
  assert.match(texte, /INFO\s+Mémoire : 2 clés \(sur 300 au plus\)/);
  assert.match(texte, /OK\s+Déclencheur : 1 déclencheur horaire sur relever\(\)/);
  assert.match(texte, /INFO\s+Dernière exécution : 22\/10\/2026 09:00 · ok · dernière lecture réussie 22\/10\/2026 09:00/);
  assert.match(texte, /OK\s+Scopes : script\.external_request, script\.scriptapp, script\.send_mail/);
  assert.match(texte, /ATTENTION \/ WARNING\s+AGE_MAX_JOURS : valeur de propriété invalide ignorée, 7 utilisé/);
  assert.match(texte, /ATTENTION \/ WARNING\s+CONFIRMER_REINITIALISATION : renseignée \(oui\)/);
  assert.match(texte, /INFO\s+Mode : DRY_RUN=false \(réel, propriété\)/);
  assert.match(texte, /OK\s+ADRESSE_ALERTE : présente \(p\*\*\*@exemple\.test\)/);
  assert.match(texte, /INFO\s+Plus récent|OK\s+Plus récent : 22\/10\/2026 09:00/);
  // FR : redirection, flux en 403, webhook absent (simulation / réel), aucun déclencheur / EN: redirect, 403, missing webhook
  const redirige = creerBanc({ flux: { [URL_FLUX]: { code: 301, entetes: { Location: URL_ANCIEN_FLUX } }, [URL_ANCIEN_FLUX]: reponseFlux(items) } });
  const texteRedirige = redirige.contexte.diagnostiquer();
  assert.match(texteRedirige, /Redirections : https:\/\/www\.cert\.ssi\.gouv\.fr\/feed\//);
  assert.match(texteRedirige, /URL finale https:\/\/www\.cert\.ssi\.gouv\.fr\/feed\/ \(redirection suivie\)/);
  assert.match(texteRedirige, /ATTENTION \/ WARNING\s+WEBHOOK_URL : absente/);
  assert.match(texteRedirige, /ATTENTION \/ WARNING\s+Déclencheur : aucun/);
  const interdit = bancReel({ flux: { [URL_FLUX]: { code: 403, texte: 'Forbidden' } }, proprietes: { WEBHOOK_URL: undefined } });
  const texteInterdit = interdit.contexte.diagnostiquer();
  assert.match(texteInterdit, /ERREUR \/ ERROR\s+Flux : Le flux CERT-FR ne répond pas correctement — HTTP 403 après 1 essais/);
  assert.match(texteInterdit, /ERREUR \/ ERROR\s+WEBHOOK_URL : absente/);
  assert.equal(interdit.etat.posts.length, 0);
}
test('CA-18 (RM-23, RM-24) — deux installerDeclencheur() laissent un seul déclencheur horaire (autres conservés), supprimerDeclencheur() ; diagnostiquer() sans POST ni écriture, lignes à mot-état, flux, catégories, webhook masqué, mémoire, scopes, réglage invalide, redirection, 403', test_ca18_declencheur_diagnostic);

/* ----------------------- CA-20 à CA-23 ----------------------- */

function test_ca20_refus_400() {
  const items = [pub('CERTFR-2099-AVI-0003', 1), pub('CERTFR-2099-AVI-0002', 2), pub('CERTFR-2099-AVI-0001', 3)];
  const refus = { code: 400, texte: '{"error":{"code":400,"message":"Invalid JSON payload"}}' };
  const banc = bancReel({ items, webhook: webhookPour({ 'CERTFR-2099-AVI-0002': refus, 'CERTFR-2099-AVI-0004': refus, 'CERTFR-2099-AVI-0005': refus }) });
  const bilan = banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0001', 'CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0003'], '400 non réessayé, le 3e publié');
  const memoire = banc.memoire();
  for (const cle of ['CERTFR-2099-AVI-0001', 'CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0003']) assert.ok(memoire.includes(cle), `${cle} mémorisé`);
  assert.match(banc.journal(), /Publication refusée \(400\), élément écarté : cle=CERTFR-2099-AVI-0002 taille=\d+/);
  assert.deepEqual([bilan.publies, bilan.refuses, bilan.resultat], [2, 1, 'partiel']);
  assert.equal(banc.synthese().refuses, '1');
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ATTENTION — une publication a été refusée par Chat (CERTFR-2099-AVI-0002)']);
  assert.match(banc.etat.mails[0].body, /Référence\s+CERTFR-2099-AVI-0002/);
  assert.equal(banc.json('ALERTES_ENVOYEES').publicationRefusee.dernierEnvoi, new Date(MS_MAINTENANT).toISOString());
  // FR : second 400 dans les 24 h : pas de second e-mail / EN: second 400 within 24 h: no second e-mail
  banc.vider().avancer(HEURE).definirFlux([pubA('CERTFR-2099-AVI-0004', banc.etat.horloge - HEURE / 2), ...items]);
  banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0004'], 'le 2e n\'est pas retenté');
  assert.equal(banc.etat.mails.length, 0);
  assert.ok(banc.memoire().includes('CERTFR-2099-AVI-0004'));
  // FR : exécution suivante : rien à retenter / EN: next run: nothing to retry
  banc.vider().avancer(HEURE).relever();
  assert.equal(banc.etat.posts.length, 0);
  // FR : plus de 24 h après : un nouvel e-mail / EN: over 24 h later: a new e-mail
  banc.vider().avancer(23 * HEURE).definirFlux([pubA('CERTFR-2099-AVI-0005', banc.etat.horloge - HEURE / 2), ...items]);
  banc.relever();
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ATTENTION — une publication a été refusée par Chat (CERTFR-2099-AVI-0005)']);
}
test('CA-20 (RM-16, D-8) — 400 sur le 2e de 3 : 1er et 3e publiés, les 3 mémorisés, 2e journalisé « écarté » avec sa clé, un e-mail « message refusé » ; second 400 dans les 24 h : pas d\'e-mail ; le 2e jamais retenté ; après 24 h : nouvel e-mail', test_ca20_refus_400);

function test_ca21_flux_muet() {
  const connus = [pub('CERTFR-2099-AVI-0900', 6 * 24 + 2)];
  const banc = bancReel({ items: connus, proprietes: { DERNIERE_EXECUTION: JSON.stringify({ derniereLectureReussie: new Date(MS_MAINTENANT - HEURE).toISOString(), dernierNouvelElement: new Date(MS_MAINTENANT - 6 * JOUR).toISOString() }) } });
  banc.relever();
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ATTENTION — aucune nouvelle publication depuis 6 jours']);
  assert.match(banc.etat.mails[0].body, /Aucun rappel ne sera envoyé/);
  // FR : exécutions suivantes sans nouvel élément : aucun autre e-mail / EN: later runs without new item: no other e-mail
  for (const delai of [HEURE, JOUR, 3 * JOUR]) {
    banc.vider().avancer(delai).relever();
    assert.equal(banc.etat.mails.length, 0, `aucun rappel après ${delai / HEURE} h`);
  }
  // FR : nouvel élément : un « rétabli » / EN: new item: one "restored"
  banc.vider().avancer(HEURE).definirFlux([pubA('CERTFR-2099-AVI-0901', banc.etat.horloge - HEURE / 2), ...connus]);
  banc.relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0901']);
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] Rétabli — De nouvelles publications sont de nouveau reçues']);
  assert.equal(banc.json('DERNIERE_EXECUTION').dernierNouvelElement, new Date(banc.etat.horloge).toISOString());
  // FR : 5 jours pile : rien ; nouveau silence de plus de 5 jours : un seul e-mail / EN: exactly 5 days: nothing; new silence: one e-mail
  banc.vider().avancer(5 * JOUR).relever();
  assert.equal(banc.etat.mails.length, 0, '5 jours exactement : pas encore');
  banc.vider().avancer(HEURE).relever();
  assert.deepEqual(banc.sujets(), ['[Veille CERT-FR] ATTENTION — aucune nouvelle publication depuis 5 jours']);
  banc.vider().avancer(JOUR).relever();
  assert.equal(banc.etat.mails.length, 0);
}
test('CA-21 (RM-17, D-9) — 6 jours sans nouvel élément : un e-mail « flux muet » ; +1 h, +1 j, +3 j : aucun autre ; nouvel élément : un « rétabli » ; nouveau silence > 5 jours : un seul e-mail', test_ca21_flux_muet);

function test_ca22_reinitialisation() {
  const memoire = JSON.stringify(CLES_ANCIENNES);
  for (const valeur of [undefined, 'non', '1', 'ouii', '']) {
    const banc = creerBanc({ proprietes: { ...PROPRIETES_REELLES, ELEMENTS_VUS: memoire, CONFIRMER_REINITIALISATION: valeur } });
    assert.equal(banc.contexte.reinitialiserMemoire(), false, `${valeur}`);
    assert.equal(banc.etat.proprietes.ELEMENTS_VUS, memoire, `${valeur} : mémoire intacte`);
    assert.deepEqual(banc.etat.ecritures, []);
    assert.match(banc.journal(), /Réinitialisation refusée : saisir la propriété CONFIRMER_REINITIALISATION = oui/);
    assert.deepEqual([banc.etat.requetes.length, banc.etat.posts.length], [0, 0]);
  }
  const banc = creerBanc({ items: [pub('CERTFR-2099-AVI-0001', 1)], proprietes: { ...PROPRIETES_REELLES, ELEMENTS_VUS: memoire, CONFIRMER_REINITIALISATION: ' OUI ' } });
  assert.equal(banc.contexte.reinitialiserMemoire(), true);
  assert.equal(banc.etat.proprietes.ELEMENTS_VUS, undefined, 'ELEMENTS_VUS supprimée');
  assert.equal(banc.etat.proprietes.CONFIRMER_REINITIALISATION ?? '', '', 'confirmation remise à vide');
  assert.match(banc.journal(), /Mémoire effacée : le prochain lancement refera l'amorçage/);
  banc.etat.proprietes.ELEMENTS_VUS = memoire;
  assert.equal(banc.contexte.reinitialiserMemoire(), false, 'second appel immédiat sans effet');
  assert.equal(banc.etat.proprietes.ELEMENTS_VUS, memoire);
  assert.deepEqual([banc.etat.requetes.length, banc.etat.posts.length], [0, 0], 'aucun POST');
  // FR : après réinitialisation, la relève refait l'amorçage (RM-11) / EN: after reset, the run bootstraps again
  delete banc.etat.proprietes.ELEMENTS_VUS;
  banc.relever();
  assert.deepEqual(banc.postes(), ['amorcage']);
  // FR : verrou occupé : rien / EN: busy lock: nothing
  const occupe = creerBanc({ proprietes: { ELEMENTS_VUS: memoire, CONFIRMER_REINITIALISATION: 'oui' }, verrouLibre: false });
  assert.equal(occupe.contexte.reinitialiserMemoire(), false);
  assert.equal(occupe.etat.proprietes.ELEMENTS_VUS, memoire);
}
test('CA-22 (RM-25, D-10) — sans CONFIRMER_REINITIALISATION ou avec « non », « 1 » : rien ; « OUI » avec espaces : ELEMENTS_VUS supprimée et confirmation vidée ; second appel sans effet ; aucun POST ; puis amorçage', test_ca22_reinitialisation);

function test_ca23_reglages_langue() {
  // FR : MAX_PUBLICATIONS_PAR_EXECUTION=5, 8 candidats → 5 POST / EN: 8 candidates → 5 POSTs
  const huit = Array.from({ length: 8 }, (_, rang) => pub(`CERTFR-2099-AVI-${String(8 - rang).padStart(4, '0')}`, rang + 1));
  const plafond = bancReel({ items: huit, proprietes: { MAX_PUBLICATIONS_PAR_EXECUTION: '5' } });
  const bilan = plafond.relever();
  assert.equal(plafond.etat.posts.length, 5);
  assert.equal(bilan.reportes, 3);
  // FR : AGE_MAX_JOURS invalide → 7 (CONFIG), avertissement / EN: invalid AGE_MAX_JOURS → 7, warning
  for (const valeur of ['abc', '0', '-3', '2.5']) {
    const banc = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 6 * 24), pub('CERTFR-2099-AVI-0002', 8 * 24)], proprietes: { AGE_MAX_JOURS: valeur } });
    banc.relever();
    assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0001'], `AGE_MAX_JOURS=${valeur}`);
    assert.match(banc.journal(), /Réglage AGE_MAX_JOURS invalide \(entier ≥ 1 attendu\) : valeur de CONFIG utilisée \(7\)/);
  }
  const deux = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 3 * 24)], proprietes: { AGE_MAX_JOURS: '2' } });
  deux.relever();
  assert.equal(deux.etat.posts.length, 0, 'AGE_MAX_JOURS=2 appliqué');
  // FR : SEUIL_ECHEC_HEURES=3 : alerte à 4 h / EN: SEUIL_ECHEC_HEURES=3: alert at 4 h
  const seuil = bancReel({ flux: { [URL_FLUX]: { code: 500 } }, proprietes: { SEUIL_ECHEC_HEURES: '3', DERNIERE_EXECUTION: JSON.stringify({ derniereLectureReussie: new Date(MS_MAINTENANT - 4 * HEURE).toISOString() }) } });
  seuil.relever();
  assert.equal(seuil.etat.mails.length, 1);
  // FR : LANGUE=en : message et e-mail en anglais / EN: LANGUE=en: message and e-mail in English
  const anglais = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 2), pub('CERTFR-2099-ALE-001', 1)], proprietes: { LANGUE: 'en' }, webhook: webhookPour({ 'CERTFR-2099-ALE-001': { code: 403 } }) });
  anglais.relever();
  const carte = anglais.etat.posts[0].charge;
  assert.equal(carte.cardsV2[0].card.header.title, '🛡️ Security advisory');
  const json = JSON.stringify(carte);
  for (const libelle of ['"Category"', '"Published on"', '"Read on CERT-FR"']) assert.ok(json.includes(libelle), `libellé ${libelle}`);
  assert.doesNotMatch(json, /Catégorie|Publié le|Consulter/);
  assert.match(carte.text, /^🛡️ Security advisory — CERTFR-2099-AVI-0001/);
  assert.deepEqual(anglais.sujets(), ['[CERT-FR watch] ALERT — the Chat space rejects posts']);
  assert.match(anglais.etat.mails[0].body, /To do/);
  assert.doesNotMatch(anglais.etat.mails[0].body, /Dernière exécution|À faire/);
  // FR : LANGUE=de : français, journalisé / EN: LANGUE=de: French, logged
  const allemand = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], proprietes: { LANGUE: 'de' } });
  allemand.relever();
  assert.equal(allemand.etat.posts[0].charge.cardsV2[0].card.header.title, '🛡️ Avis de sécurité');
  assert.match(allemand.journal(), /LANGUE inconnue \(de\) : français utilisé/);
}
test('CA-23 (RM-26, D-11) — MAX_PUBLICATIONS_PAR_EXECUTION=5 : 5 POST sur 8 ; AGE_MAX_JOURS abc / 0 / -3 / 2.5 : 7 appliqué et avertissement ; surcharges valides appliquées ; LANGUE=en : carte et e-mail en anglais ; LANGUE=de : français, journalisé', test_ca23_reglages_langue);

/* ----------------------- Transverse : garde de temps, redirections, journal, cas vides, scopes ----------------------- */

function test_garde_de_temps() {
  const cinq = Array.from({ length: 5 }, (_, rang) => pub(`CERTFR-2099-AVI-${String(5 - rang).padStart(4, '0')}`, rang + 1));
  const banc = bancReel({ items: cinq, webhook: () => ({ code: 200, avance: 100 * 1000 }) });
  // FR : pire cas d'un POST = pause 1,1 s + 2 attentes Retry-After max (2 × 30 s) + 3 appels de 30 s = 151,1 s ; un POST ne
  //      part que si (écoulé + 151,1 s) ≤ 300 s, soit écoulé ≤ 148,9 s. POST de 100 s : 1er à 0 s (fin 100 s), 2e à 100 s
  //      (pause 1,1 s, fin 201,1 s), 3e refusé (201,1 s > 148,9 s) → 2 publiés, 3 reportés.
  // EN: worst case of a POST = 151.1 s; a POST starts only when elapsed ≤ 148.9 s → 2 posted, 3 deferred.
  const pireCas = 1100 + (3 - 1) * 30000 + 3 * 30000;
  assert.equal(banc.evaluer('margePublicationMs_()'), pireCas);
  const seuilMs = 5 * 60 * 1000 - pireCas;
  const debuts = [];
  let ecoule = 0;
  for (let rang = 0; rang < 5 && ecoule <= seuilMs; rang++) {
    if (rang > 0) ecoule += 1100;
    debuts.push(ecoule);
    ecoule += 100 * 1000;
  }
  assert.equal(debuts.length, 2, 'calcul indépendant du banc');
  const bilan = banc.relever();
  assert.ok(bilan.gardeTemps);
  assert.equal(bilan.resultat, 'garde_temps');
  assert.equal(banc.etat.posts.length, debuts.length);
  assert.equal(bilan.reportes, 5 - debuts.length);
  assert.ok(banc.etat.horloge - MS_MAINTENANT + pireCas > 5 * 60 * 1000 && banc.etat.horloge - MS_MAINTENANT < 5 * 60 * 1000, 'arrêt avant 5 min');
  assert.match(banc.journal(), /Arrêt avant la limite de temps/);
  assert.deepEqual(banc.memoire().slice(0, 2), ['CERTFR-2099-AVI-0002', 'CERTFR-2099-AVI-0001'], 'publiés mémorisés');
  assert.ok(!banc.memoire().includes('CERTFR-2099-AVI-0003'));
  banc.etat.webhook = null;
  banc.vider().avancer(HEURE).relever();
  assert.deepEqual(banc.postes(), ['CERTFR-2099-AVI-0003', 'CERTFR-2099-AVI-0004', 'CERTFR-2099-AVI-0005'], 'reprise exacte sans retraitement');
  // FR : le pire cas suit les réglages (ESSAIS, RETRY_AFTER_MAX_MS, DUREE_APPEL_MAX_MS) / EN: worst case follows the settings
  const autre = creerBanc({ config: { NOUVEL_ESSAI: { ESSAIS: 2, RETRY_AFTER_MAX_MS: 10000 }, DUREE_APPEL_MAX_MS: 20000 } });
  assert.equal(autre.evaluer('margePublicationMs_()'), 1100 + 10000 + 2 * 20000);
}
test('Garde de temps (RM-20) — pire cas d\'un POST = 151,1 s ; POST de 100 s : 2 publiés puis arrêt propre avant 5 min, publiés mémorisés, reste reporté et publié à l\'exécution suivante sans doublon', test_garde_de_temps);

function test_redirections_et_url() {
  const items = [pub('CERTFR-2099-AVI-0001', 1, { lien: '/avis/CERTFR-2099-AVI-0001/', guid: '' })];
  const banc = bancReel({ flux: { [URL_FLUX]: { code: 301, entetes: { Location: URL_ANCIEN_FLUX } }, [URL_ANCIEN_FLUX]: reponseFlux(items) } });
  banc.relever();
  assert.deepEqual(banc.gets().map((requete) => requete.url), [URL_FLUX, URL_ANCIEN_FLUX]);
  assert.ok(banc.gets().every((requete) => requete.followRedirects === false && requete.muteHttpExceptions === true));
  assert.match(banc.gets()[0].entetes['User-Agent'], /GWS-Veille-CERT-FR/);
  const bouton = banc.publications()[0].charge.cardsV2[0].card.sections[0].widgets.find((widget) => widget.buttonList).buttonList.buttons[0];
  assert.equal(bouton.onClick.openLink.url, 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2099-AVI-0001/', 'lien relatif résolu sur l\'URL finale');
  // FR : Location relative et 308 / EN: relative Location and 308
  const relative = bancReel({ flux: { [URL_FLUX]: { code: 308, entetes: { location: '/flux/' } }, 'https://cert.cyber.gouv.fr/flux/': reponseFlux([pub('CERTFR-2099-AVI-0002', 1)]) } });
  relative.relever();
  assert.equal(relative.etat.posts.length, 1);
  // FR : boucle de redirections : échec propre / EN: redirect loop: clean failure
  const boucle = bancReel({ flux: { [URL_FLUX]: { code: 302, entetes: { Location: URL_FLUX } } } });
  const bilan = boucle.relever();
  assert.equal(bilan.resultat, 'echec_flux');
  assert.equal(boucle.gets().length, 6);
  assert.match(boucle.journal(), /trop de redirections/);
  // FR : URL_FLUX surchargée (ancien domaine) ; URL_FLUX http invalide → défaut + avertissement / EN: overridden URL_FLUX
  const surcharge = bancReel({ proprietes: { URL_FLUX: URL_ANCIEN_FLUX }, flux: { [URL_ANCIEN_FLUX]: reponseFlux([pub('CERTFR-2099-AVI-0003', 1)]) } });
  surcharge.relever();
  assert.deepEqual(surcharge.gets().map((requete) => requete.url), [URL_ANCIEN_FLUX]);
  const invalide = bancReel({ proprietes: { URL_FLUX: 'http://cert.cyber.gouv.fr/feed/' }, items: [pub('CERTFR-2099-AVI-0004', 1)] });
  invalide.relever();
  assert.deepEqual(invalide.gets().map((requete) => requete.url), [URL_FLUX]);
  assert.match(invalide.journal(), /URL_FLUX invalide \(https attendu\)/);
  // FR : URL_FLUX hors liste blanche : exception d'Apps Script traduite en échec du flux / EN: outside allow-list
  const horsListe = bancReel({ proprietes: { URL_FLUX: 'https://exemple.test/feed/' } });
  assert.equal(horsListe.relever().resultat, 'echec_flux');
  assert.match(horsListe.journal(), /erreur réseau/);
}
test('Redirections et URL du flux (RM-1) — 301 vers l\'ancien domaine suivie à la main (followRedirects false), liens relatifs résolus, 308 relative, boucle → échec propre, URL_FLUX surchargée ou invalide, hors liste blanche', test_redirections_et_url);

function test_journal_synthese() {
  const banc = bancReel({ items: [pub('CERTFR-2099-AVI-0002', 1), pub('CERTFR-2099-AVI-0001', 2)] });
  banc.relever({ triggerUid: 'declencheur-fictif-1' });
  const ligne = banc.lignes(/ \| resultat=/)[0].texte;
  assert.match(ligne, /^\[Veille CERT-FR\] Exécution terminée \/ Run finished \| resultat=ok \| /);
  assert.deepEqual(Object.keys(banc.synthese()), ['resultat', 'mode', 'dryRun', 'duree', 'lus', 'ignores', 'nouveaux', 'ecartes_categorie', 'ecartes_anciennete', 'publies', 'echecs', 'refuses', 'reportes', 'alertes']);
  assert.deepEqual(banc.synthese(), {
    resultat: 'ok', mode: 'declencheur', dryRun: 'false', duree: '1s', lus: '2', ignores: '0', nouveaux: '2', ecartes_categorie: '0', ecartes_anciennete: '0',
    publies: '2', echecs: '0', refuses: '0', reportes: '0', alertes: 'aucune',
  });
  assert.match(banc.journal(), /Publié : cle=CERTFR-2099-AVI-0001 categorie=AVI/);
  const derniere = banc.json('DERNIERE_EXECUTION');
  assert.equal(derniere.resultat, 'ok');
  assert.equal(derniere.publies, 2);
  assert.equal(derniere.date, new Date(MS_MAINTENANT).toISOString());
  for (const champ of ['date', 'derniereLectureReussie', 'dernierNouvelElement']) assert.ok(!Number.isNaN(Date.parse(derniere[champ])), `${champ} ISO`);
  banc.vider().avancer(HEURE).relever();
  assert.equal(banc.synthese().mode, 'manuel');
  assert.equal(banc.synthese().resultat, 'ok');
}
test('Journal (RM-21) — ligne de synthèse bilingue avec les jetons du design §7 dans l\'ordre, mode déclencheur / manuel ; DERNIERE_EXECUTION (date, résultat, lectures, nouvel élément, publiés)', test_journal_synthese);

function test_cas_vides() {
  // FR : aucune propriété : simulation, amorçage décrit, pas d'exception / EN: no property: dry run, bootstrap described
  const vide = creerBanc({ items: [pub('CERTFR-2099-AVI-0001', 1)] });
  assert.equal(vide.relever().resultat, 'simulation');
  // FR : propriétés JSON corrompues / EN: corrupted JSON properties
  const corrompu = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], proprietes: { DERNIERE_EXECUTION: '{corrompu', ALERTES_ENVOYEES: 'null' } });
  assert.equal(corrompu.relever().resultat, 'ok');
  // FR : mémoire illisible : traitée comme absente (amorçage, aucune publication en masse) / EN: unreadable memory: bootstrap
  const illisible = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1), pub('CERTFR-2099-AVI-0002', 2)], proprietes: { ELEMENTS_VUS: 'pas du json' } });
  illisible.relever();
  assert.deepEqual(illisible.postes(), ['amorcage']);
  // FR : réponse sans en-têtes et corps vide / EN: answer without headers and empty body
  const sansEntetes = bancReel({ flux: { [URL_FLUX]: { code: 200, texte: '', sansEntetes: true } } });
  assert.equal(sansEntetes.relever().resultat, 'echec_flux');
  // FR : élément sans date ni description ni guid / EN: item without date, description or guid
  const minimal = bancReel({ items: [{ titre: 'Minimal CERTFR-2099-AVI-0007', lien: 'https://cert.cyber.gouv.fr/avis/CERTFR-2099-AVI-0007/', guid: '', dateTexte: null }] });
  minimal.relever();
  assert.deepEqual(minimal.postes(), ['CERTFR-2099-AVI-0007']);
  const widgets = minimal.etat.posts[0].charge.cardsV2[0].card.sections[0].widgets;
  assert.equal(widgets.length, 4, 'résumé omis');
  // FR : flux sans aucun nouvel élément : ok, rien posté / EN: feed without new item: ok, nothing posted
  const rien = bancReel({ items: [pub('CERTFR-2099-AVI-0900', 2)] });
  const bilan = rien.relever();
  assert.deepEqual([bilan.resultat, bilan.publies, rien.etat.posts.length], ['ok', 0, 0]);
  // FR : diagnostic avec un flux illisible : ligne ERREUR et début de réponse / EN: diagnostic with unreadable feed
  const diag = creerBanc({ flux: { [URL_FLUX]: { code: 200, texte: '<html>Captcha</html>' } } });
  const texte = diag.contexte.diagnostiquer();
  assert.match(texte, /ERREUR \/ ERROR\s+Flux : Le flux CERT-FR n'est pas un flux RSS lisible/);
  assert.match(texte, /Début de la réponse : <html>Captcha<\/html>/);
}
test('Cas vides — aucune propriété, JSON corrompus, mémoire illisible (amorçage), réponse sans en-têtes ni corps, élément minimal, aucun nouvel élément, diagnostic d\'un flux illisible : messages clairs, aucune exception brute', test_cas_vides);

function test_scopes() {
  // FR : le compte propriétaire n'est pas lisible sans userinfo.email (scope non déclaré) : sans ADRESSE_ALERTE, pas d'e-mail
  // EN: the owner account is unreadable without userinfo.email: without ADRESSE_ALERTE, no e-mail
  const items = [pub('CERTFR-2099-AVI-0001', 1)];
  const sansAdresse = bancReel({ items, proprietes: { ADRESSE_ALERTE: undefined }, webhook: () => ({ code: 401 }) });
  sansAdresse.relever();
  assert.equal(sansAdresse.etat.mails.length, 0);
  assert.match(sansAdresse.journal(), /Aucun destinataire pour l'e-mail d'alerte webhookRefuse : renseigner la propriété ADRESSE_ALERTE/);
  assert.equal(sansAdresse.etat.proprietes.ALERTES_ENVOYEES, undefined, 'alerte non marquée envoyée : retentée');
  const diag = creerBanc({ items }).contexte.diagnostiquer();
  assert.match(diag, /ERREUR \/ ERROR\s+ADRESSE_ALERTE : non renseignée et adresse du compte exécutant illisible — aucune alerte ne peut partir : renseigner la propriété ADRESSE_ALERTE/);
  // FR : si le scope userinfo.email était accordé, repli sur le propriétaire / EN: with userinfo.email, owner fallback
  const avecScope = bancReel({ items, scopes: [...MANIFESTE.oauthScopes, SCOPE('userinfo.email')], proprietes: { ADRESSE_ALERTE: undefined }, webhook: () => ({ code: 401 }) });
  avecScope.relever();
  assert.deepEqual(avecScope.etat.mails.map((mail) => mail.to), [PROPRIETAIRE]);
  // FR : ADRESSE_ALERTE mal formée : avertissement / EN: malformed ADRESSE_ALERTE: warning
  const malFormee = bancReel({ items, proprietes: { ADRESSE_ALERTE: 'pas-une-adresse' } });
  malFormee.relever();
  assert.match(malFormee.journal(), /ADRESSE_ALERTE invalide/);
  // FR : sans script.send_mail : échec d'envoi journalisé, état inchangé, retenté / EN: without send_mail: logged, retried
  const sansMail = bancReel({ items, scopes: MANIFESTE.oauthScopes.filter((scope) => scope !== SCOPE('script.send_mail')), webhook: () => ({ code: 401 }) });
  sansMail.relever();
  assert.match(sansMail.journal(), /Échec d'envoi de l'e-mail d'alerte webhookRefuse : Exception · Les autorisations spécifiées ne sont pas suffisantes pour appeler MailApp\.sendEmail/);
  assert.equal(sansMail.etat.proprietes.ALERTES_ENVOYEES, undefined);
  sansMail.etat.scopes.push(SCOPE('script.send_mail'));
  sansMail.vider().avancer(HEURE).relever();
  assert.equal(sansMail.etat.mails.length, 1, 'alerte retentée à l\'exécution suivante');
  // FR : sans script.external_request : échec du flux sans exception brute / EN: without external_request: feed failure
  const sansReseau = bancReel({ items, scopes: MANIFESTE.oauthScopes.filter((scope) => scope !== SCOPE('script.external_request')) });
  assert.equal(sansReseau.relever().resultat, 'echec_flux');
  assert.match(sansReseau.journal(), /UrlFetchApp\.fetch/);
  // FR : sans script.scriptapp : installerDeclencheur lève l'erreur ; diagnostiquer termine / EN: without scriptapp
  const sansDeclencheur = creerBanc({ items, scopes: MANIFESTE.oauthScopes.filter((scope) => scope !== SCOPE('script.scriptapp')) });
  assert.throws(() => sansDeclencheur.contexte.installerDeclencheur(), /ScriptApp\.getProjectTriggers/);
  assert.match(sansDeclencheur.contexte.diagnostiquer(), /=== Fin du diagnostic/);
  // FR : la section d'exploitation interrompue est signalée (ATTENTION) sans arrêter le diagnostic
  // EN: the interrupted operations section is reported (WARNING) without stopping the diagnostic
  assert.match(sansDeclencheur.contexte.diagnostiquer(), /ATTENTION \/ WARNING\s+Section du diagnostic interrompue : Exception · Les autorisations spécifiées ne sont pas suffisantes pour appeler ScriptApp\.getProjectTriggers/);
  // FR : scope manquant signalé au diagnostic (fonction de section seule) / EN: missing scope reported (section function alone)
  const manquant = creerBanc({ scopes: MANIFESTE.oauthScopes.filter((scope) => scope !== SCOPE('script.send_mail')) });
  assert.match(manquant.evaluer('diagnostiquerScopes_()').join('\n'), /ERREUR \/ ERROR\s+Scopes manquants : script\.send_mail/);
}
test('Scopes (point 12) — appels simulés soumis aux scopes du manifeste : Session sans userinfo.email → pas de destinataire (ADRESSE_ALERTE requise), MailApp / UrlFetchApp / ScriptApp sans scope : erreur réelle traduite, sans exception brute en relève', test_scopes);

function test_correction_racine_bilingue() {
  // FR : diagnostic : la ligne ERREUR cite la racine une seule fois par langue, chaque moitié dans sa langue
  // EN: diagnostic: the ERROR line quotes the root once per language, each half in its own language
  const diag = creerBanc({ flux: { [URL_FLUX]: { code: 200, texte: '<html><body>Captcha</body></html>' } } });
  const ligne = diag.contexte.diagnostiquer().split('\n').find((candidate) => /^ERREUR \/ ERROR\s+Flux/.test(candidate));
  assert.ok(ligne, 'ligne ERREUR du flux');
  assert.equal(compter(ligne, /racine <html> au lieu de <rss><channel>/), 1);
  assert.equal(compter(ligne, /root <html> instead of <rss><channel>/), 1);
  const [francais, anglais] = ligne.split(' / Feed');
  assert.ok(anglais, `moitié anglaise introuvable : ${ligne}`);
  assert.match(francais, /racine <html> au lieu de <rss><channel>/);
  assert.doesNotMatch(anglais, /racine|au lieu de|Le flux/);
  assert.match(anglais, /root <html> instead of <rss><channel>/);
  // FR : journal de la relève : idem / EN: run log: same
  const releve = bancReel({ flux: { [URL_FLUX]: { code: 200, texte: '<html><body>Captcha</body></html>' } } });
  releve.relever();
  const erreur = releve.lignes(/racine <html>/)[0].texte;
  assert.equal(compter(erreur, /racine <html>/), 1);
  assert.equal(compter(erreur, /root <html>/), 1);
  // FR : e-mail « flux en échec » en LANGUE=en : détail en anglais seulement / EN: LANGUE=en e-mail: English detail only
  const anglaisMail = bancReel({
    flux: { [URL_FLUX]: { code: 200, texte: '<html><body>Captcha</body></html>' } },
    proprietes: { LANGUE: 'en', DERNIERE_EXECUTION: JSON.stringify({ derniereLectureReussie: new Date(MS_MAINTENANT - 7 * HEURE).toISOString() }) },
  });
  anglaisMail.relever();
  assert.deepEqual(anglaisMail.sujets(), ['[CERT-FR watch] ALERT — CERT-FR feed unreadable for 7 h']);
  const mail = anglaisMail.etat.mails[0];
  assert.match(mail.body, /root <html> instead of <rss><channel>/);
  assert.doesNotMatch(`${mail.body}\n${mail.htmlBody}`, /racine|au lieu de/);
}
test('Correction — racine <html> : une seule fois « racine … au lieu de … » côté FR et « root … instead of … » côté EN (diagnostic, journal), e-mail LANGUE=en sans français', test_correction_racine_bilingue);

function test_correction_sections_diagnostic() {
  const derniere = JSON.stringify({ date: new Date(MS_MAINTENANT - HEURE).toISOString(), resultat: 'ok', derniereLectureReussie: new Date(MS_MAINTENANT - HEURE).toISOString() });
  const banc = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], proprietes: { DERNIERE_EXECUTION: derniere } });
  banc.contexte.ScriptApp.getProjectTriggers = () => { throw exceptionAppsScript('Service ScriptApp indisponible (simulé)'); };
  const texte = banc.contexte.diagnostiquer();
  assert.match(texte, /ATTENTION \/ WARNING\s+Section du diagnostic interrompue : Exception · Service ScriptApp indisponible/);
  assert.match(texte, /INFO\s+Mémoire : 2 clés/);
  assert.match(texte, /INFO\s+Dernière exécution : 22\/10\/2026 09:00 · ok/);
  assert.match(texte, /OK\s+Alertes en cours : aucune/);
  assert.match(texte, /OK\s+Scopes : script\.external_request, script\.scriptapp, script\.send_mail/);
  assert.match(texte, /=== Fin du diagnostic/);
  // FR : sans le scope script.scriptapp : les autres lignes restent, le scope manquant est signalé / EN: missing scope reported
  const sansScope = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1)], scopes: MANIFESTE.oauthScopes.filter((scope) => scope !== SCOPE('script.scriptapp')) });
  const texteSansScope = sansScope.contexte.diagnostiquer();
  assert.match(texteSansScope, /ATTENTION \/ WARNING\s+Section du diagnostic interrompue/);
  assert.match(texteSansScope, /INFO\s+Mémoire : 2 clés/);
  assert.match(texteSansScope, /ERREUR \/ ERROR\s+Scopes manquants : script\.scriptapp/);
  assert.equal(sansScope.etat.posts.length, 0);
}
test('Correction — diagnostic : getProjectTriggers qui lève → une ligne ATTENTION « Section du diagnostic interrompue », lignes Mémoire, Dernière exécution, Alertes et Scopes toujours présentes ; scope manquant signalé', test_correction_sections_diagnostic);

function test_correction_adresse_alerte() {
  const lignesAdresse = (banc) => banc.contexte.diagnostiquer().split('\n').filter((ligne) => /ADRESSE_ALERTE/.test(ligne));
  const avecCompte = [...MANIFESTE.oauthScopes, SCOPE('userinfo.email')];
  // FR : renseignée → OK, adresse masquée / EN: set → OK, masked address
  const renseignee = lignesAdresse(creerBanc({ proprietes: { ADRESSE_ALERTE: RESPONSABLE } }));
  assert.deepEqual(renseignee.map((ligne) => ligne.split(/\s{2,}/)[0]), ['OK']);
  assert.match(renseignee[0], /ADRESSE_ALERTE : présente \(p\*\*\*@exemple\.test\)/);
  assert.ok(!renseignee[0].includes(RESPONSABLE));
  // FR : invalide → ATTENTION / EN: invalid → WARNING
  const invalide = lignesAdresse(creerBanc({ proprietes: { ADRESSE_ALERTE: 'pas-une-adresse' } }));
  assert.match(invalide[0], /^ATTENTION \/ WARNING\s+ADRESSE_ALERTE : adresse invalide, ignorée/);
  assert.ok(!invalide.join('\n').includes('pas-une-adresse'), 'valeur saisie non recopiée');
  // FR : absente + compte lisible → ATTENTION (repli sans garantie) / EN: missing + readable account → WARNING
  const repli = lignesAdresse(creerBanc({ scopes: avecCompte }));
  assert.equal(repli.length, 1);
  assert.match(repli[0], /^ATTENTION \/ WARNING\s+ADRESSE_ALERTE : non renseignée — renseigner la propriété ADRESSE_ALERTE .*\(a\*\*\*@exemple\.test\)/);
  assert.ok(!repli[0].includes(PROPRIETAIRE));
  // FR : absente + compte illisible → ERREUR / EN: missing + unreadable account → ERROR
  const aucune = lignesAdresse(creerBanc());
  assert.equal(aucune.length, 1);
  assert.match(aucune[0], /^ERREUR \/ ERROR\s+ADRESSE_ALERTE : non renseignée et adresse du compte exécutant illisible — aucune alerte ne peut partir/);
}
test('Correction — ADRESSE_ALERTE au diagnostic : renseignée → OK (p***@domaine) ; invalide → ATTENTION ; absente + compte lisible → ATTENTION ; absente + compte illisible → ERREUR', test_correction_adresse_alerte);

function test_non_applicables() {
  // FR : points 4, 5, 8, 9, 11 du banc type : sans objet (aucun classeur, flux RSS non paginé, aucune anonymisation)
  // EN: generic bench points 4, 5, 8, 9, 11: not applicable (no spreadsheet, non-paginated RSS feed, no anonymisation)
  const code = sources().map(({ code: texte }) => masquerTextes(texte)).join('\n');
  assert.doesNotMatch(code, /\bSpreadsheetApp\b|\bnextPageToken\b|requireFormulaSatisfied|whenFormulaSatisfied/);
  // FR : injection : la valeur externe « =HYPERLINK(…) » ou « +1 » n'est jamais interprétée (texte échappé dans la carte)
  // EN: injection: an external "=HYPERLINK(…)" or "+1" value is never interpreted (escaped text in the card)
  const banc = bancReel({ items: [pub('CERTFR-2099-AVI-0001', 1, { titre: '+1 =HYPERLINK("https://exemple.test";"x")' })] });
  banc.relever();
  assert.equal(banc.etat.posts[0].charge.cardsV2[0].card.sections[0].widgets[0].textParagraph.text, '<b>+1 =HYPERLINK("https://exemple.test";"x")</b>');
}
test('Sans objet — ni classeur (injection de formule, validations régionales), ni pagination, ni anonymisation ; valeurs « =… » / « +1 » restent du texte dans Chat', test_non_applicables);

/* ======================= EXÉCUTION ======================= */

const SEUL = process.argv.find((argument) => argument.startsWith('--seul='))?.slice('--seul='.length) ?? '';
const selection = tests.filter(({ nom }) => nom.includes(SEUL));
console.log(`Banc gws-chat-veille-cert-fr — ${selection.length} test(s)${SEUL ? ` (filtre « ${SEUL} »)` : ''}`);
let echecs = 0;
const debutBanc = Date.now();
for (const { nom, fonction } of selection) {
  BANCS_DU_TEST.length = 0;
  try {
    fonction();
    for (const banc of BANCS_DU_TEST) assert.deepEqual(banc.etat.violations, [], 'violation des contrats de la simulation / simulation contract violation');
    console.log(`  ✔ ${nom}`);
  } catch (erreur) {
    echecs++;
    const pile = String(erreur?.stack ?? erreur).split('\n');
    console.log(`  ✖ ${nom}\n      ${pile.slice(0, VERBEUX ? 14 : 5).join('\n      ')}`);
    if (VERBEUX) {
      const dernier = BANCS_DU_TEST[BANCS_DU_TEST.length - 1];
      if (dernier) console.log(`      journal du dernier banc :\n        ${dernier.journal().split('\n').slice(-25).join('\n        ')}`);
    }
  }
}
console.log(`\n${selection.length - echecs} réussi(s), ${echecs} en échec / ${selection.length - echecs} passed, ${echecs} failed (${Math.round((Date.now() - debutBanc) / 100) / 10} s)`);
process.exit(echecs ? 1 : 0);
