/**
 * FR : Alertes de fonctionnement par e-mail (RM-16, RM-17, design §6) : planification pure à partir des constats de
 *      l'exécution et de l'état ALERTES_ENVOYEES (une même alerte au plus toutes les 24 h, flux muet une seule fois par
 *      épisode, « rétabli » au retour à la normale), rendu HTML et texte, envoi (jamais en simulation, jamais dans Chat).
 * EN: Operational e-mail alerts (RM-16, RM-17, design §6): pure planning from the run's findings and the
 *     ALERTES_ENVOYEES state (same alert at most every 24 h, silent feed once per episode, "restored" when back to
 *     normal), HTML and text rendering, sending (never in dry run, never to Chat).
 */

/**
 * FR : Types d'alerte avec épisode (rétabli possible) et règle de répétition.
 * EN: Alert types with an episode ("restored" possible) and repeat rule.
 */
const TYPES_ALERTE = Object.freeze({
  fluxEchec: Object.freeze({ repetition: true, mot: 'alerte', cleProbleme: 'mailProblemeFluxEchec' }),
  webhookRefuse: Object.freeze({ repetition: true, mot: 'alerte', cleProbleme: 'mailProblemeWebhookRefuse' }),
  webhookAbsent: Object.freeze({ repetition: true, mot: 'alerte', cleProbleme: 'mailProblemeWebhookAbsent' }),
  fluxMuet: Object.freeze({ repetition: false, mot: 'attention', cleProbleme: 'mailProblemeFluxMuet' }),
});

/**
 * FR : Planifie les e-mails d'une exécution (fonction pure, RM-17). Constat par type : null = non évalué (état
 *      inchangé), { actif: true, … } = problème présent, { actif: false } = situation normale. refus = éléments
 *      écartés sur 400 (RM-16). Renvoie les envois prévus ; l'état n'est modifié qu'après un envoi réussi
 *      (appliquerEnvoi_).
 * EN: Plans a run's e-mails (pure function, RM-17). Finding per type: null = not evaluated (state unchanged),
 *     { actif: true, … } = problem present, { actif: false } = normal. refus = items discarded on 400 (RM-16). Returns
 *     the planned sends; the state only changes after a successful send (appliquerEnvoi_).
 * @param {Object} etat FR : ALERTES_ENVOYEES lu. EN: ALERTES_ENVOYEES read.
 * @param {Object} constats
 * @param {Date} instant
 * @return {Array<{type: string, retabli: boolean, debut: string, donnees: Object}>}
 */
function planifierAlertes_(etat, constats, instant) {
  const envois = [];
  const instantMs = instant.getTime();
  for (const [type, regle] of Object.entries(TYPES_ALERTE)) {
    const constat = constats[type];
    const episode = etat?.[type];
    if (!constat) continue;
    if (!constat.actif) {
      if (episode) envois.push({ type, retabli: true, debut: episode.debut, donnees: {} });
      continue;
    }
    const dernierMs = dateDepuisIso_(episode?.dernierEnvoi)?.getTime();
    const aEnvoyer = !episode || (regle.repetition && (!dernierMs || instantMs - dernierMs >= CONFIG.DELAI_REPETITION_ALERTE_MS));
    if (aEnvoyer) envois.push({ type, retabli: false, debut: episode?.debut || constat.depuis || instant.toISOString(), donnees: constat });
  }
  const refus = constats.refus ?? [];
  const dernierRefusMs = dateDepuisIso_(etat?.publicationRefusee?.dernierEnvoi)?.getTime();
  if (refus.length && (!dernierRefusMs || instantMs - dernierRefusMs >= CONFIG.DELAI_REPETITION_ALERTE_MS)) {
    envois.push({ type: 'publicationRefusee', retabli: false, debut: instant.toISOString(), donnees: { refus } });
  }
  return envois;
}

/**
 * FR : État ALERTES_ENVOYEES après un envoi réussi (fonction pure) : épisode ouvert ou prolongé, effacé au rétabli.
 * EN: ALERTES_ENVOYEES state after a successful send (pure function): episode opened or extended, cleared on restore.
 * @param {Object} etat
 * @param {{type: string, retabli: boolean, debut: string}} envoi
 * @param {Date} instant
 * @return {Object}
 */
function appliquerEnvoi_(etat, envoi, instant) {
  const suivant = { ...(etat ?? {}) };
  if (envoi.retabli) delete suivant[envoi.type];
  else suivant[envoi.type] = { debut: envoi.debut, dernierEnvoi: instant.toISOString() };
  return suivant;
}

/**
 * FR : Nom court d'un envoi pour le journal (« fluxEchec », « retabli:fluxMuet »).
 * EN: Short name of a send for the log ("fluxEchec", "retabli:fluxMuet").
 * @param {{type: string, retabli: boolean}} envoi
 * @return {string}
 */
function nomEnvoi_(envoi) {
  return envoi.retabli ? `retabli:${envoi.type}` : envoi.type;
}

/**
 * FR : Modèle d'un e-mail (fonction pure) : mot du bandeau, titre, constat, faits, actions, détail, pieds, objet.
 * EN: E-mail model (pure function): banner word, title, finding, facts, actions, detail, footers, subject.
 * @param {{type: string, retabli: boolean, debut: string, donnees: Object}} envoi
 * @param {{instant: Date, langue: string, simulation: boolean, derniereLectureReussie: string, reglages: Object, urlFlux: string, compte: string}} contexte
 * @return {Object}
 */
function modeleEmail_(envoi, contexte) {
  const { langue } = contexte;
  const jamais = t_('mailValeurJamais', langue);
  const fait = (cle, valeur) => [t_(cle, langue), String(valeur)];
  const communs = {
    depuis: fait('mailEtiquetteDepuis', afficherIso_(envoi.debut, jamais)),
    lecture: fait('mailEtiquetteDerniereLecture', afficherIso_(contexte.derniereLectureReussie, jamais)),
    execution: fait('mailEtiquetteDerniereExecution', formaterInstant_(contexte.instant)),
    mode: fait('mailEtiquetteMode', t_(contexte.simulation ? 'mailValeurModeSimulation' : 'mailValeurModeReel', langue)),
  };
  const base = { pieds: [t_('mailPied', langue, contexte.compte || t_('mailCompteProprietaire', langue))], actions: [], detail: '' };
  if (envoi.retabli) {
    const probleme = t_(TYPES_ALERTE[envoi.type].cleProbleme, langue);
    return {
      ...base, mot: 'retabli', objet: t_('mailObjetRetabli', langue, probleme), titre: t_('mailTitreRetabli', langue),
      constat: t_('mailCorpsRetabli', langue, probleme, afficherIso_(envoi.debut, jamais)), faits: [communs.execution, communs.mode],
    };
  }
  const constructeurs = { fluxEchec: modeleFluxEchec_, webhookRefuse: modeleWebhookRefuse_, webhookAbsent: modeleWebhookAbsent_, fluxMuet: modeleFluxMuet_, publicationRefusee: modelePublicationRefusee_ };
  return { ...base, ...constructeurs[envoi.type](envoi.donnees, contexte, communs, base) };
}

/**
 * FR : Partie propre au type « flux en échec ».
 * EN: "Feed failing" specific part.
 * @param {Object} donnees
 * @param {Object} contexte
 * @param {Object} communs
 * @return {Object}
 */
function modeleFluxEchec_(donnees, contexte, communs) {
  const { langue } = contexte;
  const detail = t_('mailDetailFlux', langue, donnees.code, donnees.essais, masquerTexte_(contexte.urlFlux));
  return {
    mot: 'alerte',
    objet: t_('mailObjetFluxEchec', langue, donnees.heures),
    titre: t_('mailTitreFluxEchec', langue, donnees.heures),
    constat: t_('mailCorpsFluxEchec', langue, donnees.heures),
    faits: [communs.depuis, communs.lecture, communs.execution, communs.mode, [t_('mailEtiquetteHttp', langue), String(donnees.code)],
      [t_('mailEtiquetteSeuil', langue), t_('mailValeurHeures', langue, contexte.reglages.SEUIL_ECHEC_HEURES)]],
    actions: t_('mailActionsFluxEchec', langue, contexte.urlFlux).split('\n'),
    detail: [detail, donnees.reseau ? masquerTexte_(donnees.reseau) : '', donnees.erreur ? rendreValeur_(donnees.erreur, langue) : '']
      .filter(Boolean).join('\n'),
  };
}

/**
 * FR : Partie propre au type « webhook refusé » (401, 403, 404).
 * EN: "Webhook rejected" specific part (401, 403, 404).
 * @param {Object} donnees
 * @param {Object} contexte
 * @param {Object} communs
 * @return {Object}
 */
function modeleWebhookRefuse_(donnees, contexte, communs) {
  const { langue } = contexte;
  return {
    mot: 'alerte',
    objet: t_('mailObjetWebhookRefuse', langue),
    titre: t_('mailTitreWebhookRefuse', langue),
    constat: t_('mailCorpsWebhookRefuse', langue, donnees.code, contexte.reglages.AGE_MAX_JOURS),
    faits: [communs.depuis, communs.execution, communs.mode, [t_('mailEtiquetteHttp', langue), String(donnees.code)]],
    actions: t_('mailActionsWebhookRefuse', langue).split('\n'),
    detail: t_('mailDetailWebhook', langue, donnees.code, hoteUrl_(CONFIG.PREFIXE_WEBHOOK)),
  };
}

/**
 * FR : Partie propre au type « webhook non configuré ».
 * EN: "Webhook not configured" specific part.
 * @param {Object} donnees
 * @param {Object} contexte
 * @param {Object} communs
 * @return {Object}
 */
function modeleWebhookAbsent_(donnees, contexte, communs) {
  const { langue } = contexte;
  return {
    mot: 'alerte',
    objet: t_('mailObjetWebhookAbsent', langue),
    titre: t_('mailTitreWebhookAbsent', langue),
    constat: t_('mailCorpsWebhookAbsent', langue),
    faits: [communs.depuis, communs.execution, communs.mode],
    actions: t_('mailActionsWebhookAbsent', langue).split('\n'),
  };
}

/**
 * FR : Partie propre au type « flux muet » (un seul e-mail par épisode).
 * EN: "Silent feed" specific part (one e-mail per episode).
 * @param {Object} donnees
 * @param {Object} contexte
 * @param {Object} communs
 * @param {Object} base
 * @return {Object}
 */
function modeleFluxMuet_(donnees, contexte, communs, base) {
  const { langue } = contexte;
  return {
    mot: 'attention',
    objet: t_('mailObjetFluxMuet', langue, donnees.jours),
    titre: t_('mailTitreFluxMuet', langue, donnees.jours),
    constat: t_('mailCorpsFluxMuet', langue, donnees.jours),
    faits: [communs.depuis, communs.lecture, communs.execution, communs.mode,
      [t_('mailEtiquetteSeuil', langue), t_('mailValeurJours', langue, contexte.reglages.SEUIL_SILENCE_JOURS)]],
    actions: t_('mailActionsFluxMuet', langue).split('\n'),
    pieds: [...base.pieds, t_('mailPiedUneFois', langue)],
  };
}

/**
 * FR : Partie propre au type « publication refusée » (400) : détaille le premier élément, liste toutes les clés.
 * EN: "Post rejected" (400) specific part: details the first item, lists every key.
 * @param {Object} donnees
 * @param {Object} contexte
 * @param {Object} communs
 * @param {Object} base
 * @return {Object}
 */
function modelePublicationRefusee_(donnees, contexte, communs, base) {
  const { langue } = contexte;
  const [premier] = donnees.refus;
  return {
    mot: 'attention',
    objet: t_('mailObjetPublicationRefusee', langue, premier.cle),
    titre: t_('mailTitrePublicationRefusee', langue),
    constat: t_('mailCorpsPublicationRefusee', langue, premier.cle),
    faits: [[t_('mailEtiquetteReference', langue), premier.cle],
      [t_('mailEtiquetteCategorie', langue), marqueurCategorie_(premier.categorie, langue).libelle],
      [t_('mailEtiquetteTaille', langue), t_('mailValeurOctets', langue, premier.taille)],
      [t_('mailEtiquetteHttp', langue), '400'], communs.execution, communs.mode],
    actions: t_('mailActionsPublicationRefusee', langue).split('\n'),
    detail: t_('mailDetailRefus', langue, donnees.refus.map((refus) => `${refus.cle} (${refus.taille})`).join(', ')),
    pieds: [...base.pieds, t_('mailPiedUneParJour', langue)],
  };
}

/**
 * FR : Rendu HTML d'un modèle d'e-mail (design §6) : bandeau coloré avec mot écrit, constat, tableau de faits, liste
 *      numérotée, détail en <pre>, pied. Toutes les valeurs sont échappées ; aucune image.
 * EN: HTML rendering of an e-mail model (design §6): coloured banner with written word, finding, facts table, numbered
 *     list, <pre> detail, footer. Every value is escaped; no image.
 * @param {Object} modele
 * @param {string} langue
 * @return {string}
 */
function rendreEmailHtml_(modele, langue) {
  const couleur = CONFIG.COULEURS_MAIL[modele.mot];
  const mot = t_({ alerte: 'mailMotAlerte', attention: 'mailMotAttention', retabli: 'mailMotRetabli' }[modele.mot], langue);
  const police = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124';
  const faits = modele.faits.map(([etiquette, valeur]) => `<tr><td style="padding:4px 12px 4px 0;color:#5f6368;vertical-align:top">${echapperHtml_(etiquette)}</td><td style="padding:4px 0">${echapperHtml_(valeur)}</td></tr>`).join('');
  const actions = modele.actions.length
    ? `<h3 style="font-size:15px;margin:20px 0 8px">${echapperHtml_(t_('mailTitreActions', langue))}</h3><ol style="margin:0;padding-left:20px">${modele.actions.map((action) => `<li>${echapperHtml_(action)}</li>`).join('')}</ol>`
    : '';
  const detail = modele.detail
    ? `<h3 style="font-size:15px;margin:20px 0 8px">${echapperHtml_(t_('mailTitreDetail', langue))}</h3><pre style="font-family:monospace;font-size:13px;background:#f1f3f4;padding:8px;white-space:pre-wrap;margin:0">${echapperHtml_(modele.detail)}</pre>`
    : '';
  return `<div style="${police};max-width:640px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${couleur};color:#ffffff"><tr><td style="padding:12px 16px">`
    + `<div style="font-size:13px">${echapperHtml_(t_('mailSurtitre', langue))}</div>`
    + `<div style="font-size:18px;font-weight:bold">[${echapperHtml_(mot)}] ${echapperHtml_(modele.titre)}</div></td></tr></table>`
    + `<p style="margin:16px 0">${echapperHtml_(modele.constat)}</p>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="${police}">${faits}</table>`
    + `${actions}${detail}`
    + `<p style="margin:24px 0 0;font-size:12px;color:#5f6368">${modele.pieds.map(echapperHtml_).join('<br>')}</p></div>`;
}

/**
 * FR : Rendu texte brut d'un modèle d'e-mail (même contenu que le HTML).
 * EN: Plain-text rendering of an e-mail model (same content as the HTML).
 * @param {Object} modele
 * @param {string} langue
 * @return {string}
 */
function rendreEmailTexte_(modele, langue) {
  const mot = t_({ alerte: 'mailMotAlerte', attention: 'mailMotAttention', retabli: 'mailMotRetabli' }[modele.mot], langue);
  const largeur = Math.max(...modele.faits.map(([etiquette]) => etiquette.length)) + 2;
  const lignes = [`[${mot}] ${t_('mailSurtitre', langue)}`, modele.titre, '', modele.constat, '',
    ...modele.faits.map(([etiquette, valeur]) => `${etiquette.padEnd(largeur)}${valeur}`)];
  if (modele.actions.length) lignes.push('', t_('mailTitreActions', langue), ...modele.actions.map((action, rang) => `${rang + 1}. ${action}`));
  if (modele.detail) lignes.push('', t_('mailTitreDetail', langue), modele.detail);
  lignes.push('', ...modele.pieds);
  return lignes.join('\n');
}

/**
 * FR : Envoie les alertes planifiées (RM-17) et renvoie le nouvel état et les noms envoyés. Simulation : rien n'est
 *      envoyé ni mémorisé, chaque alerte est décrite au journal. Un envoi en échec (ou sans destinataire) ne modifie pas
 *      l'état : il sera retenté à l'exécution suivante.
 * EN: Sends the planned alerts (RM-17) and returns the new state and the sent names. Dry run: nothing is sent nor
 *     stored, each alert is described in the log. A failed send (or with no recipient) leaves the state unchanged: it
 *     will be retried at the next run.
 * @param {Array<Object>} envois
 * @param {Object} etat
 * @param {Object} contexte FR : voir modeleEmail_, plus destinataire. EN: see modeleEmail_, plus destinataire.
 * @return {{etat: Object, envoyes: string[], simulees: string[]}}
 */
function envoyerAlertes_(envois, etat, contexte) {
  let suivant = etat;
  const envoyes = [];
  const simulees = [];
  for (const envoi of envois) {
    const nom = nomEnvoi_(envoi);
    const modele = modeleEmail_(envoi, contexte);
    if (contexte.simulation) {
      console.log(tBilingue_('journalAlerteSimulee', `${nom} — ${masquerTexte_(modele.objet)}`));
      simulees.push(nom);
      continue;
    }
    if (!contexte.destinataire) {
      console.warn(tBilingue_('journalAucunDestinataire', nom));
      continue;
    }
    try {
      envoyerEmail_({ destinataire: contexte.destinataire, objet: modele.objet, html: rendreEmailHtml_(modele, contexte.langue), texte: rendreEmailTexte_(modele, contexte.langue), langue: contexte.langue });
      suivant = appliquerEnvoi_(suivant, envoi, contexte.instant);
      envoyes.push(nom);
      console.log(tBilingue_('journalAlerteEnvoyee', nom));
    } catch (erreur) {
      console.error(tBilingue_('journalEchecEmail', nom, resumeErreur_(erreur)));
    }
  }
  return { etat: suivant, envoyes, simulees };
}
