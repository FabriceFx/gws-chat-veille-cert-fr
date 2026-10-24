/**
 * FR : Sections du diagnostic (RM-24, design §8), lecture seule : réglages et propriétés, flux réel (structure, champs,
 *      catégories, domaines, exemple d'élément), exploitation (mémoire, déclencheur, dernière exécution, alertes,
 *      scopes). Aucun POST, aucune écriture ; WEBHOOK_URL et adresses masquées. Chaque ligne commence par un mot-état.
 * EN: Diagnostic sections (RM-24, design §8), read-only: settings and properties, real feed (structure, fields,
 *     categories, domains, item example), operations (memory, trigger, last run, alerts, scopes). No POST, no write;
 *     WEBHOOK_URL and addresses masked. Every line starts with a status word.
 */

/**
 * FR : Ligne de diagnostic : mot-état bilingue (OK, ATTENTION, ERREUR, INFO) puis texte.
 * EN: Diagnostic line: bilingual status word (OK, WARNING, ERROR, INFO) then text.
 * @param {string} statut FR : ok, attention, erreur, info. EN: same.
 * @param {string} texte
 * @return {string}
 */
function ligneDiag_(statut, texte) {
  const cles = { ok: 'diagStatutOk', attention: 'diagStatutAttention', erreur: 'diagStatutErreur', info: 'diagStatutInfo' };
  return `${tBilingue_(cles[statut]).padEnd(20)} ${texte}`;
}

/**
 * FR : Texte bilingue dont les paramètres dépendent de la langue (libellés traduits en paramètre).
 * EN: Bilingual text whose parameters depend on the language (translated labels as parameters).
 * @param {string} cle
 * @param {function(string): Array<*>} parametres
 * @return {string}
 */
function bilingueParLangue_(cle, parametres) {
  const [francais, anglais] = ['fr', 'en'].map((langue) => t_(cle, langue, ...parametres(langue)));
  return francais === anglais ? francais : `${francais} / ${anglais}`;
}

/**
 * FR : Adresse masquée pour le journal (« p***@domaine »).
 * EN: Masked address for the log ("p***@domain").
 * @param {string} adresse
 * @return {string}
 */
function masquerAdresse_(adresse) {
  const [local, domaine] = String(adresse ?? '').split('@');
  return domaine ? `${local.slice(0, 1)}***@${domaine}` : '***';
}

/**
 * FR : Comptes « valeur×n » triés par nombre décroissant.
 * EN: "value×n" counts sorted by decreasing number.
 * @param {string[]} valeurs
 * @return {string}
 */
function compter_(valeurs) {
  const comptes = new Map();
  valeurs.forEach((valeur) => comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1));
  return [...comptes.entries()].sort((premier, second) => second[1] - premier[1]).map(([valeur, nombre]) => `${valeur}×${nombre}`).join(', ');
}

/**
 * FR : Exécute une section du diagnostic ; une erreur devient une ligne ATTENTION sans interrompre le reste.
 * EN: Runs a diagnostic section; an error becomes a WARNING line without stopping the rest.
 * @param {function(): string[]} section
 * @return {string[]}
 */
function sectionDiag_(section) {
  try {
    return section();
  } catch (erreur) {
    return [ligneDiag_('attention', tBilingue_('diagExceptionSection', resumeErreur_(erreur)))];
  }
}

/**
 * FR : Réglages et propriétés saisies (RM-16, RM-18, RM-22, RM-25, RM-26) ; WEBHOOK_URL et adresse masquées.
 * EN: Settings and entered properties; WEBHOOK_URL and address masked.
 * @param {Object<string, string>} proprietes
 * @return {string[]}
 */
function diagnostiquerReglages_(proprietes) {
  const source = (code) => (langue) => [t_(code === 'config' ? 'diagSourceConfig' : 'diagSourcePropriete', langue)];
  const mode = lireModeSimulation_(proprietes);
  const lignes = [ligneDiag_('info', bilingueParLangue_('diagMode', (langue) => [`${mode.simulation} (${t_(mode.simulation ? 'diagModeSimulation' : 'diagModeReel', langue)}, ${source(mode.source)(langue)[0]})`]))];
  const urlFlux = lireUrlFlux_(proprietes);
  if (urlFlux.invalide) lignes.push(ligneDiag_('attention', tBilingue_('journalUrlFluxInvalide')));
  lignes.push(ligneDiag_('info', bilingueParLangue_('diagUrlFlux', (langue) => [urlFlux.url, ...source(urlFlux.source)(langue)])));
  const webhook = lireWebhook_(proprietes);
  if (webhook.etat === 'valide') lignes.push(ligneDiag_('ok', tBilingue_('diagWebhookOk', masquerUrl_(webhook.url))));
  else lignes.push(ligneDiag_(mode.simulation ? 'attention' : 'erreur', tBilingue_(webhook.etat === 'absente' ? 'diagWebhookAbsent' : 'diagWebhookInvalide')));
  const filtre = lireFiltreCategories_(proprietes);
  lignes.push(ligneDiag_('info', bilingueParLangue_('diagCategoriesFiltre', (langue) => [filtre.codes ? filtre.codes.join(', ') : t_('diagToutes', langue)])));
  if (filtre.inconnus.length) lignes.push(ligneDiag_('attention', tBilingue_('diagCategoriesInconnues', filtre.inconnus.join(', ').slice(0, 100))));
  for (const detail of lireReglages_(proprietes).details) {
    if (detail.invalide) lignes.push(ligneDiag_('attention', tBilingue_('diagReglageInvalide', detail.nom, detail.valeur)));
    else if (detail.plafonne) lignes.push(ligneDiag_('attention', tBilingue_('diagReglagePlafonne', detail.nom, detail.valeur)));
    else lignes.push(ligneDiag_('info', bilingueParLangue_('diagReglage', (langue) => [detail.nom, detail.valeur, ...source(detail.source)(langue)])));
  }
  const brutLangue = proprietes[CONFIG.CLES_PROPRIETES.LANGUE];
  const langue = langueEffective_(brutLangue);
  if (langue.inconnue) lignes.push(ligneDiag_('attention', tBilingue_('diagLangueInconnue')));
  else lignes.push(ligneDiag_('info', bilingueParLangue_('diagLangue', (code) => [langue.langue, ...source(String(brutLangue ?? '').trim() ? 'propriete' : 'config')(code)])));
  return [...lignes, ...diagnostiquerAdresseEtConfirmation_(proprietes)];
}

/**
 * FR : Adresse d'alerte (masquée) et garde-fou de réinitialisation (RM-17, RM-25).
 * EN: Alert address (masked) and reset safeguard (RM-17, RM-25).
 * @param {Object<string, string>} proprietes
 * @return {string[]}
 */
function diagnostiquerAdresseEtConfirmation_(proprietes) {
  const lignes = [];
  const adresse = lireAdresseAlerte_(proprietes, adresseExecutant_());
  if (adresse.invalide) lignes.push(ligneDiag_('attention', tBilingue_('diagAdresseInvalide')));
  if (adresse.source === 'propriete') lignes.push(ligneDiag_('ok', tBilingue_('diagAdresseAlerte', masquerAdresse_(adresse.adresse))));
  else if (adresse.adresse) lignes.push(ligneDiag_('attention', tBilingue_('diagAdresseProprietaire', masquerAdresse_(adresse.adresse))));
  else lignes.push(ligneDiag_('erreur', tBilingue_('diagAdresseAucune')));
  const confirmation = String(proprietes[CONFIG.CLES_PROPRIETES.CONFIRMER_REINITIALISATION] ?? '').trim();
  if (confirmation) {
    const active = confirmation.toLowerCase() === 'oui';
    lignes.push(ligneDiag_('attention', bilingueParLangue_('diagConfirmation', (langue) => [confirmation.slice(0, 20), t_(active ? 'diagConfirmationActive' : 'diagConfirmationInactive', langue)])));
  }
  return lignes;
}

/**
 * FR : Lecture réelle du flux (RM-24, CA-19) : code HTTP, URL finale, redirections, structure et champs présents,
 *      catégories et leur origine, domaines des liens, plus récent, références et dates non reconnues, exemple.
 * EN: Real feed read (RM-24, CA-19): HTTP code, final URL, redirects, structure and fields present, categories and their
 *     origin, link domains, latest, unrecognised references and dates, example.
 * @param {Object<string, string>} proprietes
 * @param {Date} instant
 * @return {string[]}
 */
function diagnostiquerFlux_(proprietes, instant) {
  const lecture = lireEtAnalyserFlux_(lireUrlFlux_(proprietes).url, instant);
  const { reponse } = lecture;
  const lignes = [];
  if (reponse.redirections.length) lignes.push(ligneDiag_('info', tBilingue_('diagRedirections', reponse.redirections.join(' → '))));
  if (reponse.code !== 200) {
    const reseau = reponse.reseau ? ` — ${reponse.reseau}` : '';
    return [...lignes, ligneDiag_('erreur', `${tBilingue_('diagFluxErreur', { cle: 'erreurFluxHttp', parametres: [reponse.code, reponse.essais] })}${reseau}`)];
  }
  lignes.push(ligneDiag_('ok', bilingueParLangue_('diagFlux', (langue) => [reponse.code, reponse.urlFinale, t_(reponse.redirections.length ? 'diagRedirection' : 'diagSansRedirection', langue)])));
  if (!lecture.xml) {
    lignes.push(ligneDiag_('erreur', tBilingue_('diagFluxErreur', { cle: lecture.cle, parametres: lecture.parametres })));
    return [...lignes, ligneDiag_('info', tBilingue_('diagDebutReponse', String(reponse.texte ?? '').replace(/\s+/g, ' ').slice(0, 300)))];
  }
  const { items } = lecture.xml;
  const presence = ['titre', 'lien', 'guid', 'dateTexte', 'description', 'etiquettes']
    .map((champ) => `${champ} ${items.filter((item) => (Array.isArray(item[champ]) ? item[champ].length : item[champ])).length}/${items.length}`);
  lignes.push(ligneDiag_('info', tBilingue_('diagStructure', lecture.xml.racine, lecture.xml.version || '?', items.length, presence.join(', '))));
  const { analyse } = lecture;
  lignes.push(ligneDiag_(analyse.ignores ? 'attention' : 'ok', tBilingue_('diagElements', analyse.elements.length, analyse.ignores)));
  if (!lecture.ok) return [...lignes, ligneDiag_('erreur', tBilingue_('diagFluxErreur', { cle: lecture.cle, parametres: lecture.parametres }))];
  return [...lignes, ...diagnostiquerElements_(analyse, items[0])];
}

/**
 * FR : Détail des éléments analysés (catégories, origines, domaines, plus récent, anomalies, exemple brut).
 * EN: Analysed items detail (categories, origins, domains, latest, anomalies, raw example).
 * @param {Object} analyse
 * @param {Object} premierBrut
 * @return {string[]}
 */
function diagnostiquerElements_(analyse, premierBrut) {
  const { elements } = analyse;
  const lignes = [
    ligneDiag_('ok', tBilingue_('diagCategories', compter_(elements.map((element) => element.categorie)))),
    ligneDiag_('info', tBilingue_('diagSourcesCategorie', compter_(elements.map((element) => element.sourceCategorie)))),
    ligneDiag_('info', tBilingue_('diagDomaines', compter_(elements.map((element) => hoteUrl_(element.lien))))),
  ];
  const plusRecent = elements.filter((element) => element.dateLisible).sort((premier, second) => second.date - premier.date)[0];
  if (plusRecent) lignes.push(ligneDiag_('ok', tBilingue_('diagPlusRecent', formaterInstant_(plusRecent.date))));
  if (analyse.categoriesInconnues.length) {
    const codes = [...new Set(analyse.categoriesInconnues.map((inconnue) => inconnue.code))].join(', ');
    lignes.push(ligneDiag_('attention', `${tBilingue_('diagReferencesInconnues', analyse.categoriesInconnues.length)} — ${codes}`));
  }
  const sansReference = elements.filter((element) => !element.reference).length;
  if (sansReference) lignes.push(ligneDiag_('attention', tBilingue_('diagSansReference', sansReference)));
  if (analyse.datesIllisibles.length) lignes.push(ligneDiag_('attention', tBilingue_('diagDatesIllisibles', analyse.datesIllisibles.length)));
  const exemple = premierBrut ? {
    titre: tronquer_(premierBrut.titre, 120), lien: premierBrut.lien, guid: premierBrut.guid, dateTexte: premierBrut.dateTexte,
    etiquettes: premierBrut.etiquettes, longueurDescription: String(premierBrut.description ?? '').length,
  } : {};
  lignes.push(ligneDiag_('info', tBilingue_('diagExemple', JSON.stringify(exemple))));
  return lignes;
}

/**
 * FR : Exploitation : mémoire, déclencheur, dernière exécution, alertes en cours, scopes accordés. Chaque sous-section
 *      est isolée (sectionDiag_) : l'échec de l'une (ex. lecture des déclencheurs) n'empêche pas l'affichage des autres.
 * EN: Operations: memory, trigger, last run, ongoing alerts, granted scopes. Each sub-section is isolated (sectionDiag_):
 *     one failing (e.g. reading triggers) does not prevent the others from being shown.
 * @param {Object<string, string>} proprietes
 * @param {Date} instant
 * @return {string[]}
 */
function diagnostiquerExploitation_(proprietes, instant) {
  return [
    ...sectionDiag_(() => diagnostiquerMemoire_(proprietes)),
    ...sectionDiag_(() => diagnostiquerDeclencheur_()),
    ...sectionDiag_(() => diagnostiquerDerniereExecution_(proprietes)),
    ...sectionDiag_(() => diagnostiquerAlertes_(proprietes, instant)),
    ...sectionDiag_(() => diagnostiquerScopes_()),
  ];
}

/**
 * FR : Mémoire ELEMENTS_VUS : absente (amorçage), illisible ou taille.
 * EN: ELEMENTS_VUS memory: missing (bootstrap), unreadable or size.
 * @param {Object<string, string>} proprietes
 * @return {string[]}
 */
function diagnostiquerMemoire_(proprietes) {
  const brut = proprietes[CONFIG.CLES_PROPRIETES.ELEMENTS_VUS];
  const memoire = lireMemoire_(brut);
  if (!brut) return [ligneDiag_('info', tBilingue_('diagMemoireAbsente'))];
  if (!memoire) return [ligneDiag_('attention', tBilingue_('diagMemoireIllisible'))];
  return [ligneDiag_('info', tBilingue_('diagMemoire', memoire.length, lireReglages_(proprietes).valeurs.MEMOIRE_MAX, (octetsUtf8_(brut) / 1024).toFixed(1)))];
}

/**
 * FR : Déclencheur horaire sur relever() : un seul attendu.
 * EN: Hourly trigger on relever(): exactly one expected.
 * @return {string[]}
 */
function diagnostiquerDeclencheur_() {
  const nombre = declencheursDe_(CONFIG.FONCTION_DECLENCHEUR).length;
  if (nombre === 1) return [ligneDiag_('ok', tBilingue_('diagDeclencheurOk'))];
  return [ligneDiag_('attention', nombre ? tBilingue_('diagDeclencheurDoublon', nombre) : tBilingue_('diagDeclencheurAucun'))];
}

/**
 * FR : État DERNIERE_EXECUTION (date, résultat, dernière lecture réussie).
 * EN: DERNIERE_EXECUTION state (date, result, last successful read).
 * @param {Object<string, string>} proprietes
 * @return {string[]}
 */
function diagnostiquerDerniereExecution_(proprietes) {
  const derniere = lireJson_(proprietes[CONFIG.CLES_PROPRIETES.DERNIERE_EXECUTION], null);
  if (!derniere?.date) return [ligneDiag_('info', tBilingue_('diagAucuneExecution'))];
  return [ligneDiag_('info', bilingueParLangue_('diagDerniereExecution', (langue) => [afficherIso_(derniere.date, '?'), derniere.resultat, afficherIso_(derniere.derniereLectureReussie, t_('diagJamais', langue))]))];
}

/**
 * FR : Alertes en cours (ALERTES_ENVOYEES) ; « publication refusée » n'est listée que pendant 24 h.
 * EN: Ongoing alerts (ALERTES_ENVOYEES); "post rejected" is only listed for 24 h.
 * @param {Object<string, string>} proprietes
 * @param {Date} instant
 * @return {string[]}
 */
function diagnostiquerAlertes_(proprietes, instant) {
  const alertes = lireJson_(proprietes[CONFIG.CLES_PROPRIETES.ALERTES_ENVOYEES], {}) ?? {};
  const enCours = Object.entries(alertes).filter(([type, episode]) => type !== 'publicationRefusee'
    || instant.getTime() - (dateDepuisIso_(episode?.dernierEnvoi)?.getTime() ?? 0) < CONFIG.DELAI_REPETITION_ALERTE_MS);
  if (!enCours.length) return [ligneDiag_('ok', tBilingue_('diagAucuneAlerte'))];
  return [ligneDiag_('attention', tBilingue_('diagAlertesEnCours', enCours.map(([type, episode]) => `${type} (${afficherIso_(episode?.debut, '?')})`).join(', ')))];
}

/**
 * FR : Scopes accordés comparés aux scopes attendus (RM-24).
 * EN: Granted scopes compared with expected scopes (RM-24).
 * @return {string[]}
 */
function diagnostiquerScopes_() {
  const scopes = scopesAccordes_();
  if (!scopes) return [ligneDiag_('attention', tBilingue_('diagScopesIllisibles'))];
  const manquants = CONFIG.SCOPES_ATTENDUS.filter((scope) => !scopes.includes(scope));
  const lignes = [ligneDiag_(manquants.length ? 'attention' : 'ok', tBilingue_('diagScopes', scopes.join(', ')))];
  if (manquants.length) lignes.push(ligneDiag_('erreur', tBilingue_('diagScopesManquants', manquants.join(', '))));
  return lignes;
}
