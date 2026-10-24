/**
 * FR : Diagnostic (lecture seule, RM-24) et tests sans API lançables depuis l'éditeur. diagnostiquer() lit le vrai flux
 *      (GET seulement) et les propriétés, sans aucun POST ni écriture : c'est l'outil de vérification de la structure
 *      réelle du flux au premier lancement (CA-19). testerSansApi() n'appelle aucun service distant ni n'écrit rien ; le
 *      banc complet est dans tests/banc.js (agent tests). Données fictives seulement (CERTFR-2099-…).
 * EN: Diagnostic (read-only, RM-24) and no-API tests runnable from the editor. diagnostiquer() reads the real feed (GET
 *     only) and the properties, without any POST or write: it is the tool to check the real feed structure at first run
 *     (CA-19). testerSansApi() calls no remote service and writes nothing; the full bench is in tests/banc.js. Fictitious
 *     data only (CERTFR-2099-…).
 */

/**
 * FR : Diagnostic complet en un bloc de journal (design §8) : réglages, flux réel, exploitation, scopes.
 * EN: Full diagnostic in one log block (design §8): settings, real feed, operations, scopes.
 * @return {string}
 */
function diagnostiquer() {
  const instant = maintenant_();
  const proprietes = lireProprietes_();
  const lignes = [
    `=== ${tBilingue_('diagTitre', formaterInstant_(instant))} ===`,
    ...sectionDiag_(() => diagnostiquerReglages_(proprietes)),
    ...sectionDiag_(() => diagnostiquerFlux_(proprietes, instant)),
    ...sectionDiag_(() => diagnostiquerExploitation_(proprietes, instant)),
    `=== ${tBilingue_('diagFin')} ===`,
  ];
  const texte = lignes.join('\n');
  console.log(texte);
  return texte;
}

/**
 * FR : Tests sans API (fonctions pures) : référence, catégorie, clé, nettoyage, échappement, marqueurs, réglages, langue,
 *      alertes, traductions. Journalise le nombre de réussites et le détail des échecs ; lève une erreur en cas d'échec.
 * EN: No-API tests (pure functions): reference, category, key, cleaning, escaping, markers, settings, language, alerts,
 *     translations. Logs the number of successes and failure details; throws on failure.
 * @return {{reussis: number, echecs: string[]}}
 */
function testerSansApi() {
  const echecs = [];
  let reussis = 0;
  const verifier = (nom, obtenu, attendu) => {
    if (JSON.stringify(obtenu) === JSON.stringify(attendu)) reussis++;
    else echecs.push(`${nom} : ${JSON.stringify(obtenu)} ≠ ${JSON.stringify(attendu)}`);
  };
  testerReferencesEtCategories_(verifier);
  testerTextesEtCartes_(verifier);
  testerReglagesEtAlertes_(verifier);
  verifier('traductions', verifierTraductions_(), []);
  console.log(`testerSansApi : ${reussis} OK, ${echecs.length} KO${echecs.length ? `\n${echecs.join('\n')}` : ''}`);
  if (echecs.length) throw new Error(`testerSansApi : ${echecs.length} KO`);
  return { reussis, echecs };
}

/**
 * FR : Référence, catégorie (RM-3) et clé d'anti-doublon (RM-7).
 * EN: Reference, category (RM-3) and de-duplication key (RM-7).
 * @param {function(string, *, *)} verifier
 */
function testerReferencesEtCategories_(verifier) {
  verifier('reference', extraireReference_('https://cert.cyber.gouv.fr/avis/certfr-2099-avi-0001/'), 'CERTFR-2099-AVI-0001');
  verifier('categorie ALE', determinerCategorie_('CERTFR-2099-ALE-001', '', []).code, 'ALE');
  verifier('categorie XYZ', determinerCategorie_('CERTFR-2099-XYZ-001', '', []), { code: 'AUTRE', source: 'reference', codeInconnu: 'XYZ' });
  verifier('categorie chemin', determinerCategorie_('', 'https://cert.cyber.gouv.fr/actualite/bulletin/', []).code, 'ACT');
  verifier('categorie etiquette', determinerCategorie_('', 'https://cert.cyber.gouv.fr/x/', ['Durcissement']).code, 'DUR');
  verifier('lien normalise', normaliserLien_('http://www.cert.ssi.gouv.fr/avis/x/?a=1#b'), 'https://cert.cyber.gouv.fr/avis/x');
  verifier('cle sans reference', cleElement_({ reference: '', guid: '', lien: 'https://CERT.SSI.GOUV.FR/page/' }), 'https://cert.cyber.gouv.fr/page');
  verifier('lien CERT-FR', estLienCertFr_('https://cert.cyber.gouv.fr/avis/'), true);
  verifier('lien hors domaine', estLienCertFr_('https://exemple.test/avis/'), false);
  verifier('lien http refuse', estLienCertFr_('http://cert.cyber.gouv.fr/avis/'), false);
}

/**
 * FR : Nettoyage des textes (RM-4), échappement et marqueurs de catégorie (RM-13), absence de fil (RM-14).
 * EN: Text cleaning (RM-4), escaping and category markers (RM-13), no thread (RM-14).
 * @param {function(string, *, *)} verifier
 */
function testerTextesEtCartes_(verifier) {
  verifier('nettoyage', texteDepuisHtml_('<p>A &amp; B&nbsp;&lt;b&gt;</p>'), 'A & B <b>');
  verifier('troncature', Array.from(tronquer_('x'.repeat(400), 300)).length, 300);
  verifier('echappement', echapperChat_('<b>A & B</b>'), '&lt;b&gt;A &amp; B&lt;/b&gt;');
  const codes = Object.keys(CONFIG.AFFICHAGE_CATEGORIES);
  verifier('marqueurs distincts', new Set(codes.map((code) => CONFIG.AFFICHAGE_CATEGORIES[code].emoji)).size, codes.length);
  const element = {
    cle: 'CERTFR-2099-ALE-001', reference: 'CERTFR-2099-ALE-001', categorie: 'ALE', titre: 'Faille <b> & test',
    lien: 'https://exemple.test/x', date: new Date(Date.UTC(2099, 9, 22, 8, 0)), resume: '',
  };
  const charge = construireCartePublication_(element, 'fr');
  const json = JSON.stringify(charge);
  verifier('carte sans thread', /thread/i.test(json), false);
  verifier('carte sans bouton hors domaine', /openLink/.test(json), false);
  verifier('titre echappe', json.includes('Faille &lt;b&gt; &amp; test'), true);
}

/**
 * FR : Réglages (RM-26), langue, filtre (RM-5), mémoire (RM-8) et planification des alertes (RM-17).
 * EN: Settings (RM-26), language, filter (RM-5), memory (RM-8) and alert planning (RM-17).
 * @param {function(string, *, *)} verifier
 */
function testerReglagesEtAlertes_(verifier) {
  verifier('reglage invalide', lireReglages_({ AGE_MAX_JOURS: 'abc' }).valeurs.AGE_MAX_JOURS, CONFIG.REGLAGES.AGE_MAX_JOURS);
  verifier('reglage zero', lireReglages_({ AGE_MAX_JOURS: '0' }).valeurs.AGE_MAX_JOURS, CONFIG.REGLAGES.AGE_MAX_JOURS);
  verifier('reglage propriete', lireReglages_({ MAX_PUBLICATIONS_PAR_EXECUTION: '5' }).valeurs.MAX_PUBLICATIONS_PAR_EXECUTION, 5);
  verifier('langue de', langueEffective_('de'), { langue: 'fr', inconnue: true });
  verifier('filtre', lireFiltreCategories_({ CATEGORIES: 'ale, cti,XYZ' }), { codes: ['ALE', 'CTI'], inconnus: ['XYZ'], toutesInconnues: false });
  verifier('memoire bornee', ajouterCles_(['B', 'C'], ['A', 'B'], 2), ['A', 'B']);
  const instant = new Date(Date.UTC(2099, 9, 22, 12, 0));
  const premier = planifierAlertes_({}, { fluxMuet: { actif: true, jours: 6 } }, instant);
  verifier('flux muet envoye', premier.map(nomEnvoi_), ['fluxMuet']);
  const etat = appliquerEnvoi_({}, premier[0], instant);
  const lendemain = new Date(instant.getTime() + 24 * 3600 * 1000);
  verifier('flux muet sans rappel', planifierAlertes_(etat, { fluxMuet: { actif: true, jours: 7 } }, lendemain).length, 0);
  verifier('flux muet retabli', planifierAlertes_(etat, { fluxMuet: { actif: false } }, lendemain).map(nomEnvoi_), ['retabli:fluxMuet']);
}
