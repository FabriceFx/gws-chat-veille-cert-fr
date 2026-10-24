/**
 * FR : Textes FR / EN (annexe de design.md, compléments signalés). Chaque clé existe dans les deux langues
 *      (verifierTraductions_() et banc de test). Paramètres : {0}, {1}… Les valeurs issues du flux sont échappées par
 *      l'appelant avant insertion. Journal et diagnostic : tBilingue_ ; messages Chat et e-mails : langue LANGUE.
 * EN: FR / EN texts (design.md annex, additions flagged). Every key exists in both languages. Placeholders: {0}, {1}…
 *     Feed values are escaped by the caller before insertion. Log and diagnostic: tBilingue_; Chat messages and
 *     e-mails: LANGUE language.
 */
const TEXTES = Object.freeze({
  fr: {
    // FR : A. Catégories. / EN: A. Categories.
    categorieAle: 'Alerte',
    categorieAvi: 'Avis de sécurité',
    categorieAct: "Bulletin d'actualité",
    categorieCti: 'Rapport de menace',
    categorieIoc: 'Indicateurs de compromission',
    categorieDur: 'Guide de durcissement',
    categorieInf: 'Information',
    categorieAutre: 'Autre',

    // FR : B. Carte de publication. / EN: B. Publication card.
    carteTitreEntete: '{0} {1}',
    carteSousTitre: 'CERT-FR · {0}',
    carteBandeauAlerte: '{0} ALERTE — vulnérabilité exploitée ou critique : à examiner en priorité',
    carteEtiquetteCategorie: 'Catégorie',
    carteEtiquetteDate: 'Publié le',
    carteBouton: 'Consulter sur le CERT-FR',
    carteLienHorsDomaine: 'Lien non vérifié (hors domaine CERT-FR) : {0}',
    texteRepli: '{0} {1} — {2} — {3}',
    referenceAbsente: 'sans référence', // FR : complément / EN: addition

    // FR : C. Amorçage. / EN: C. Bootstrap.
    amorcageTitre: '✅ Veille CERT-FR active',
    amorcageSousTitre: 'Flux CERT-FR · relève toutes les heures',
    amorcageCorpsUne: 'Les nouvelles publications du CERT-FR seront relayées ici, une par fil de discussion. 1 publication antérieure non reprise.',
    amorcageCorpsPlusieurs: 'Les nouvelles publications du CERT-FR seront relayées ici, une par fil de discussion. {0} publications antérieures non reprises.',
    amorcageEtiquetteCategories: 'Catégories relayées',
    amorcageToutes: 'toutes',
    amorcageLegende: 'Repères visuels par catégorie',
    amorcageRepli: '✅ Veille CERT-FR active — {0} publication(s) antérieure(s) non reprise(s).',
    referenceAmorcage: "message d'amorçage", // FR : complément / EN: addition

    // FR : D. Message de test. / EN: D. Test message.
    testTitre: '🧪 TEST — Veille CERT-FR',
    testSousTitre: 'Message de test, aucune publication réelle',
    testCorps: "Ce message valide le webhook de l'espace. Il ne correspond à aucune publication du CERT-FR et n'a aucun effet sur la mémoire du script.",
    testEtiquetteMode: 'Mode du script',
    testModeSimulation: 'Simulation (DRY_RUN activé) : seul ce message de test est posté',
    testModeReel: 'Mode réel (DRY_RUN désactivé)',
    testEtiquetteDate: 'Envoyé le',
    testBouton: 'Ouvrir le site du CERT-FR',
    testRepli: '🧪 TEST — Veille CERT-FR — message de test du {0}, à ignorer',

    // FR : E. E-mails. / EN: E. E-mails.
    mailExpediteur: 'Veille CERT-FR',
    mailSurtitre: 'Veille CERT-FR · Alerte de fonctionnement',
    mailMotAlerte: 'ALERTE',
    mailMotAttention: 'ATTENTION',
    mailMotRetabli: 'RÉTABLI',
    mailObjetFluxEchec: '[Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis {0} h',
    mailObjetWebhookRefuse: "[Veille CERT-FR] ALERTE — l'espace Chat refuse les publications",
    mailObjetPublicationRefusee: '[Veille CERT-FR] ATTENTION — une publication a été refusée par Chat ({0})',
    mailTitrePublicationRefusee: 'Une publication a été refusée par Chat',
    mailCorpsPublicationRefusee: "Chat a refusé la publication {0} (HTTP 400, message invalide). L'élément est écarté et ne sera pas retenté ; les autres publications continuent.",
    mailActionsPublicationRefusee: "Relever le détail au journal d'exécution (clé et taille du message).\nVérifier le contenu de l'élément sur le CERT-FR.\nSignaler le cas à l'équipe Google Workspace : un titre ou un résumé inattendu peut révéler un défaut de la carte.\nSi besoin, publier l'élément à la main dans l'espace.",
    mailPiedUneFois: 'Aucun rappel ne sera envoyé : un e-mail « rétabli » suivra à la première nouvelle publication.',
    mailPiedUneParJour: 'Au plus un e-mail « publication refusée » par jour ; les éléments suivants restent au journal.',
    mailProblemePublicationRefusee: 'Aucune publication refusée récemment',
    mailEtiquetteReference: 'Référence',
    mailEtiquetteCategorie: 'Catégorie',
    mailEtiquetteTaille: 'Taille du message',
    mailObjetWebhookAbsent: '[Veille CERT-FR] ALERTE — webhook Chat non configuré',
    mailObjetFluxMuet: '[Veille CERT-FR] ATTENTION — aucune nouvelle publication depuis {0} jours',
    mailObjetRetabli: '[Veille CERT-FR] Rétabli — {0}',
    mailTitreFluxEchec: 'Le flux CERT-FR est illisible depuis {0} h',
    mailTitreWebhookRefuse: "L'espace Chat refuse les publications",
    mailTitreWebhookAbsent: "Le webhook Chat n'est pas configuré",
    mailTitreFluxMuet: 'Aucune nouvelle publication depuis {0} jours',
    mailTitreRetabli: 'Retour à la normale',
    mailCorpsFluxEchec: "Le flux du CERT-FR n'a pas pu être lu depuis {0} h. Aucune nouvelle publication n'est relayée dans l'espace Chat. Le flux ne garde que les derniers éléments : une panne longue peut faire manquer des publications.",
    mailCorpsWebhookRefuse: "L'espace Chat « Veille CERT-FR » a refusé la publication (HTTP {0}). Les publications de cette exécution sont suspendues ; elles seront retentées automatiquement dès que le webhook fonctionnera, dans la limite de {1} jours.",
    mailCorpsWebhookAbsent: "La propriété WEBHOOK_URL est absente ou n'a pas la forme attendue (https://chat.googleapis.com/v1/spaces/…). Aucune publication n'est faite.",
    mailCorpsFluxMuet: "Le flux est lisible, mais aucune nouvelle publication n'a été vue depuis {0} jours, alors que le CERT-FR publie en général chaque jour ouvré. Aucun rappel ne sera envoyé.",
    mailCorpsRetabli: '{0}. Problème signalé le {1}. Aucune action requise.',
    mailProblemeFluxEchec: 'Le flux CERT-FR est de nouveau lisible',
    mailProblemeWebhookRefuse: "L'espace Chat accepte de nouveau les publications",
    mailProblemeWebhookAbsent: 'Le webhook Chat est configuré',
    mailProblemeFluxMuet: 'De nouvelles publications sont de nouveau reçues',
    mailEtiquetteDepuis: 'Depuis',
    mailEtiquetteDerniereLecture: 'Dernière lecture réussie',
    mailEtiquetteDerniereExecution: 'Dernière exécution',
    mailEtiquetteMode: 'Mode',
    mailEtiquetteHttp: 'Code HTTP',
    mailEtiquetteSeuil: 'Seuil configuré',
    mailValeurModeReel: 'Réel',
    mailValeurModeSimulation: 'Simulation', // FR : complément / EN: addition
    mailValeurJamais: 'jamais',
    mailValeurHeures: '{0} h', // FR : complément / EN: addition
    mailValeurJours: '{0} jours', // FR : complément / EN: addition
    mailValeurOctets: '{0} octets', // FR : complément / EN: addition
    mailTitreActions: 'À faire',
    mailTitreDetail: 'Détail technique (support)',
    mailActionsFluxEchec: "Ouvrir le flux dans un navigateur : {0}.\nLancer diagnostiquer() depuis l'éditeur Apps Script.\nSi le code HTTP est 403, le site refuse peut-être Apps Script : prévenir l'équipe Google Workspace.",
    mailActionsWebhookRefuse: "Vérifier que l'espace existe et que le webhook n'a pas été révoqué.\nCréer un nouveau webhook dans l'espace (Applications et intégrations > Webhooks).\nMettre à jour la propriété WEBHOOK_URL, puis lancer envoyerMessageTest().",
    mailActionsWebhookAbsent: "Créer le webhook dans l'espace (Applications et intégrations > Webhooks).\nSaisir son URL dans la propriété WEBHOOK_URL (Paramètres du projet > Propriétés du script).\nLancer envoyerMessageTest() pour vérifier.",
    mailActionsFluxMuet: 'Consulter https://cert.cyber.gouv.fr/ pour vérifier que de nouvelles publications existent.\nLancer diagnostiquer() : vérifier la date du plus récent élément et les références reconnues.\nSi le site publie bien, vérifier l\'URL du flux (propriété URL_FLUX).',
    mailPied: "Message automatique du script gws-chat-veille-cert-fr (compte {0}). Une même alerte est envoyée au plus toutes les 24 h. Aucune alerte n'est postée dans l'espace Chat.",
    mailCompteProprietaire: 'propriétaire du script', // FR : complément / EN: addition
    mailDetailFlux: 'HTTP {0} après {1} essai(s) — {2}', // FR : complément / EN: addition
    mailDetailWebhook: 'HTTP {0} — {1}', // FR : complément / EN: addition
    mailDetailRefus: 'Éléments écartés : {0}', // FR : complément / EN: addition

    // FR : F. Journal. / EN: F. Log.
    journalFinExecution: 'Exécution terminée',
    journalSimulationMessage: 'SIMULATION — message non posté : cle={0} categorie={1} taille={2} octets titre="{3}"',
    journalSimulationJson: 'SIMULATION — JSON du premier message : {0}',
    journalSimulationAmorcage: "SIMULATION — amorçage : {0} clés seraient mémorisées, 1 message d'amorçage serait posté",
    journalAlerteSimulee: 'SIMULATION — e-mail non envoyé : {0}',
    journalElementIgnore: 'Élément ignoré : sans titre ou sans lien',
    journalCategorieInconnue: 'Catégorie inconnue : code={0} cle={1}',
    journalDateIllisible: 'Date illisible, heure de lecture utilisée : cle={0}',
    journalPublie: 'Publié : cle={0} categorie={1}',
    journalEchecPublication: 'Échec de publication : cle={0} http={1}',
    journalDeclencheurInstalle: "Déclencheur horaire installé sur relever() ; tout déclencheur précédent supprimé.",
    journalDeclencheurSupprime: '{0} déclencheur(s) supprimé(s) sur relever().',
    journalMemoireEffacee: "Mémoire effacée : le prochain lancement refera l'amorçage (un message d'information, aucune publication antérieure). Propriété CONFIRMER_REINITIALISATION remise à vide.",
    journalReinitialisationRefusee: "Réinitialisation refusée : saisir la propriété CONFIRMER_REINITIALISATION = oui, puis relancer. Rien n'a été modifié.",
    journalPublicationRefusee: 'Publication refusée (400), élément écarté : cle={0} taille={1}',
    journalAmorcageRefuse: "Message d'amorçage refusé (HTTP {0}) : mémoire non écrite, amorçage refait à la prochaine exécution.",
    journalTest: 'Message de test envoyé (HTTP {0}).',
    journalAmorcage: "Amorçage : message d'information posté, {0} clé(s) mémorisée(s).", // FR : complément / EN: addition
    journalNouvelEssai: 'Essai {0} en échec ({1}) : nouvel essai dans {2} ms.', // FR : complément / EN: addition
    journalAlerteEnvoyee: 'E-mail d\'alerte envoyé : {0}', // FR : complément / EN: addition
    journalEchecEmail: "Échec d'envoi de l'e-mail d'alerte {0} : {1}", // FR : complément / EN: addition
    journalAucunDestinataire: "Aucun destinataire pour l'e-mail d'alerte {0} : renseigner la propriété ADRESSE_ALERTE.", // FR : complément / EN: addition
    journalReglageInvalide: 'Réglage {0} invalide (entier ≥ 1 attendu) : valeur de CONFIG utilisée ({1}).', // FR : complément / EN: addition
    journalReglagePlafonne: 'Réglage {0} plafonné à {1} (limite de 9 Ko d\'une propriété).', // FR : complément / EN: addition
    journalLangueInconnue: 'LANGUE inconnue ({0}) : français utilisé.', // FR : complément / EN: addition
    journalUrlFluxInvalide: 'URL_FLUX invalide (https attendu) : URL par défaut utilisée.', // FR : complément / EN: addition
    journalErreurInattendue: 'Erreur inattendue : {0}', // FR : complément / EN: addition
    journalTestRefuse: 'Message de test refusé (HTTP {0}) — {1}', // FR : complément / EN: addition
    journalMemoireTronquee: 'Mémoire réduite à {0} clés pour tenir dans la limite de taille d\'une propriété.', // FR : complément / EN: addition
    traductionsManquantes: 'Traductions manquantes : {0}', // FR : complément / EN: addition

    // FR : G. Diagnostic. / EN: G. Diagnostic.
    diagTitre: 'Diagnostic Veille CERT-FR — {0}',
    diagFin: 'Fin du diagnostic',
    diagStatutOk: 'OK',
    diagStatutAttention: 'ATTENTION',
    diagStatutErreur: 'ERREUR',
    diagStatutInfo: 'INFO',
    diagMode: 'Mode : DRY_RUN={0}',
    diagFlux: 'Flux : HTTP {0} · URL finale {1} ({2})',
    diagRedirection: 'redirection suivie',
    diagSansRedirection: 'pas de redirection',
    diagElements: 'Éléments : {0} lus, {1} ignorés',
    diagCategories: 'Catégories : {0}',
    diagPlusRecent: 'Plus récent : {0}',
    diagReferencesInconnues: 'Références non reconnues : {0} (classées « Autre »)',
    diagWebhookOk: 'WEBHOOK_URL : présente, forme valide ({0})',
    diagWebhookAbsent: 'WEBHOOK_URL : absente',
    diagWebhookInvalide: 'WEBHOOK_URL : forme invalide (attendu : https://chat.googleapis.com/v1/spaces/…)',
    diagCategoriesFiltre: 'CATEGORIES : {0}',
    diagMemoire: 'Mémoire : {0} clés (sur {1} au plus), environ {2} Ko',
    diagDeclencheurOk: 'Déclencheur : 1 déclencheur horaire sur relever()',
    diagDeclencheurAucun: 'Déclencheur : aucun (lancer installerDeclencheur())',
    diagDeclencheurDoublon: 'Déclencheur : {0} déclencheurs sur relever() (lancer installerDeclencheur())',
    diagDerniereExecution: 'Dernière exécution : {0} · {1} · dernière lecture réussie {2}',
    diagAucuneExecution: 'Dernière exécution : aucune',
    diagScopes: 'Scopes : {0}',
    diagFluxErreur: 'Flux : {0}',
    diagSourceConfig: 'CONFIG', // FR : compléments du diagnostic / EN: diagnostic additions
    diagSourcePropriete: 'propriété',
    diagModeSimulation: 'simulation',
    diagModeReel: 'réel',
    diagUrlFlux: 'URL du flux : {0} ({1})',
    diagRedirections: 'Redirections : {0}',
    diagStructure: 'Structure : racine <{0}> version {1}, {2} item(s) ; champs présents : {3}',
    diagDomaines: 'Domaines des liens : {0}',
    diagExemple: 'Exemple (1er élément) : {0}',
    diagDatesIllisibles: 'Dates illisibles : {0}',
    diagSansReference: 'Éléments sans référence CERTFR : {0} (clé tirée du guid ou du lien)',
    diagMemoireAbsente: 'Mémoire : absente — la prochaine exécution fera l\'amorçage (aucune publication antérieure)',
    diagMemoireIllisible: 'Mémoire : illisible — la prochaine exécution fera l\'amorçage',
    diagScopesManquants: 'Scopes manquants : {0}',
    diagScopesIllisibles: 'Scopes : liste des autorisations illisible',
    diagReglage: '{0} = {1} ({2})',
    diagReglageInvalide: '{0} : valeur de propriété invalide ignorée, {1} utilisé (CONFIG)',
    diagReglagePlafonne: '{0} : valeur plafonnée à {1}',
    diagLangue: 'LANGUE : {0} ({1})',
    diagLangueInconnue: 'LANGUE : valeur inconnue ignorée, fr utilisé',
    diagAdresseAlerte: 'ADRESSE_ALERTE : présente ({0})',
    diagAdresseInvalide: 'ADRESSE_ALERTE : adresse invalide, ignorée — corriger la propriété ADRESSE_ALERTE (Paramètres du projet > Propriétés du script)',
    diagAdresseProprietaire: "ADRESSE_ALERTE : non renseignée — renseigner la propriété ADRESSE_ALERTE (Paramètres du projet > Propriétés du script). En attendant, repli sur le compte qui exécute le script ({0}), lu sans garantie : le scope userinfo.email n'est pas déclaré",
    diagAdresseAucune: "ADRESSE_ALERTE : non renseignée et adresse du compte exécutant illisible — aucune alerte ne peut partir : renseigner la propriété ADRESSE_ALERTE (Paramètres du projet > Propriétés du script)",
    diagConfirmation: 'CONFIRMER_REINITIALISATION : renseignée ({0}) — {1}',
    diagConfirmationActive: 'le prochain appel de reinitialiserMemoire() effacera la mémoire',
    diagConfirmationInactive: 'valeur différente de « oui », sans effet',
    diagAlertesEnCours: 'Alertes en cours : {0}',
    diagAucuneAlerte: 'Alertes en cours : aucune',
    diagCategoriesInconnues: 'CATEGORIES : codes inconnus ignorés : {0}',
    diagDebutReponse: 'Début de la réponse : {0}',
    diagSourcesCategorie: 'Origine de la catégorie : {0}',
    diagExceptionSection: 'Section du diagnostic interrompue : {0}',
    diagToutes: 'toutes',
    diagJamais: 'jamais',

    // FR : H. Erreurs et avertissements. / EN: H. Errors and warnings.
    erreurVerrou: 'Une autre exécution est en cours : celle-ci est abandonnée.',
    erreurFluxHttp: 'Le flux CERT-FR ne répond pas correctement — HTTP {0} après {1} essais.',
    erreurFluxXml: "Le flux CERT-FR n'est pas un flux RSS lisible — {0}",
    erreurFluxVide: 'Le flux CERT-FR ne contient aucune publication exploitable.',
    erreurWebhookRefuse: "L'espace Chat refuse les publications (webhook révoqué, espace supprimé ou accès refusé) — HTTP {0}.",
    erreurPublicationRefusee: 'Chat refuse cette publication (message invalide) — HTTP 400 ; élément écarté, les autres continuent.',
    avertReinitialisationRefusee: 'Réinitialisation refusée : confirmation absente.',
    erreurWebhookTransitoire: "L'espace Chat est momentanément indisponible — HTTP {0} ; nouvel essai à la prochaine exécution.",
    erreurWebhookNonConfigure: 'WEBHOOK_URL est absente ou mal formée : aucune publication possible.',
    infoWebhookNonConfigureSimulation: 'WEBHOOK_URL absente ou mal formée (sans conséquence en simulation).',
    avertGardeTemps: "Arrêt avant la limite de temps : les publications restantes seront traitées à l'exécution suivante.",
    avertAdresseAlerte: 'ADRESSE_ALERTE invalide : e-mails envoyés au propriétaire du script.',
    avertCategoriesInconnues: 'CATEGORIES contient des codes inconnus ignorés : {0}.',
    avertCategoriesToutesInconnues: 'CATEGORIES ne contient aucun code connu : toutes les catégories sont publiées.', // FR : complément / EN: addition
    erreurRedirections: 'trop de redirections ou redirection illisible', // FR : complément / EN: addition
    erreurRacine: 'racine <{0}> au lieu de <rss><channel>', // FR : complément / EN: addition
    erreurReseau: 'erreur réseau ({0})', // FR : complément / EN: addition
  },

  en: {
    categorieAle: 'Alert',
    categorieAvi: 'Security advisory',
    categorieAct: 'News bulletin',
    categorieCti: 'Threat report',
    categorieIoc: 'Indicators of compromise',
    categorieDur: 'Hardening guide',
    categorieInf: 'Information',
    categorieAutre: 'Other',

    carteTitreEntete: '{0} {1}',
    carteSousTitre: 'CERT-FR · {0}',
    carteBandeauAlerte: '{0} ALERT — exploited or critical vulnerability: review first',
    carteEtiquetteCategorie: 'Category',
    carteEtiquetteDate: 'Published on',
    carteBouton: 'Read on CERT-FR',
    carteLienHorsDomaine: 'Unverified link (outside CERT-FR domain): {0}',
    texteRepli: '{0} {1} — {2} — {3}',
    referenceAbsente: 'no reference',

    amorcageTitre: '✅ CERT-FR watch active',
    amorcageSousTitre: 'CERT-FR feed · polled every hour',
    amorcageCorpsUne: 'New CERT-FR publications will be relayed here, one per thread. 1 earlier publication not included.',
    amorcageCorpsPlusieurs: 'New CERT-FR publications will be relayed here, one per thread. {0} earlier publications not included.',
    amorcageEtiquetteCategories: 'Categories relayed',
    amorcageToutes: 'all',
    amorcageLegende: 'Visual markers by category',
    amorcageRepli: '✅ CERT-FR watch active — {0} earlier publication(s) not included.',
    referenceAmorcage: 'bootstrap message',

    testTitre: '🧪 TEST — CERT-FR watch',
    testSousTitre: 'Test message, not a real publication',
    testCorps: 'This message validates the space webhook. It matches no CERT-FR publication and has no effect on the script memory.',
    testEtiquetteMode: 'Script mode',
    testModeSimulation: 'Dry run (DRY_RUN on): only this test message is posted',
    testModeReel: 'Live mode (DRY_RUN off)',
    testEtiquetteDate: 'Sent on',
    testBouton: 'Open the CERT-FR website',
    testRepli: '🧪 TEST — CERT-FR watch — test message of {0}, please ignore',

    mailExpediteur: 'CERT-FR watch',
    mailSurtitre: 'CERT-FR watch · Operational alert',
    mailMotAlerte: 'ALERT',
    mailMotAttention: 'WARNING',
    mailMotRetabli: 'RESTORED',
    mailObjetFluxEchec: '[CERT-FR watch] ALERT — CERT-FR feed unreadable for {0} h',
    mailObjetWebhookRefuse: '[CERT-FR watch] ALERT — the Chat space rejects posts',
    mailObjetPublicationRefusee: '[CERT-FR watch] WARNING — a post was rejected by Chat ({0})',
    mailTitrePublicationRefusee: 'A post was rejected by Chat',
    mailCorpsPublicationRefusee: 'Chat rejected the post {0} (HTTP 400, invalid message). The item is discarded and will not be retried; other posts continue.',
    mailActionsPublicationRefusee: "Read the detail in the execution log (key and message size).\nCheck the item's content on CERT-FR.\nReport the case to the Google Workspace team: an unexpected title or summary may reveal a card defect.\nIf needed, post the item manually in the space.",
    mailPiedUneFois: 'No reminder will be sent: a "restored" e-mail will follow at the first new publication.',
    mailPiedUneParJour: 'At most one "post rejected" e-mail per day; further items stay in the log.',
    mailProblemePublicationRefusee: 'No recent rejected post',
    mailEtiquetteReference: 'Reference',
    mailEtiquetteCategorie: 'Category',
    mailEtiquetteTaille: 'Message size',
    mailObjetWebhookAbsent: '[CERT-FR watch] ALERT — Chat webhook not configured',
    mailObjetFluxMuet: '[CERT-FR watch] WARNING — no new publication for {0} days',
    mailObjetRetabli: '[CERT-FR watch] Restored — {0}',
    mailTitreFluxEchec: 'The CERT-FR feed has been unreadable for {0} h',
    mailTitreWebhookRefuse: 'The Chat space rejects posts',
    mailTitreWebhookAbsent: 'The Chat webhook is not configured',
    mailTitreFluxMuet: 'No new publication for {0} days',
    mailTitreRetabli: 'Back to normal',
    mailCorpsFluxEchec: 'The CERT-FR feed could not be read for {0} h. No new publication is relayed to the Chat space. The feed only keeps the latest items: a long outage can cause missed publications.',
    mailCorpsWebhookRefuse: 'The "Veille CERT-FR" Chat space rejected the post (HTTP {0}). Posting is suspended for this run; items will be retried automatically once the webhook works, within {1} days.',
    mailCorpsWebhookAbsent: 'The WEBHOOK_URL property is missing or malformed (https://chat.googleapis.com/v1/spaces/…). Nothing is posted.',
    mailCorpsFluxMuet: 'The feed is readable, but no new publication has been seen for {0} days, while CERT-FR normally publishes every working day. No reminder will be sent.',
    mailCorpsRetabli: '{0}. Problem reported on {1}. No action required.',
    mailProblemeFluxEchec: 'The CERT-FR feed is readable again',
    mailProblemeWebhookRefuse: 'The Chat space accepts posts again',
    mailProblemeWebhookAbsent: 'The Chat webhook is configured',
    mailProblemeFluxMuet: 'New publications are being received again',
    mailEtiquetteDepuis: 'Since',
    mailEtiquetteDerniereLecture: 'Last successful read',
    mailEtiquetteDerniereExecution: 'Last run',
    mailEtiquetteMode: 'Mode',
    mailEtiquetteHttp: 'HTTP code',
    mailEtiquetteSeuil: 'Configured threshold',
    mailValeurModeReel: 'Live',
    mailValeurModeSimulation: 'Dry run',
    mailValeurJamais: 'never',
    mailValeurHeures: '{0} h',
    mailValeurJours: '{0} days',
    mailValeurOctets: '{0} bytes',
    mailTitreActions: 'To do',
    mailTitreDetail: 'Technical detail (support)',
    mailActionsFluxEchec: 'Open the feed in a browser: {0}.\nRun diagnostiquer() from the Apps Script editor.\nIf the HTTP code is 403, the site may be rejecting Apps Script: inform the Google Workspace team.',
    mailActionsWebhookRefuse: 'Check that the space exists and the webhook was not revoked.\nCreate a new webhook in the space (Apps & integrations > Webhooks).\nUpdate the WEBHOOK_URL property, then run envoyerMessageTest().',
    mailActionsWebhookAbsent: 'Create the webhook in the space (Apps & integrations > Webhooks).\nEnter its URL in the WEBHOOK_URL property (Project settings > Script properties).\nRun envoyerMessageTest() to check.',
    mailActionsFluxMuet: 'Check https://cert.cyber.gouv.fr/ for new publications.\nRun diagnostiquer(): check the latest item date and recognised references.\nIf the site is publishing, check the feed URL (URL_FLUX property).',
    mailPied: 'Automatic message from the gws-chat-veille-cert-fr script (account {0}). The same alert is sent at most once every 24 h. No alert is posted to the Chat space.',
    mailCompteProprietaire: 'script owner',
    mailDetailFlux: 'HTTP {0} after {1} attempt(s) — {2}',
    mailDetailWebhook: 'HTTP {0} — {1}',
    mailDetailRefus: 'Discarded items: {0}',

    journalFinExecution: 'Run finished',
    journalSimulationMessage: 'DRY RUN — message not posted: cle={0} categorie={1} taille={2} bytes titre="{3}"',
    journalSimulationJson: 'DRY RUN — first message JSON: {0}',
    journalSimulationAmorcage: 'DRY RUN — bootstrap: {0} keys would be memorised, 1 bootstrap message would be posted',
    journalAlerteSimulee: 'DRY RUN — e-mail not sent: {0}',
    journalElementIgnore: 'Item skipped: no title or no link',
    journalCategorieInconnue: 'Unknown category: code={0} cle={1}',
    journalDateIllisible: 'Unreadable date, read time used: cle={0}',
    journalPublie: 'Posted: cle={0} categorie={1}',
    journalEchecPublication: 'Posting failed: cle={0} http={1}',
    journalDeclencheurInstalle: 'Hourly trigger installed on relever(); any previous trigger removed.',
    journalDeclencheurSupprime: '{0} trigger(s) removed from relever().',
    journalMemoireEffacee: 'Memory cleared: the next run will bootstrap again (one information message, no earlier publication). CONFIRMER_REINITIALISATION property emptied.',
    journalReinitialisationRefusee: 'Reset refused: set the CONFIRMER_REINITIALISATION property to oui, then run again. Nothing was changed.',
    journalPublicationRefusee: 'Post rejected (400), item discarded: cle={0} taille={1}',
    journalAmorcageRefuse: 'Bootstrap message rejected (HTTP {0}): memory not written, bootstrap redone at the next run.',
    journalTest: 'Test message sent (HTTP {0}).',
    journalAmorcage: 'Bootstrap: information message posted, {0} key(s) memorised.',
    journalNouvelEssai: 'Attempt {0} failed ({1}): retrying in {2} ms.',
    journalAlerteEnvoyee: 'Alert e-mail sent: {0}',
    journalEchecEmail: 'Failed to send alert e-mail {0}: {1}',
    journalAucunDestinataire: 'No recipient for alert e-mail {0}: set the ADRESSE_ALERTE property.',
    journalReglageInvalide: 'Invalid {0} setting (integer ≥ 1 expected): CONFIG value used ({1}).',
    journalReglagePlafonne: '{0} setting capped at {1} (9 KB property limit).',
    journalLangueInconnue: 'Unknown LANGUE ({0}): French used.',
    journalUrlFluxInvalide: 'Invalid URL_FLUX (https expected): default URL used.',
    journalErreurInattendue: 'Unexpected error: {0}',
    journalTestRefuse: 'Test message rejected (HTTP {0}) — {1}',
    journalMemoireTronquee: 'Memory reduced to {0} keys to fit the property size limit.',
    traductionsManquantes: 'Missing translations: {0}',

    diagTitre: 'CERT-FR watch diagnostic — {0}',
    diagFin: 'End of diagnostic',
    diagStatutOk: 'OK',
    diagStatutAttention: 'WARNING',
    diagStatutErreur: 'ERROR',
    diagStatutInfo: 'INFO',
    diagMode: 'Mode: DRY_RUN={0}',
    diagFlux: 'Feed: HTTP {0} · final URL {1} ({2})',
    diagRedirection: 'redirect followed',
    diagSansRedirection: 'no redirect',
    diagElements: 'Items: {0} read, {1} skipped',
    diagCategories: 'Categories: {0}',
    diagPlusRecent: 'Latest: {0}',
    diagReferencesInconnues: 'Unrecognised references: {0} (classed "Other")',
    diagWebhookOk: 'WEBHOOK_URL: present, valid format ({0})',
    diagWebhookAbsent: 'WEBHOOK_URL: missing',
    diagWebhookInvalide: 'WEBHOOK_URL: invalid format (expected: https://chat.googleapis.com/v1/spaces/…)',
    diagCategoriesFiltre: 'CATEGORIES: {0}',
    diagMemoire: 'Memory: {0} keys (max {1}), about {2} KB',
    diagDeclencheurOk: 'Trigger: 1 hourly trigger on relever()',
    diagDeclencheurAucun: 'Trigger: none (run installerDeclencheur())',
    diagDeclencheurDoublon: 'Trigger: {0} triggers on relever() (run installerDeclencheur())',
    diagDerniereExecution: 'Last run: {0} · {1} · last successful read {2}',
    diagAucuneExecution: 'Last run: none',
    diagScopes: 'Scopes: {0}',
    diagFluxErreur: 'Feed: {0}',
    diagSourceConfig: 'CONFIG',
    diagSourcePropriete: 'property',
    diagModeSimulation: 'dry run',
    diagModeReel: 'live',
    diagUrlFlux: 'Feed URL: {0} ({1})',
    diagRedirections: 'Redirects: {0}',
    diagStructure: 'Structure: root <{0}> version {1}, {2} item(s); fields present: {3}',
    diagDomaines: 'Link domains: {0}',
    diagExemple: 'Example (1st item): {0}',
    diagDatesIllisibles: 'Unreadable dates: {0}',
    diagSansReference: 'Items without a CERTFR reference: {0} (key taken from guid or link)',
    diagMemoireAbsente: 'Memory: missing — the next run will bootstrap (no earlier publication)',
    diagMemoireIllisible: 'Memory: unreadable — the next run will bootstrap',
    diagScopesManquants: 'Missing scopes: {0}',
    diagScopesIllisibles: 'Scopes: authorisation list unreadable',
    diagReglage: '{0} = {1} ({2})',
    diagReglageInvalide: '{0}: invalid property value ignored, {1} used (CONFIG)',
    diagReglagePlafonne: '{0}: value capped at {1}',
    diagLangue: 'LANGUE: {0} ({1})',
    diagLangueInconnue: 'LANGUE: unknown value ignored, fr used',
    diagAdresseAlerte: 'ADRESSE_ALERTE: present ({0})',
    diagAdresseInvalide: 'ADRESSE_ALERTE: invalid address, ignored — fix the ADRESSE_ALERTE property (Project settings > Script properties)',
    diagAdresseProprietaire: 'ADRESSE_ALERTE: not set — set the ADRESSE_ALERTE property (Project settings > Script properties). Meanwhile, falling back to the account running the script ({0}), read without guarantee: the userinfo.email scope is not declared',
    diagAdresseAucune: 'ADRESSE_ALERTE: not set and running account address unreadable — no alert can be sent: set the ADRESSE_ALERTE property (Project settings > Script properties)',
    diagConfirmation: 'CONFIRMER_REINITIALISATION: set ({0}) — {1}',
    diagConfirmationActive: 'the next reinitialiserMemoire() call will clear the memory',
    diagConfirmationInactive: 'value other than "oui", no effect',
    diagAlertesEnCours: 'Ongoing alerts: {0}',
    diagAucuneAlerte: 'Ongoing alerts: none',
    diagCategoriesInconnues: 'CATEGORIES: unknown codes ignored: {0}',
    diagDebutReponse: 'Start of response: {0}',
    diagSourcesCategorie: 'Category origin: {0}',
    diagExceptionSection: 'Diagnostic section interrupted: {0}',
    diagToutes: 'all',
    diagJamais: 'never',

    erreurVerrou: 'Another run is in progress: this one is abandoned.',
    erreurFluxHttp: 'The CERT-FR feed is not responding properly — HTTP {0} after {1} attempts.',
    erreurFluxXml: 'The CERT-FR feed is not a readable RSS feed — {0}',
    erreurFluxVide: 'The CERT-FR feed contains no usable publication.',
    erreurWebhookRefuse: 'The Chat space rejects posts (revoked webhook, deleted space or access denied) — HTTP {0}.',
    erreurPublicationRefusee: 'Chat rejects this post (invalid message) — HTTP 400; item discarded, others continue.',
    avertReinitialisationRefusee: 'Reset refused: confirmation missing.',
    erreurWebhookTransitoire: 'The Chat space is temporarily unavailable — HTTP {0}; retry at the next run.',
    erreurWebhookNonConfigure: 'WEBHOOK_URL is missing or malformed: nothing can be posted.',
    infoWebhookNonConfigureSimulation: 'WEBHOOK_URL missing or malformed (harmless in dry run).',
    avertGardeTemps: 'Stopped before the time limit: remaining items will be handled at the next run.',
    avertAdresseAlerte: 'ADRESSE_ALERTE invalid: e-mails sent to the script owner.',
    avertCategoriesInconnues: 'CATEGORIES contains unknown codes, ignored: {0}.',
    avertCategoriesToutesInconnues: 'CATEGORIES holds no known code: all categories are posted.',
    erreurRedirections: 'too many redirects or unreadable redirect',
    erreurRacine: 'root <{0}> instead of <rss><channel>',
    erreurReseau: 'network error ({0})',
  },
});

/**
 * FR : Langue retenue pour les textes produits (RM-26) : « fr » ou « en » ; toute autre valeur donne la langue par
 *      défaut. Le script autonome n'a pas de locale utilisateur fiable (déclencheur) : seule la propriété LANGUE compte.
 * EN: Language used for produced texts (RM-26): "fr" or "en"; any other value gives the default language. The
 *     standalone script has no reliable user locale (trigger): only the LANGUE property counts.
 * @param {*} valeur FR : valeur brute de la propriété LANGUE. EN: raw LANGUE property value.
 * @return {{langue: string, inconnue: boolean}}
 */
function langueEffective_(valeur) {
  const texte = String(valeur ?? '').trim().toLowerCase();
  if (!texte) return { langue: CONFIG.LANGUE_DEFAUT, inconnue: false };
  if (CONFIG.LANGUES.includes(texte)) return { langue: texte, inconnue: false };
  return { langue: CONFIG.LANGUE_DEFAUT, inconnue: true };
}

/**
 * FR : Texte traduit avec ses paramètres {0}, {1}… (un paramètre { cle, parametres } est traduit dans la même langue) ;
 *      repli sur la langue par défaut, puis sur la clé.
 * EN: Translated text with its {0}, {1}… placeholders (a { cle, parametres } parameter is translated in the same
 *     language); falls back to the default language, then to the key.
 * @param {string} cle
 * @param {string} [langue]
 * @param {...*} valeurs
 * @return {string}
 */
function t_(cle, langue = CONFIG.LANGUE_DEFAUT, ...valeurs) {
  const modele = TEXTES[langue]?.[cle] ?? TEXTES[CONFIG.LANGUE_DEFAUT][cle] ?? cle;
  return modele.replace(/\{(\d+)\}/g, (_, position) => rendreValeur_(valeurs[Number(position)], langue));
}

/**
 * FR : Valeur d'un paramètre dans une langue : un message neutre { cle, parametres } est traduit dans cette même langue
 *      (récursivement) ; toute autre valeur est convertie en texte. Permet de transporter une erreur sans la figer
 *      dans une langue, puis de la rendre une seule fois en FR et en EN.
 * EN: Parameter value in a language: a neutral message { cle, parametres } is translated into that same language
 *     (recursively); any other value is converted to text. Carries an error without freezing it in one language, then
 *     renders it once in FR and in EN.
 * @param {*} valeur
 * @param {string} langue
 * @return {string}
 */
function rendreValeur_(valeur, langue) {
  if (valeur && typeof valeur === 'object' && typeof valeur.cle === 'string') return t_(valeur.cle, langue, ...(valeur.parametres ?? []));
  return String(valeur ?? '');
}

/**
 * FR : Texte bilingue « français / anglais » (journaux et diagnostic).
 * EN: Bilingual "French / English" text (logs and diagnostic).
 * @param {string} cle
 * @param {...*} valeurs
 * @return {string}
 */
function tBilingue_(cle, ...valeurs) {
  const [francais, anglais] = [t_(cle, 'fr', ...valeurs), t_(cle, 'en', ...valeurs)];
  return francais === anglais ? francais : `${francais} / ${anglais}`;
}

/**
 * FR : Signale les clés présentes dans une langue mais absentes de l'autre.
 * EN: Reports keys present in one language but missing in the other.
 * @return {string[]} FR : clés manquantes (langue.cle). EN: missing keys (language.key).
 */
function verifierTraductions_() {
  const toutesCles = new Set(CONFIG.LANGUES.flatMap((langue) => Object.keys(TEXTES[langue])));
  const manquantes = [...toutesCles].flatMap((cle) => CONFIG.LANGUES.filter((langue) => !(cle in TEXTES[langue])).map((langue) => `${langue}.${cle}`));
  if (manquantes.length) console.warn(tBilingue_('traductionsManquantes', manquantes.join(', ')));
  return manquantes;
}
