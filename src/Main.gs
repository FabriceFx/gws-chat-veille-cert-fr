/**
 * FR : Points d'entrée publics, lancés depuis l'éditeur Apps Script ou par le déclencheur horaire (script autonome :
 *      ni menu ni boîte de dialogue, design §9). Chaque fonction écrit au journal ; les erreurs imprévues sont
 *      journalisées (masquées) puis relancées pour apparaître dans l'éditeur et les notifications d'échec.
 * EN: Public entry points, run from the Apps Script editor or by the hourly trigger (standalone script: no menu nor
 *     dialog, design §9). Each function writes to the log; unexpected errors are logged (masked) then rethrown so they
 *     show in the editor and failure notifications.
 */

/**
 * FR : Affiche les informations sur l'outil et son auteur (Fabrice Faucheux, https://faucheux.bzh).
 * EN: Displays information about the tool and its author (Fabrice Faucheux, https://faucheux.bzh).
 * @return {string}
 */
function aPropos() {
  const texte = `${CONFIG.NOM_PROJET} — Veille CERT-FR dans Google Chat\nDéveloppé par Fabrice Faucheux (https://faucheux.bzh)`;
  console.log(texte);
  return texte;
}

/**
 * FR : Relève du flux CERT-FR et publication des nouveautés dans l'espace Chat (déclencheur horaire ou lancement manuel,
 *      RM-1 à RM-21).
 * EN: Polls the CERT-FR feed and posts new items to the Chat space (hourly trigger or manual run, RM-1 to RM-21).
 * @param {Object} [evenement] FR : événement du déclencheur (triggerUid). EN: trigger event (triggerUid).
 * @return {Object} FR : bilan de l'exécution. EN: run report.
 */
function relever(evenement) {
  const mode = evenement?.triggerUid ? 'declencheur' : 'manuel';
  return avecJournalErreur_(() => executerReleve_(mode));
}

/**
 * FR : Installe le déclencheur horaire sur relever() après avoir supprimé tout déclencheur existant (RM-23).
 * EN: Installs the hourly trigger on relever() after removing any existing one (RM-23).
 */
function installerDeclencheur() {
  avecJournalErreur_(() => {
    supprimerDeclencheurs_(CONFIG.FONCTION_DECLENCHEUR);
    creerDeclencheurHoraire_();
    console.log(tBilingue_('journalDeclencheurInstalle'));
  });
}

/**
 * FR : Supprime le ou les déclencheurs de relever() (RM-23).
 * EN: Removes the relever() trigger(s) (RM-23).
 * @return {number} FR : nombre supprimé. EN: number removed.
 */
function supprimerDeclencheur() {
  return avecJournalErreur_(() => {
    const nombre = supprimerDeclencheurs_(CONFIG.FONCTION_DECLENCHEUR);
    console.log(tBilingue_('journalDeclencheurSupprime', nombre));
    return nombre;
  });
}

/**
 * FR : Poste un unique message « Test » dans l'espace pour valider le webhook, y compris en simulation ; ne touche pas
 *      à la mémoire (RM-19). Lève une erreur si le webhook est absent, mal formé ou refuse le message.
 * EN: Posts a single "Test" message to the space to validate the webhook, dry run included; does not touch the memory
 *     (RM-19). Throws when the webhook is missing, malformed or rejects the message.
 * @return {number} FR : code HTTP (200). EN: HTTP code (200).
 */
function envoyerMessageTest() {
  return avecJournalErreur_(() => {
    const verrou = sousVerrou_(envoyerTest_);
    if (!verrou.obtenu) throw new Error(tBilingue_('erreurVerrou'));
    return verrou.valeur;
  });
}

/**
 * FR : Efface la mémoire ELEMENTS_VUS (nouvel amorçage au prochain lancement) seulement si la propriété
 *      CONFIRMER_REINITIALISATION vaut « oui » (espaces et casse ignorés), puis la remet à vide (RM-25). Ne poste rien.
 * EN: Clears the ELEMENTS_VUS memory (new bootstrap at the next run) only when the CONFIRMER_REINITIALISATION property
 *     is "oui" (spaces and case ignored), then empties it (RM-25). Posts nothing.
 * @return {boolean} FR : vrai si la mémoire a été effacée. EN: true when the memory was cleared.
 */
function reinitialiserMemoire() {
  return avecJournalErreur_(() => {
    const verrou = sousVerrou_(reinitialiserSousVerrou_);
    if (verrou.obtenu) return verrou.valeur;
    console.warn(tBilingue_('erreurVerrou'));
    return false;
  });
}

/**
 * FR : Exécute un point d'entrée ; une erreur imprévue est journalisée (masquée, pile réduite) puis relancée.
 * EN: Runs an entry point; an unexpected error is logged (masked, reduced stack) then rethrown.
 * @param {Function} fonction
 * @return {*}
 */
function avecJournalErreur_(fonction) {
  try {
    return fonction();
  } catch (erreur) {
    console.error(tBilingue_('journalErreurInattendue', resumePile_(erreur)));
    throw erreur;
  }
}

/**
 * FR : Envoi du message de test (sous verrou).
 * EN: Test message sending (under lock).
 * @return {number}
 */
function envoyerTest_() {
  const proprietes = lireProprietes_();
  const webhook = lireWebhook_(proprietes);
  if (webhook.etat !== 'valide') {
    console.error(tBilingue_('erreurWebhookNonConfigure'));
    throw new Error(tBilingue_('erreurWebhookNonConfigure'));
  }
  const langue = langueEffective_(proprietes[CONFIG.CLES_PROPRIETES.LANGUE]).langue;
  const charge = construireMessageTest_(lireModeSimulation_(proprietes).simulation, maintenant_(), langue);
  const reponse = posterWebhook_(webhook.url, charge);
  if (reponse.code !== 200) {
    const message = tBilingue_('journalTestRefuse', reponse.code, reponse.reseau || masquerTexte_(reponse.texte).slice(0, 160));
    console.error(message);
    throw new Error(message);
  }
  console.log(tBilingue_('journalTest', reponse.code));
  return reponse.code;
}

/**
 * FR : Réinitialisation (sous verrou) avec garde-fou CONFIRMER_REINITIALISATION (RM-25).
 * EN: Reset (under lock) with the CONFIRMER_REINITIALISATION safeguard (RM-25).
 * @return {boolean}
 */
function reinitialiserSousVerrou_() {
  const confirmation = lireProprietes_()[CONFIG.CLES_PROPRIETES.CONFIRMER_REINITIALISATION];
  if (String(confirmation ?? '').trim().toLowerCase() !== 'oui') {
    console.warn(tBilingue_('journalReinitialisationRefusee'));
    return false;
  }
  supprimerPropriete_('ELEMENTS_VUS');
  ecrirePropriete_('CONFIRMER_REINITIALISATION', '');
  console.log(tBilingue_('journalMemoireEffacee'));
  return true;
}
