/**
 * FR : Construction des messages Google Chat (fonctions pures, design §2 à §5) : carte d'une publication (RM-13), message
 *      d'amorçage (RM-11), message de test (RM-19). Toute donnée du flux est échappée ; aucun thread ni threadKey (RM-14).
 * EN: Google Chat message building (pure functions, design §2 to §5): publication card (RM-13), bootstrap message
 *     (RM-11), test message (RM-19). Every feed value is escaped; no thread nor threadKey (RM-14).
 */

/**
 * FR : Repère visuel d'une catégorie (design §2) : émoji, couleur, libellé traduit (en capitales pour l'alerte).
 * EN: Visual marker of a category (design §2): emoji, colour, translated label (upper case for alerts).
 * @param {string} code
 * @param {string} langue
 * @return {{emoji: string, couleur: string, libelle: string}}
 */
function marqueurCategorie_(code, langue) {
  const affichage = CONFIG.AFFICHAGE_CATEGORIES[code] ?? CONFIG.AFFICHAGE_CATEGORIES[CONFIG.CODE_AUTRE];
  const libelle = t_(affichage.cleLibelle, langue);
  return { emoji: affichage.emoji, couleur: affichage.couleur, libelle: code === 'ALE' ? libelle.toLocaleUpperCase(langue) : libelle };
}

/**
 * FR : Widget decoratedText (étiquette au-dessus, texte, icône facultative).
 * EN: decoratedText widget (top label, text, optional icon).
 * @param {string} etiquette
 * @param {string} texte FR : HTML restreint déjà échappé. EN: already escaped restricted HTML.
 * @param {string} [icone] FR : knownIcon (ex. CLOCK). EN: knownIcon (e.g. CLOCK).
 * @return {Object}
 */
function widgetTexteDecore_(etiquette, texte, icone) {
  const decore = { topLabel: etiquette, text: texte, wrapText: true };
  if (icone) decore.startIcon = { knownIcon: icone };
  return { decoratedText: decore };
}

/**
 * FR : Widget textParagraph.
 * EN: textParagraph widget.
 * @param {string} texte FR : HTML restreint déjà échappé. EN: already escaped restricted HTML.
 * @return {Object}
 */
function widgetParagraphe_(texte) {
  return { textParagraph: { text: texte } };
}

/**
 * FR : Widget buttonList à un bouton openLink.
 * EN: buttonList widget with one openLink button.
 * @param {string} libelle
 * @param {string} url
 * @return {Object}
 */
function widgetBouton_(libelle, url) {
  return { buttonList: { buttons: [{ text: libelle, onClick: { openLink: { url } } }] } };
}

/**
 * FR : Message complet : texte de repli et une carte (cardsV2).
 * EN: Full message: fallback text and one card (cardsV2).
 * @param {string} texte
 * @param {string} identifiant
 * @param {{title: string, subtitle: string}} entete
 * @param {Object[]} widgets
 * @return {Object}
 */
function message_(texte, identifiant, entete, widgets) {
  return { text: tronquer_(texte, CONFIG.TEXTE_MAX), cardsV2: [{ cardId: identifiant, card: { header: entete, sections: [{ widgets }] } }] };
}

/**
 * FR : Carte d'une publication (RM-13, design §3) : en-tête « émoji libellé », sous-titre « CERT-FR · référence »,
 *      bandeau pour l'alerte, titre en gras, catégorie colorée, date, résumé, bouton vers le CERT-FR (https et domaine
 *      CERT-FR seulement, sinon lien en texte non cliquable). Si le JSON dépasse CARTE_OCTETS_MAX, le résumé est retiré.
 * EN: Publication card (RM-13, design §3): "emoji label" header, "CERT-FR · reference" subtitle, alert banner, bold
 *     title, coloured category, date, summary, CERT-FR button (https CERT-FR domain only, otherwise non-clickable text
 *     link). When the JSON exceeds CARTE_OCTETS_MAX, the summary is dropped.
 * @param {Object} element FR : élément normalisé (normaliserElements_). EN: normalised item.
 * @param {string} langue
 * @return {Object}
 */
function construireCartePublication_(element, langue) {
  const charge = assemblerCartePublication_(element, langue, true);
  if (octetsUtf8_(JSON.stringify(charge)) <= CONFIG.CARTE_OCTETS_MAX) return charge;
  return assemblerCartePublication_(element, langue, false);
}

/**
 * FR : Assemble la carte d'une publication, avec ou sans résumé (voir construireCartePublication_).
 * EN: Assembles a publication card, with or without summary (see construireCartePublication_).
 * @param {Object} element
 * @param {string} langue
 * @param {boolean} avecResume
 * @return {Object}
 */
function assemblerCartePublication_(element, langue, avecResume) {
  const marqueur = marqueurCategorie_(element.categorie, langue);
  const reference = element.reference || t_('referenceAbsente', langue);
  const libelleEchappe = echapperChat_(marqueur.libelle);
  const widgets = [];
  if (element.categorie === 'ALE') {
    widgets.push(widgetParagraphe_(`<b><font color="${marqueur.couleur}">${echapperChat_(t_('carteBandeauAlerte', langue, marqueur.emoji))}</font></b>`));
  }
  widgets.push(widgetParagraphe_(`<b>${echapperChat_(element.titre)}</b>`));
  widgets.push(widgetTexteDecore_(t_('carteEtiquetteCategorie', langue), `<b><font color="${marqueur.couleur}">${marqueur.emoji} ${libelleEchappe}</font></b>`));
  widgets.push(widgetTexteDecore_(t_('carteEtiquetteDate', langue), formaterInstant_(element.date), 'CLOCK'));
  if (avecResume && element.resume) widgets.push(widgetParagraphe_(echapperChat_(element.resume)));
  if (estLienCertFr_(element.lien)) widgets.push(widgetBouton_(t_('carteBouton', langue), element.lien));
  else widgets.push(widgetParagraphe_(echapperChat_(t_('carteLienHorsDomaine', langue, element.lien))));
  const repli = t_('texteRepli', langue, marqueur.emoji, marqueur.libelle, reference, tronquer_(element.titre, CONFIG.TITRE_REPLI_MAX));
  // FR : l'en-tête est du texte brut (pas de HTML) ; la référence suit le motif CERTFR-… ou est un texte I18n.
  // EN: the header is plain text (no HTML); the reference follows the CERTFR-… pattern or is an I18n text.
  const entete = {
    title: t_('carteTitreEntete', langue, marqueur.emoji, marqueur.libelle),
    subtitle: t_('carteSousTitre', langue, reference),
  };
  return message_(echapperChat_(repli), 'publication', entete, widgets);
}

/**
 * FR : Message d'amorçage (RM-11, design §4) : nombre de publications non reprises, catégories relayées, légende des
 *      huit repères visuels.
 * EN: Bootstrap message (RM-11, design §4): number of publications not included, relayed categories, legend of the eight
 *     visual markers.
 * @param {number} nombre
 * @param {?string[]} codesFiltre FR : null = toutes. EN: null = all.
 * @param {string} langue
 * @return {Object}
 */
function construireMessageAmorcage_(nombre, codesFiltre, langue) {
  const corps = nombre === 1 ? t_('amorcageCorpsUne', langue) : t_('amorcageCorpsPlusieurs', langue, nombre);
  const relayees = codesFiltre
    ? codesFiltre.map((code) => marqueurCategorie_(code, langue).libelle).join(', ')
    : t_('amorcageToutes', langue);
  const legende = Object.keys(CONFIG.AFFICHAGE_CATEGORIES).map((code) => {
    const marqueur = marqueurCategorie_(code, langue);
    return `${marqueur.emoji} <font color="${marqueur.couleur}">${echapperChat_(marqueur.libelle)}</font>`;
  });
  const widgets = [
    widgetParagraphe_(echapperChat_(corps)),
    widgetTexteDecore_(t_('amorcageEtiquetteCategories', langue), echapperChat_(relayees)),
    widgetParagraphe_(`<b>${echapperChat_(t_('amorcageLegende', langue))}</b><br>${legende.join('<br>')}`),
  ];
  const entete = { title: t_('amorcageTitre', langue), subtitle: t_('amorcageSousTitre', langue) };
  return message_(t_('amorcageRepli', langue, nombre), 'amorcage', entete, widgets);
}

/**
 * FR : Message de test (RM-19, design §5) : 🧪 et « TEST » en tête, mode du script, date d'envoi, bouton vers le site.
 * EN: Test message (RM-19, design §5): 🧪 and "TEST" first, script mode, send date, button to the website.
 * @param {boolean} simulation
 * @param {Date} instant
 * @param {string} langue
 * @return {Object}
 */
function construireMessageTest_(simulation, instant, langue) {
  const date = formaterInstant_(instant);
  const mode = t_(simulation ? 'testModeSimulation' : 'testModeReel', langue);
  const widgets = [
    widgetParagraphe_(echapperChat_(t_('testCorps', langue))),
    widgetTexteDecore_(t_('testEtiquetteMode', langue), `<font color="${CONFIG.TEST.couleur}">${echapperChat_(mode)}</font>`),
    widgetTexteDecore_(t_('testEtiquetteDate', langue), date, 'CLOCK'),
    widgetBouton_(t_('testBouton', langue), CONFIG.URL_SITE),
  ];
  const entete = { title: t_('testTitre', langue), subtitle: t_('testSousTitre', langue) };
  return message_(t_('testRepli', langue, date), 'test', entete, widgets);
}
