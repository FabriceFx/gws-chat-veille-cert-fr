/**
 * GWS – Chat – Veille CERT-FR dans un espace Google Chat
 * GWS – Chat – CERT-FR watch in a Google Chat space
 *
 * FR : Script autonome (sans classeur), exécuté toutes les heures par le compte technique. Il lit le flux RSS public
 *      du CERT-FR, déduit la catégorie de chaque publication, écarte celles déjà vues (mémoire en propriétés du
 *      script) et publie chaque nouvelle publication, une seule fois, sous forme de carte dans un espace Google Chat
 *      par webhook entrant. Les alertes de fonctionnement partent par e-mail, jamais dans l'espace.
 *      Aucune valeur réelle ici : l'URL du webhook (secret) et l'adresse d'alerte sont des propriétés du script.
 * EN: Standalone script (no spreadsheet), run hourly by the technical account. It reads the public CERT-FR RSS feed,
 *     derives each publication's category, skips those already seen (memory in script properties) and posts each new
 *     publication, once, as a card in a Google Chat space through an incoming webhook. Operational alerts go by
 *     e-mail, never to the space. No real value here: the webhook URL (secret) and the alert address are script
 *     properties.
 */
const CONFIG = Object.freeze({
  /**
   * FR : true = simulation (RM-18) : flux réellement lu, calcul complet, mais aucun POST vers Chat, mémoire et état des
   *      alertes inchangés, aucun e-mail ; le journal décrit ce qui serait fait. Valeur par défaut seulement : la
   *      propriété du script DRY_RUN valant « false » active le mode réel sans modifier le code.
   * EN: true = dry run (RM-18): feed really read, full computation, but no POST to Chat, memory and alert state
   *     unchanged, no e-mail; the log describes what would be done. Default value only: the DRY_RUN script property
   *     set to "false" enables live mode without changing the code.
   */
  DRY_RUN: true,

  NOM_PROJET: 'gws-chat-veille-cert-fr', // FR : nom technique (pied d'e-mail) / EN: technical name (e-mail footer)
  PREFIXE_JOURNAL: '[Veille CERT-FR]', // FR : préfixe de la ligne de synthèse (design §7) / EN: summary line prefix
  LANGUE_DEFAUT: 'fr', // FR : langue par défaut et de repli (RM-26) / EN: default and fallback language (RM-26)
  LANGUES: Object.freeze(['fr', 'en']), // FR : langues prises en charge / EN: supported languages
  FUSEAU: 'Europe/Paris', // FR : fuseau des dates affichées (RM-4) / EN: time zone of displayed dates (RM-4)
  FORMAT_DATE_HEURE: 'dd/MM/yyyy HH:mm', // FR : format des dates affichées (design §12) / EN: displayed date format

  // FR : Flux CERT-FR (RM-1). / EN: CERT-FR feed (RM-1).
  URL_FLUX: 'https://cert.cyber.gouv.fr/feed/', // FR : surchargeable par la propriété URL_FLUX / EN: overridable by the URL_FLUX property
  URL_SITE: 'https://cert.cyber.gouv.fr/', // FR : bouton du message de test (design §5) / EN: test message button
  REDIRECTIONS_MAX: 5, // FR : redirections suivies au plus (RM-1) / EN: redirects followed at most
  // FR : domaines CERT-FR reconnus (nouveau et ancien, avec et sans www., RM-7, RM-13) / EN: recognised CERT-FR domains
  DOMAINES_CERT: Object.freeze(['cert.cyber.gouv.fr', 'www.cert.cyber.gouv.fr', 'cert.ssi.gouv.fr', 'www.cert.ssi.gouv.fr']),
  DOMAINE_CANONIQUE: 'cert.cyber.gouv.fr', // FR : domaine unique des clés tirées d'un lien (RM-7) / EN: single domain of link-based keys

  // FR : Webhook entrant Google Chat (RM-16, RM-22). / EN: Google Chat incoming webhook (RM-16, RM-22).
  PREFIXE_WEBHOOK: 'https://chat.googleapis.com/v1/spaces/', // FR : forme attendue de WEBHOOK_URL / EN: expected WEBHOOK_URL form

  /**
   * FR : Réglages surchargeables par la propriété du script de même nom (RM-26) ; une valeur non entière ou inférieure
   *      à 1 est ignorée (valeur ci-dessous utilisée, avertissement au journal et au diagnostic).
   * EN: Settings overridable by the script property of the same name (RM-26); a non-integer value or one below 1 is
   *     ignored (value below used, warning in the log and the diagnostic).
   */
  REGLAGES: Object.freeze({
    AGE_MAX_JOURS: 7, // FR : ancienneté maximale d'une publication relayée (RM-6) / EN: maximum age of a relayed item
    MAX_PUBLICATIONS_PAR_EXECUTION: 20, // FR : plafond de messages par exécution (RM-12) / EN: messages per run cap
    MEMOIRE_MAX: 300, // FR : clés conservées dans ELEMENTS_VUS (RM-8) / EN: keys kept in ELEMENTS_VUS
    SEUIL_ECHEC_HEURES: 6, // FR : heures sans lecture réussie avant alerte (RM-17) / EN: hours without successful read before alert
    SEUIL_SILENCE_JOURS: 5, // FR : jours sans nouvel élément avant alerte « flux muet » / EN: days without new item before "silent feed" alert
  }),
  MEMOIRE_MAX_PLAFOND: 350, // FR : plafond de MEMOIRE_MAX pour tenir dans 9 Ko (RM-26) / EN: MEMOIRE_MAX cap to fit in 9 KB
  MEMOIRE_OCTETS_MAX: 8800, // FR : taille maximale du JSON d'ELEMENTS_VUS (limite 9 Ko par propriété) / EN: maximum ELEMENTS_VUS JSON size

  // FR : Contenu des messages (RM-4, RM-13, design §3). / EN: Message content (RM-4, RM-13, design §3).
  RESUME_MAX: 300, // FR : caractères du résumé, « … » compris / EN: summary characters, "…" included
  TITRE_REPLI_MAX: 200, // FR : caractères du titre dans le texte de repli / EN: title characters in the fallback text
  TITRE_JOURNAL_MAX: 80, // FR : caractères du titre dans le journal de simulation / EN: title characters in the dry-run log
  TEXTE_MAX: 4000, // FR : longueur maximale du texte de repli / EN: maximum fallback text length
  CARTE_OCTETS_MAX: 30000, // FR : taille maximale du JSON posté (limite Chat ~32 Ko) / EN: maximum posted JSON size (Chat ~32 KB)
  PAUSE_ENTRE_MESSAGES_MS: 1100, // FR : pause entre deux POST (RM-12, quota ~1 msg/s) / EN: pause between two POSTs

  /**
   * FR : Repères visuels par catégorie (design §2) : émoji de forme distincte, couleur de renfort, clé I18n du libellé.
   *      Ordre = ordre de la légende du message d'amorçage. AUTRE = code inconnu.
   * EN: Visual markers per category (design §2): distinct-shape emoji, reinforcing colour, label I18n key. Order = order
   *     of the bootstrap message legend. AUTRE = unknown code.
   */
  AFFICHAGE_CATEGORIES: Object.freeze({
    ALE: Object.freeze({ emoji: '🚨', couleur: '#C5221F', cleLibelle: 'categorieAle' }),
    AVI: Object.freeze({ emoji: '🛡️', couleur: '#B06000', cleLibelle: 'categorieAvi' }),
    ACT: Object.freeze({ emoji: '📰', couleur: '#1558B0', cleLibelle: 'categorieAct' }),
    CTI: Object.freeze({ emoji: '🕵️', couleur: '#7B1FA2', cleLibelle: 'categorieCti' }),
    IOC: Object.freeze({ emoji: '🔎', couleur: '#00695C', cleLibelle: 'categorieIoc' }),
    DUR: Object.freeze({ emoji: '🔒', couleur: '#455A64', cleLibelle: 'categorieDur' }),
    INF: Object.freeze({ emoji: 'ℹ️', couleur: '#5F6368', cleLibelle: 'categorieInf' }),
    AUTRE: Object.freeze({ emoji: '❔', couleur: '#6D4C41', cleLibelle: 'categorieAutre' }),
  }),
  CODE_AUTRE: 'AUTRE', // FR : code interne de la catégorie « Autre » / EN: internal code of the "Other" category

  /**
   * FR : Premier segment du chemin d'un lien → catégorie (RM-3 b) ; formes au singulier et au pluriel.
   * EN: First path segment of a link → category (RM-3 b); singular and plural forms.
   */
  CHEMINS_CATEGORIES: Object.freeze({
    alerte: 'ALE', alertes: 'ALE',
    avis: 'AVI',
    actualite: 'ACT', actualites: 'ACT',
    cti: 'CTI',
    ioc: 'IOC',
    dur: 'DUR', durcissement: 'DUR',
    information: 'INF', informations: 'INF',
  }),

  /**
   * FR : Balise category (normalisée : minuscules sans accents) → catégorie (RM-3 c).
   * EN: category tag (normalised: lower case, no accents) → category (RM-3 c).
   */
  ETIQUETTES_CATEGORIES: Object.freeze({
    alerte: 'ALE', alertes: 'ALE', 'alerte de securite': 'ALE', alert: 'ALE',
    avis: 'AVI', 'avis de securite': 'AVI', advisory: 'AVI',
    actualite: 'ACT', actualites: 'ACT', "bulletin d'actualite": 'ACT', 'bulletin d actualite': 'ACT',
    cti: 'CTI', 'rapport de menace': 'CTI', 'menaces et incidents': 'CTI',
    ioc: 'IOC', 'indicateurs de compromission': 'IOC',
    dur: 'DUR', durcissement: 'DUR', 'guide de durcissement': 'DUR',
    information: 'INF', informations: 'INF',
  }),

  // FR : Couleurs et émojis des messages spéciaux et des e-mails (design §4 à §6). / EN: Special messages and e-mails.
  AMORCAGE: Object.freeze({ emoji: '✅', couleur: '#1E8E3E' }),
  TEST: Object.freeze({ emoji: '🧪', couleur: '#5F6368' }),
  COULEURS_MAIL: Object.freeze({ alerte: '#B3261E', attention: '#8A5A00', retabli: '#1B6E3A' }),

  // FR : Nouvel essai HTTP (RM-15). / EN: HTTP retry (RM-15).
  NOUVEL_ESSAI: Object.freeze({
    ESSAIS: 3, // FR : essais au total / EN: total attempts
    ATTENTE_INITIALE_MS: 1000, // FR : 1 s, puis 2 s, 4 s / EN: 1 s, then 2 s, 4 s
    RETRY_AFTER_MAX_MS: 30000, // FR : plafond de l'en-tête Retry-After / EN: Retry-After header cap
  }),
  // FR : User-Agent annoncé (Apps Script ajoute le sien) / EN: announced User-Agent (Apps Script appends its own)
  USER_AGENT: 'GWS-Veille-CERT-FR/1.0 (+gws-chat-veille-cert-fr)',

  // FR : Exécution (RM-20). / EN: Run (RM-20).
  ATTENTE_VERROU_MS: 30000, // FR : attente du verrou du script / EN: script lock wait
  DUREE_MAX_MS: 5 * 60 * 1000, // FR : garde de temps : arrêt propre avant 5 min / EN: time guard: clean stop before 5 min
  /**
   * FR : Durée maximale admise pour un appel UrlFetchApp (non réglable dans Apps Script ; un POST Chat dure en général
   *      moins de 2 s). Sert au calcul du pire cas d'un POST par margePublicationMs_() : pause entre messages
   *      (1,1 s) + (ESSAIS − 1) attentes plafonnées par RETRY_AFTER_MAX_MS (2 × 30 s) + ESSAIS appels de
   *      DUREE_APPEL_MAX_MS (3 × 30 s) ≈ 151 s. Un POST ne commence que si ce pire cas tient avant DUREE_MAX_MS (5 min),
   *      ce qui laisse encore 1 min avant la limite dure de 6 min pour les alertes et l'état.
   * EN: Maximum duration allowed for one UrlFetchApp call (not configurable in Apps Script; a Chat POST usually takes
   *     under 2 s). Used for the worst case of one POST by margePublicationMs_(): pause between messages (1.1 s) +
   *     (ESSAIS − 1) waits capped by RETRY_AFTER_MAX_MS (2 × 30 s) + ESSAIS calls of DUREE_APPEL_MAX_MS (3 × 30 s)
   *     ≈ 151 s. A POST only starts when this worst case fits before DUREE_MAX_MS (5 min), still leaving 1 min before
   *     the hard 6-min limit for alerts and state.
   */
  DUREE_APPEL_MAX_MS: 30000,
  DELAI_REPETITION_ALERTE_MS: 24 * 3600 * 1000, // FR : une même alerte au plus toutes les 24 h (RM-17) / EN: same alert at most every 24 h
  FONCTION_DECLENCHEUR: 'relever', // FR : fonction du déclencheur horaire (RM-23) / EN: hourly trigger function
  INTERVALLE_HEURES: 1, // FR : relève toutes les heures (D-3) / EN: hourly polling (D-3)

  // FR : Noms des propriétés du script (design §10). / EN: Script property names (design §10).
  CLES_PROPRIETES: Object.freeze({
    WEBHOOK_URL: 'WEBHOOK_URL', // FR : secret, jamais journalisé en clair / EN: secret, never logged in clear
    DRY_RUN: 'DRY_RUN',
    URL_FLUX: 'URL_FLUX',
    CATEGORIES: 'CATEGORIES',
    ADRESSE_ALERTE: 'ADRESSE_ALERTE',
    LANGUE: 'LANGUE',
    CONFIRMER_REINITIALISATION: 'CONFIRMER_REINITIALISATION',
    ELEMENTS_VUS: 'ELEMENTS_VUS', // FR : écrite par le script / EN: written by the script
    DERNIERE_EXECUTION: 'DERNIERE_EXECUTION', // FR : écrite par le script / EN: written by the script
    ALERTES_ENVOYEES: 'ALERTES_ENVOYEES', // FR : écrite par le script / EN: written by the script
  }),

  // FR : Scopes attendus, comparés aux scopes accordés par diagnostiquer() / EN: expected scopes, checked by diagnostiquer()
  SCOPES_ATTENDUS: Object.freeze(['script.external_request', 'script.scriptapp', 'script.send_mail']),
});
