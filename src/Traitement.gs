/**
 * FR : Déroulé d'une relève (relever) : contexte et réglages, lecture et analyse du flux, amorçage ou publication des
 *      nouveaux éléments, mémoire, alertes, état DERNIERE_EXECUTION et ligne de synthèse du journal (RM-1 à RM-21).
 *      Les décisions sont prises par les fonctions pures d'Analyse.gs, Cartes.gs et Alertes.gs.
 * EN: Course of a polling run (relever): context and settings, feed read and analysis, bootstrap or posting of new items,
 *     memory, alerts, DERNIERE_EXECUTION state and log summary line (RM-1 to RM-21). Decisions are taken by the pure
 *     functions of Analyse.gs, Cartes.gs and Alertes.gs.
 */

/**
 * FR : Relève complète sous verrou (RM-20) ; verrou non obtenu → rien n'est lu ni posté, ligne de synthèse réduite.
 * EN: Full polling run under lock (RM-20); lock not obtained → nothing read nor posted, reduced summary line.
 * @param {string} mode FR : 'declencheur' ou 'manuel'. EN: 'declencheur' or 'manuel'.
 * @return {Object} FR : bilan de l'exécution. EN: run report.
 */
function executerReleve_(mode) {
  const debutMs = maintenant_().getTime();
  const verrou = sousVerrou_(() => traiterReleve_(mode, debutMs));
  if (verrou.obtenu) return verrou.valeur;
  console.warn(tBilingue_('erreurVerrou'));
  console.log(`${CONFIG.PREFIXE_JOURNAL} ${tBilingue_('journalFinExecution')} | resultat=verrou_non_obtenu`);
  return { resultat: 'verrou_non_obtenu' };
}

/**
 * FR : Corps de la relève (sous verrou).
 * EN: Body of the polling run (under lock).
 * @param {string} mode
 * @param {number} debutMs
 * @return {Object}
 */
function traiterReleve_(mode, debutMs) {
  const contexte = preparerContexte_(mode, debutMs);
  const bilan = {
    resultat: '', lus: 0, ignores: 0, nouveaux: 0, ecartesCategorie: 0, ecartesAnciennete: 0, publies: 0, echecs: 0,
    refuses: 0, reportes: 0, amorcage: false, gardeTemps: false, refus: [], constats: {}, alertes: 'aucune',
  };
  const lecture = lireEtAnalyserFlux_(contexte.urlFlux, contexte.instant);
  if (lecture.analyse) {
    bilan.lus = lecture.analyse.elements.length;
    bilan.ignores = lecture.analyse.ignores;
  }
  if (!lecture.ok) {
    traiterEchecFlux_(contexte, bilan, lecture);
  } else {
    journaliserAnalyse_(lecture.analyse);
    const etat = contexte.etatExecution;
    etat.derniereLectureReussie = contexte.instant.toISOString();
    delete etat.premierEchec;
    bilan.constats.fluxEchec = { actif: false };
    if (contexte.memoire === null) amorcer_(contexte, bilan, lecture.analyse.elements);
    else publierNouveaux_(contexte, bilan, lecture.analyse.elements);
  }
  terminerReleve_(contexte, bilan);
  return bilan;
}

/**
 * FR : Contexte de l'exécution : propriétés lues en un appel, mode, langue, réglages, filtre, webhook, adresse
 *      d'alerte, mémoire et états ; avertissements de configuration journalisés (RM-5, RM-26).
 * EN: Run context: properties read in one call, mode, language, settings, filter, webhook, alert address, memory and
 *     states; configuration warnings logged (RM-5, RM-26).
 * @param {string} mode
 * @param {number} debutMs
 * @return {Object}
 */
function preparerContexte_(mode, debutMs) {
  const proprietes = lireProprietes_();
  const cles = CONFIG.CLES_PROPRIETES;
  const reglages = lireReglages_(proprietes);
  const langue = langueEffective_(proprietes[cles.LANGUE]);
  const urlFlux = lireUrlFlux_(proprietes);
  const filtre = lireFiltreCategories_(proprietes);
  const compte = adresseExecutant_();
  const adresse = lireAdresseAlerte_(proprietes, compte);
  for (const detail of reglages.details) {
    if (detail.invalide) console.warn(tBilingue_('journalReglageInvalide', detail.nom, CONFIG.REGLAGES[detail.nom]));
    if (detail.plafonne) console.warn(tBilingue_('journalReglagePlafonne', detail.nom, detail.valeur));
  }
  if (langue.inconnue) console.warn(tBilingue_('journalLangueInconnue', String(proprietes[cles.LANGUE]).slice(0, 20)));
  if (urlFlux.invalide) console.warn(tBilingue_('journalUrlFluxInvalide'));
  if (filtre.inconnus.length) console.warn(tBilingue_('avertCategoriesInconnues', filtre.inconnus.join(', ').slice(0, 100)));
  if (filtre.toutesInconnues) console.warn(tBilingue_('avertCategoriesToutesInconnues'));
  if (adresse.invalide) console.warn(tBilingue_('avertAdresseAlerte'));
  return {
    mode, debutMs, instant: maintenant_(), simulation: lireModeSimulation_(proprietes).simulation, langue: langue.langue,
    reglages: reglages.valeurs, urlFlux: urlFlux.url, filtre, webhook: lireWebhook_(proprietes), compte,
    destinataire: adresse.adresse, memoire: lireMemoire_(proprietes[cles.ELEMENTS_VUS]),
    etatExecution: lireJson_(proprietes[cles.DERNIERE_EXECUTION], {}) ?? {},
    etatAlertes: lireJson_(proprietes[cles.ALERTES_ENVOYEES], {}) ?? {},
  };
}

/**
 * FR : Lit le flux et l'analyse (RM-1, RM-2) : HTTP 200, XML lisible, racine rss/channel, au moins un item avec titre et
 *      lien. Sert aussi au diagnostic. ok = false avec la clé du message d'erreur sinon.
 * EN: Reads and analyses the feed (RM-1, RM-2): HTTP 200, readable XML, rss/channel root, at least one item with title
 *     and link. Also used by the diagnostic. ok = false with the error message key otherwise.
 * @param {string} urlFlux
 * @param {Date} instant
 * @return {{ok: boolean, reponse: Object, cle?: string, parametres?: Array, xml?: Object, analyse?: Object}} FR : cle et
 *     parametres sont neutres (un paramètre peut être lui-même { cle, parametres }) : rendus par t_ / tBilingue_.
 *     EN: cle and parametres are neutral (a parameter may itself be { cle, parametres }): rendered by t_ / tBilingue_.
 */
function lireEtAnalyserFlux_(urlFlux, instant) {
  const reponse = lireFlux_(urlFlux);
  if (reponse.code !== 200) {
    return { ok: false, reponse, cle: 'erreurFluxHttp', parametres: [reponse.code, reponse.essais] };
  }
  let xml;
  try {
    xml = analyserXmlRss_(reponse.texte);
  } catch (erreur) {
    const detail = erreur?.messageNeutre ?? masquerTexte_(erreur?.message ?? erreur).slice(0, 160);
    return { ok: false, reponse, cle: 'erreurFluxXml', parametres: [detail] };
  }
  const analyse = normaliserElements_(xml.items, reponse.urlFinale, instant);
  if (!analyse.elements.length) return { ok: false, reponse, xml, analyse, cle: 'erreurFluxVide', parametres: [] };
  return { ok: true, reponse, xml, analyse };
}

/**
 * FR : Lecture en échec (RM-2, RM-17) : aucune publication, mémoire inchangée ; alerte « flux en échec » au-delà de
 *      SEUIL_ECHEC_HEURES depuis la dernière lecture réussie (à défaut depuis la première tentative en échec).
 * EN: Failed read (RM-2, RM-17): nothing posted, memory unchanged; "feed failing" alert beyond SEUIL_ECHEC_HEURES since
 *     the last successful read (otherwise since the first failed attempt).
 * @param {Object} contexte
 * @param {Object} bilan
 * @param {Object} lecture
 */
function traiterEchecFlux_(contexte, bilan, lecture) {
  const reseau = lecture.reponse.reseau ? ` — ${tBilingue_('erreurReseau', lecture.reponse.reseau)}` : '';
  console.error(`${tBilingue_(lecture.cle, ...lecture.parametres)}${reseau}`);
  bilan.resultat = 'echec_flux';
  const etat = contexte.etatExecution;
  if (!etat.premierEchec) etat.premierEchec = contexte.instant.toISOString();
  const reference = etat.derniereLectureReussie || etat.premierEchec;
  const ecouleMs = contexte.instant.getTime() - (dateDepuisIso_(reference)?.getTime() ?? contexte.instant.getTime());
  if (ecouleMs > contexte.reglages.SEUIL_ECHEC_HEURES * 3600 * 1000) {
    bilan.constats.fluxEchec = {
      actif: true, heures: Math.floor(ecouleMs / 3600000), code: lecture.reponse.code, essais: lecture.reponse.essais,
      reseau: lecture.reponse.reseau || '',
      erreur: lecture.cle === 'erreurFluxHttp' ? null : { cle: lecture.cle, parametres: lecture.parametres },
      depuis: reference,
    };
  }
}

/**
 * FR : Lignes de détail de l'analyse (design §7) : éléments ignorés, catégories inconnues, dates illisibles.
 * EN: Analysis detail lines (design §7): skipped items, unknown categories, unreadable dates.
 * @param {Object} analyse
 */
function journaliserAnalyse_(analyse) {
  for (let rang = 0; rang < analyse.ignores; rang++) console.warn(tBilingue_('journalElementIgnore'));
  for (const { code, cle } of analyse.categoriesInconnues) console.warn(tBilingue_('journalCategorieInconnue', code, cle));
  for (const cle of analyse.datesIllisibles) console.warn(tBilingue_('journalDateIllisible', cle));
}

/**
 * FR : Issue d'une réponse du webhook (RM-16) : 'ok' (200), 'refuse400', 'refuse' (401, 403, 404), 'echec' (autre).
 * EN: Outcome of a webhook response (RM-16): 'ok' (200), 'refuse400', 'refuse' (401, 403, 404), 'echec' (other).
 * @param {number} code
 * @return {string}
 */
function classerReponseWebhook_(code) {
  if (code === 200) return 'ok';
  if (code === 400) return 'refuse400';
  if ([401, 403, 404].includes(code)) return 'refuse';
  return 'echec';
}

/**
 * FR : Ajoute des clés à la mémoire et l'enregistre aussitôt (RM-8, RM-9), dans la limite de taille d'une propriété.
 * EN: Adds keys to memory and saves it at once (RM-8, RM-9), within a property's size limit.
 * @param {Object} contexte
 * @param {string[]} cles
 */
function memoriser_(contexte, cles) {
  const liste = ajouterCles_(contexte.memoire, cles, contexte.reglages.MEMOIRE_MAX);
  const serialisee = serialiserMemoire_(liste);
  if (serialisee.tronquee) console.warn(tBilingue_('journalMemoireTronquee', serialisee.nombre));
  ecrirePropriete_('ELEMENTS_VUS', serialisee.json);
  contexte.memoire = liste.slice(0, serialisee.nombre);
}

/**
 * FR : Premier lancement (RM-11) : un seul message d'information, mémoire écrite seulement après sa réponse 200 ;
 *      simulation : décrit au journal, rien n'est posté ni écrit.
 * EN: First run (RM-11): one information message, memory written only after its 200 response; dry run: described in
 *     the log, nothing posted nor written.
 * @param {Object} contexte
 * @param {Object} bilan
 * @param {Array<Object>} elements
 */
function amorcer_(contexte, bilan, elements) {
  bilan.amorcage = true;
  const charge = construireMessageAmorcage_(elements.length, contexte.filtre.codes, contexte.langue);
  if (contexte.simulation) {
    console.log(tBilingue_('journalSimulationAmorcage', elements.length));
    console.log(tBilingue_('journalSimulationJson', JSON.stringify(charge)));
    if (contexte.webhook.etat !== 'valide') console.log(tBilingue_('infoWebhookNonConfigureSimulation'));
    return;
  }
  if (!verifierWebhookReel_(contexte, bilan)) return;
  const reponse = posterWebhook_(contexte.webhook.url, charge);
  const issue = classerReponseWebhook_(reponse.code);
  if (issue === 'ok') {
    memoriser_(contexte, clesDuPlusRecent_(elements));
    contexte.etatExecution.dernierNouvelElement = contexte.instant.toISOString();
    bilan.constats.webhookRefuse = { actif: false };
    console.log(tBilingue_('journalAmorcage', contexte.memoire.length));
    return;
  }
  console.warn(tBilingue_('journalAmorcageRefuse', reponse.code));
  noterEchecWebhook_(bilan, issue, reponse, { cle: t_('referenceAmorcage', contexte.langue), categorie: CONFIG.CODE_AUTRE, taille: octetsUtf8_(JSON.stringify(charge)) });
}

/**
 * FR : Mode réel : vérifie WEBHOOK_URL (RM-16) ; absente ou mal formée → aucune publication, alerte « non configuré ».
 * EN: Live mode: checks WEBHOOK_URL (RM-16); missing or malformed → nothing posted, "not configured" alert.
 * @param {Object} contexte
 * @param {Object} bilan
 * @return {boolean} FR : vrai si le webhook est utilisable. EN: true when the webhook is usable.
 */
function verifierWebhookReel_(contexte, bilan) {
  if (contexte.webhook.etat === 'valide') {
    bilan.constats.webhookAbsent = { actif: false };
    return true;
  }
  console.error(tBilingue_('erreurWebhookNonConfigure'));
  bilan.constats.webhookAbsent = { actif: true };
  bilan.resultat = 'webhook_absent';
  return false;
}

/**
 * FR : Note un POST non accepté (RM-16) : 400 → élément écarté et compté refusé ; 401/403/404 → arrêt et alerte
 *      « webhook refusé » ; autre code (429, 5xx persistants, réseau) → échec, retenté à l'exécution suivante.
 * EN: Records a non-accepted POST (RM-16): 400 → item discarded and counted rejected; 401/403/404 → stop and "webhook
 *     rejected" alert; other code (persistent 429, 5xx, network) → failure, retried at the next run.
 * @param {Object} bilan
 * @param {string} issue
 * @param {Object} reponse
 * @param {{cle: string, categorie: string, taille: number}} refus
 */
function noterEchecWebhook_(bilan, issue, reponse, refus) {
  if (issue === 'refuse400') {
    console.warn(tBilingue_('erreurPublicationRefusee'));
    bilan.refuses++;
    bilan.refus.push(refus);
    bilan.constats.webhookRefuse = { actif: false };
    return;
  }
  bilan.echecs++;
  if (issue === 'refuse') {
    console.error(tBilingue_('erreurWebhookRefuse', reponse.code));
    bilan.constats.webhookRefuse = { actif: true, code: reponse.code };
    bilan.resultat = 'webhook_refuse';
    return;
  }
  console.warn(tBilingue_('erreurWebhookTransitoire', reponse.code));
}
