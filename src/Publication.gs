/**
 * FR : Publication des nouveaux éléments (RM-5 à RM-16), simulation (RM-18), silence du flux (RM-17) et fin de relève :
 *      alertes, état DERNIERE_EXECUTION, ligne de synthèse (RM-21).
 * EN: Posting of new items (RM-5 to RM-16), dry run (RM-18), feed silence (RM-17) and end of run: alerts,
 *     DERNIERE_EXECUTION state, summary line (RM-21).
 */

/**
 * FR : Traite les éléments absents de la mémoire : écartés (catégorie, ancienneté) mémorisés sans publication, candidats
 *      publiés du plus ancien au plus récent dans la limite du plafond, reportés à l'exécution suivante.
 * EN: Handles items missing from memory: discarded ones (category, age) stored without posting, candidates posted
 *     oldest first within the cap, deferred ones left for the next run.
 * @param {Object} contexte
 * @param {Object} bilan
 * @param {Array<Object>} elements
 */
function publierNouveaux_(contexte, bilan, elements) {
  const repartition = repartirNouveaux_(elements, contexte.memoire, contexte.filtre, contexte.reglages, contexte.instant);
  bilan.nouveaux = repartition.nouveaux.length;
  bilan.ecartesCategorie = repartition.ecartesCategorie.length;
  bilan.ecartesAnciennete = repartition.ecartesAnciennete.length;
  bilan.reportes = repartition.reportes.length;
  if (contexte.simulation) {
    simulerPublications_(contexte, repartition.aPublier);
    if (contexte.webhook.etat !== 'valide') console.log(tBilingue_('infoWebhookNonConfigureSimulation'));
    return;
  }
  evaluerSilence_(contexte, bilan, repartition.nouveaux.length);
  const ecartes = [...repartition.ecartesCategorie, ...repartition.ecartesAnciennete];
  if (ecartes.length) memoriser_(contexte, clesDuPlusRecent_(ecartes));
  if (!verifierWebhookReel_(contexte, bilan)) {
    bilan.reportes += repartition.aPublier.length;
    return;
  }
  publierListe_(contexte, bilan, repartition.aPublier);
}

/**
 * FR : Flux muet (RM-17, D-9), mode réel : nouvel élément → situation normale ; sinon, au-delà de SEUIL_SILENCE_JOURS
 *      depuis le dernier nouvel élément, constat actif (un seul e-mail par épisode, géré par planifierAlertes_).
 * EN: Silent feed (RM-17, D-9), live mode: new item → normal; otherwise, beyond SEUIL_SILENCE_JOURS since the last new
 *     item, active finding (one e-mail per episode, handled by planifierAlertes_).
 * @param {Object} contexte
 * @param {Object} bilan
 * @param {number} nombreNouveaux
 */
function evaluerSilence_(contexte, bilan, nombreNouveaux) {
  const etat = contexte.etatExecution;
  const instantIso = contexte.instant.toISOString();
  if (nombreNouveaux > 0) {
    etat.dernierNouvelElement = instantIso;
    bilan.constats.fluxMuet = { actif: false };
    return;
  }
  const dernier = dateDepuisIso_(etat.dernierNouvelElement);
  if (!dernier) {
    etat.dernierNouvelElement = instantIso;
    return;
  }
  const ecouleMs = contexte.instant.getTime() - dernier.getTime();
  if (ecouleMs > contexte.reglages.SEUIL_SILENCE_JOURS * 24 * 3600 * 1000) {
    bilan.constats.fluxMuet = { actif: true, jours: Math.floor(ecouleMs / (24 * 3600 * 1000)), depuis: etat.dernierNouvelElement };
  }
}

/**
 * FR : Simulation (RM-18) : une ligne par message qui serait posté (clé, catégorie, taille, titre), puis le JSON du
 *      premier. Aucun POST, aucune écriture.
 * EN: Dry run (RM-18): one line per message that would be posted (key, category, size, title), then the first one's
 *     JSON. No POST, no write.
 * @param {Object} contexte
 * @param {Array<Object>} liste
 */
function simulerPublications_(contexte, liste) {
  liste.forEach((element, rang) => {
    const json = JSON.stringify(construireCartePublication_(element, contexte.langue));
    const titre = tronquer_(element.titre, CONFIG.TITRE_JOURNAL_MAX);
    console.log(tBilingue_('journalSimulationMessage', element.cle, element.categorie, octetsUtf8_(json), titre));
    if (rang === 0) console.log(tBilingue_('journalSimulationJson', json));
  });
}

/**
 * FR : Publie les candidats un par un (RM-9, RM-12, RM-16) : pause de 1,1 s entre deux messages, garde de temps,
 *      mémoire enregistrée après chaque 200 (et après un 400, élément écarté) ; arrêt sur 401/403/404 ou échec
 *      transitoire persistant (les suivants restent candidats).
 * EN: Posts candidates one by one (RM-9, RM-12, RM-16): 1.1 s pause between messages, time guard, memory saved after
 *     each 200 (and after a 400, item discarded); stops on 401/403/404 or persistent transient failure (the next ones
 *     stay candidates).
 * @param {Object} contexte
 * @param {Object} bilan
 * @param {Array<Object>} liste
 */
function publierListe_(contexte, bilan, liste) {
  for (const [rang, element] of liste.entries()) {
    if (gardeTemps_(contexte.debutMs, margePublicationMs_())) {
      console.warn(tBilingue_('avertGardeTemps'));
      bilan.gardeTemps = true;
      bilan.reportes += liste.length - rang;
      return;
    }
    if (rang > 0) Utilities.sleep(CONFIG.PAUSE_ENTRE_MESSAGES_MS);
    const charge = construireCartePublication_(element, contexte.langue);
    const taille = octetsUtf8_(JSON.stringify(charge));
    const reponse = posterWebhook_(contexte.webhook.url, charge);
    const issue = classerReponseWebhook_(reponse.code);
    if (issue === 'ok' || issue === 'refuse400') {
      memoriser_(contexte, [element.cle]);
      if (issue === 'ok') {
        bilan.publies++;
        bilan.constats.webhookRefuse = { actif: false };
        console.log(tBilingue_('journalPublie', element.cle, element.categorie));
      } else {
        console.warn(tBilingue_('journalPublicationRefusee', element.cle, taille));
        noterEchecWebhook_(bilan, issue, reponse, { cle: element.cle, categorie: element.categorie, taille });
      }
      continue;
    }
    console.warn(tBilingue_('journalEchecPublication', element.cle, reponse.code));
    noterEchecWebhook_(bilan, issue, reponse, null);
    bilan.reportes += liste.length - rang - 1;
    return;
  }
}

/**
 * FR : Fin de relève : alertes planifiées et envoyées (mode réel) ou décrites (simulation), états enregistrés,
 *      résultat déterminé, ligne de synthèse (RM-17, RM-21).
 * EN: End of run: alerts planned and sent (live) or described (dry run), states saved, result determined, summary line.
 * @param {Object} contexte
 * @param {Object} bilan
 */
function terminerReleve_(contexte, bilan) {
  const constats = { ...bilan.constats, refus: bilan.refus };
  const envois = planifierAlertes_(contexte.etatAlertes, constats, contexte.instant);
  const alertes = envoyerAlertes_(envois, contexte.etatAlertes, {
    instant: contexte.instant, langue: contexte.langue, simulation: contexte.simulation, reglages: contexte.reglages,
    urlFlux: contexte.urlFlux, compte: contexte.compte, destinataire: contexte.destinataire,
    derniereLectureReussie: contexte.etatExecution.derniereLectureReussie,
  });
  if (!contexte.simulation && alertes.envoyes.length) ecrirePropriete_('ALERTES_ENVOYEES', JSON.stringify(alertes.etat));
  if (alertes.envoyes.length) bilan.alertes = alertes.envoyes.join('+');
  else if (alertes.simulees.length) bilan.alertes = `simulees:${alertes.simulees.join('+')}`;
  bilan.resultat = determinerResultat_(bilan, contexte.simulation);
  const etat = contexte.etatExecution;
  Object.assign(etat, { date: contexte.instant.toISOString(), resultat: bilan.resultat, mode: contexte.mode, dryRun: contexte.simulation, publies: bilan.publies });
  ecrirePropriete_('DERNIERE_EXECUTION', JSON.stringify(etat));
  console.log(ligneSynthese_(bilan, contexte));
}

/**
 * FR : Résultat de l'exécution (design §7) : résultat bloquant déjà posé, sinon garde_temps, simulation, amorcage,
 *      partiel (échec, refus 400 ou report), ok.
 * EN: Run result (design §7): blocking result already set, otherwise garde_temps, simulation, amorcage, partiel
 *     (failure, 400 rejection or deferral), ok.
 * @param {Object} bilan
 * @param {boolean} simulation
 * @return {string}
 */
function determinerResultat_(bilan, simulation) {
  if (bilan.resultat) return bilan.resultat;
  if (bilan.gardeTemps) return 'garde_temps';
  if (simulation) return 'simulation';
  if (bilan.echecs || bilan.refuses || bilan.reportes) return 'partiel';
  return bilan.amorcage ? 'amorcage' : 'ok';
}

/**
 * FR : Ligne de synthèse (RM-21, design §7) : préfixe bilingue et jetons « clé=valeur » neutres.
 * EN: Summary line (RM-21, design §7): bilingual prefix and neutral "key=value" tokens.
 * @param {Object} bilan
 * @param {Object} contexte
 * @return {string}
 */
function ligneSynthese_(bilan, contexte) {
  const jetons = {
    resultat: bilan.resultat, mode: contexte.mode, dryRun: contexte.simulation, duree: `${secondesEcoulees_(contexte.debutMs)}s`,
    lus: bilan.lus, ignores: bilan.ignores, nouveaux: bilan.nouveaux, ecartes_categorie: bilan.ecartesCategorie,
    ecartes_anciennete: bilan.ecartesAnciennete, publies: bilan.publies, echecs: bilan.echecs, refuses: bilan.refuses,
    reportes: bilan.reportes, alertes: bilan.alertes,
  };
  const corps = Object.entries(jetons).map(([cle, valeur]) => `${cle}=${valeur}`).join(' | ');
  return `${CONFIG.PREFIXE_JOURNAL} ${tBilingue_('journalFinExecution')} | ${corps}`;
}
