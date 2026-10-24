# Design — `gws-chat-veille-cert-fr` — Cartes Google Chat, e-mails d'alerte, journal et diagnostic / Google Chat cards, alert e-mails, log and diagnostic

- [Français](#français)
- [English](#english)
- [Annexe : textes FR/EN pour I18n.gs](#annexe--textes-fren-pour-i18ngs--annex-fren-texts-for-i18ngs)

> **Statut / Status** : conception du 2026-10-22 (décisions D-1 à D-7).
> Script autonome : **ni menu, ni onglet, ni boîte de dialogue**. Les « interfaces » sont : la carte Chat, trois
> messages Chat spéciaux (amorçage, test), des e-mails d'alerte, le journal d'exécution et la sortie de
> `diagnostiquer()`. / Standalone script: **no menu, no tab, no dialog**. The "interfaces" are the Chat card, two special
> Chat messages (bootstrap, test), alert e-mails, the execution log and the output of `diagnostiquer()`.

---

## Français

### 1. Principes

1. **Surface** : webhook entrant Chat (`cardsV2` + `text` de repli). Aucune interactivité (pas de bouton d'action, pas de
   formulaire) : un webhook ne sait pas traiter les clics ; seul un bouton `openLink` vers un https CERT-FR est utilisé.
2. **Widgets utilisés** (tous acceptés par les webhooks) : `header`, `textParagraph`, `decoratedText`, `buttonList`
   (`onClick.openLink`). **Non utilisés** : `image` et `imageUrl` d'en-tête (image externe, point de panne), `columns`
   (support webhook incertain), `grid`, `selectionInput`, `textInput`, `onClick.action`. Mise en forme limitée au HTML
   restreint de Chat : `<b>`, `<i>`, `<font color="#RRGGBB">`, `<a href>`.
3. **Le marqueur de catégorie ne repose jamais sur la couleur seule** : chaque catégorie a un **émoji de forme distincte**
   + un **libellé écrit** + une **couleur** (renfort). Le marqueur est dans l'en-tête de la carte (premier élément lu),
   dans une ligne « Catégorie » et dans le texte de repli (notification).
4. **L'alerte (ALE) reste la plus visible** : libellé en capitales, bandeau d'alerte supplémentaire en tête de carte,
   texte de repli en capitales. Aucune mention `@all` (Q-13).
5. **Langue** : français par défaut (`CONFIG.LANGUE_DEFAUT = 'fr'`) pour Chat et e-mails. Un script lancé par déclencheur n'a
   pas de locale utilisateur : `Session.getActiveUserLocale()` est tenté (lancement manuel), repli `fr`. Propriété
   `LANGUE` (`fr` ou `en`, défaut `fr`, décision n°5 du §14). Journal et diagnostic : **bilingues**.
7. **Prérequis de mise en service propres à l'interface** : (a) espace « Veille CERT-FR » créé en mode **fils de discussion**
   (à vérifier par le gestionnaire avant de créer le webhook) ; (b) webhooks entrants autorisés (super admin) ; (c) webhook créé
   et `WEBHOOK_URL` saisie ; (d) `envoyerMessageTest()` vu dans l'espace.
6. **Texte brut sûr** : toute donnée issue du flux (titre, résumé, référence, lien) est échappée (`&` → `&amp;`,
   `<` → `&lt;`, `>` → `&gt;`) **avant** d'être insérée, y compris dans `text`. Le titre est placé **entre `<b>…</b>`**
   posé par le script, jamais interprété.

### 2. Repères visuels par catégorie

Table de référence, à placer dans `CONFIG.AFFICHAGE_CATEGORIES` (valeurs visuelles, pas dans I18n ; les libellés sont
dans I18n). Un même code donne **toujours** le même émoji et la même couleur.

| Code | Libellé FR | Libellé EN | Émoji | Couleur du libellé | Contraste sur blanc | Particularité |
|---|---|---|---|---|---|---|
| ALE | Alerte | Alert | 🚨 | `#C5221F` | 5,9 : 1 | **Libellé en capitales, bandeau d'alerte, repli en capitales** |
| AVI | Avis de sécurité | Security advisory | 🛡️ | `#B06000` | 4,9 : 1 | — |
| ACT | Bulletin d'actualité | News bulletin | 📰 | `#1558B0` | 6,9 : 1 | — |
| CTI | Rapport de menace | Threat report | 🕵️ | `#7B1FA2` | 7,0 : 1 | — |
| IOC | Indicateurs de compromission | Indicators of compromise | 🔎 | `#00695C` | 6,5 : 1 | — |
| DUR | Guide de durcissement | Hardening guide | 🔒 | `#455A64` | 7,2 : 1 | — |
| INF | Information | Information | ℹ️ | `#5F6368` | 6,0 : 1 | — |
| Autre | Autre | Other | ❔ | `#6D4C41` | 7,2 : 1 | Code inconnu, journalisé |

Contrastes calculés approximativement pour le mode clair ; en mode sombre Chat inverse le fond : les libellés restent
lisibles parce que la couleur n'est qu'un renfort (émoji et mot portent l'information). À valider visuellement à la
recette (CA-19) dans les deux thèmes.

### 3. Carte d'une publication (cas général)

**Structure** (`cardsV2[0].card`, `cardId` = `publication`) :

| Zone | Contenu | Source |
|---|---|---|
| `header.title` | `{émoji} {libellé de catégorie}` (ALE : `🚨 ALERTE`) | table §2 + clé `carteTitreEntete` |
| `header.subtitle` | `CERT-FR · {référence}` (mention de la source, §10 du cadrage) | clé `carteSousTitre` |
| Section unique, widget 1 (ALE seulement) | `textParagraph` : bandeau `<b><font color="#C5221F">🚨 ALERTE — … à examiner en priorité</font></b>` | clé `carteBandeauAlerte` |
| Widget 2 | `textParagraph` : `<b>{titre échappé}</b>` | `title` |
| Widget 3 | `decoratedText`, `topLabel` « Catégorie », `text` `<b><font color="{couleur}">{émoji} {libellé}</font></b>` | table §2 |
| Widget 4 | `decoratedText`, `startIcon.knownIcon` `CLOCK`, `topLabel` « Publié le », `text` `dd/MM/yyyy HH:mm` (Europe/Paris) | `pubDate` |
| Widget 5 (si résumé) | `textParagraph` : résumé échappé, 300 caractères max, « … » | `description` |
| Widget 6 | `buttonList` : un bouton « Consulter sur le CERT-FR » (`openLink.url` = lien) ; **seulement** si https + domaine CERT-FR | `link` |
| Widget 6 bis (lien hors domaine) | `textParagraph` : « Lien non vérifié (hors domaine CERT-FR) : {lien échappé} », **sans** `<a>` | `link` |

**Texte de repli** (`text`, affiché dans la notification et sur mobile) : `{émoji} {LIBELLÉ} — {référence} — {titre}`,
titre tronqué à 200 caractères ; pour ALE le libellé est en capitales. Exemples :
`🚨 ALERTE — CERTFR-2099-ALE-001 — Vulnérabilité critique dans un produit fictif` ;
`🛡️ Avis de sécurité — CERTFR-2099-AVI-0001 — Multiples vulnérabilités dans un produit fictif`.

Pas de `thread` ni `threadKey` : un fil par publication (RM-14). Taille : JSON < 32 Ko (attendu : < 2 Ko) ; `text` < 4 000.

**Rendu attendu** (schéma ; l'apparence réelle est celle de Chat) :

```
┌───────────────────────────────────────────────┐
│ 🛡️ Avis de sécurité                           │  <- en-tête (émoji + mot)
│ CERT-FR · CERTFR-2099-AVI-0001                │
├───────────────────────────────────────────────┤
│ Multiples vulnérabilités dans un produit      │  <- titre en gras
│ fictif (22 octobre 2099)                      │
│ Catégorie                                     │
│ 🛡️ Avis de sécurité            (couleur ambre)│
│ 🕒 Publié le                                  │
│    22/10/2099 09:12                           │
│ Plusieurs vulnérabilités ont été corrigées…   │  <- résumé (si présent)
│ [ Consulter sur le CERT-FR ]                  │  <- bouton openLink
└───────────────────────────────────────────────┘
```

Pour ALE, le même gabarit avec, **avant le titre**, la ligne en gras rouge
`🚨 ALERTE — vulnérabilité exploitée ou critique : à examiner en priorité`.

**JSON de référence** (carte AVI fictive ; `dev-gas` produit ce gabarit) :

```json
{
  "text": "🛡️ Avis de sécurité — CERTFR-2099-AVI-0001 — Multiples vulnérabilités dans un produit fictif",
  "cardsV2": [{
    "cardId": "publication",
    "card": {
      "header": { "title": "🛡️ Avis de sécurité", "subtitle": "CERT-FR · CERTFR-2099-AVI-0001" },
      "sections": [{
        "widgets": [
          { "textParagraph": { "text": "<b>Multiples vulnérabilités dans un produit fictif (22 octobre 2099)</b>" } },
          { "decoratedText": { "topLabel": "Catégorie", "text": "<b><font color=\"#B06000\">🛡️ Avis de sécurité</font></b>", "wrapText": true } },
          { "decoratedText": { "startIcon": { "knownIcon": "CLOCK" }, "topLabel": "Publié le", "text": "22/10/2099 09:12" } },
          { "textParagraph": { "text": "Plusieurs vulnérabilités ont été corrigées dans un produit fictif." } },
          { "buttonList": { "buttons": [ { "text": "Consulter sur le CERT-FR", "onClick": { "openLink": { "url": "https://cert.cyber.gouv.fr/avis/CERTFR-2099-AVI-0001/" } } } ] } }
        ]
      }]
    }
  }]
}
```

Règles de construction : les widgets 3 à 6 sont toujours dans cet ordre ; le widget 5 est omis si le résumé est vide ou
identique au titre (RM-4) ; la clé de l'objet n'inclut jamais `thread`, `threadKey` ni `accessoryWidgets`.

### 4. Message d'amorçage (premier lancement, RM-11)

Un seul message, posté **en mode réel uniquement** (en simulation : journal seulement, jamais posté). La mémoire d'amorçage
(`ELEMENTS_VUS`) n'est écrite **qu'après** la réponse 200 du webhook : si le message est refusé, l'amorçage est refait à
l'exécution suivante. C'est une carte au repère
distinct des catégories (✅, couleur `#1E8E3E`, mot « active ») :

- `header.title` : `✅ Veille CERT-FR active` ; `header.subtitle` : `Flux CERT-FR · relève toutes les heures`.
- `textParagraph` : « Les nouvelles publications du CERT-FR seront relayées ici, une par fil de discussion.
  {N} publication(s) antérieure(s) non reprise(s). » (accord singulier/pluriel : deux clés).
- `decoratedText` « Catégories relayées » : `toutes` ou la liste des libellés du filtre `CATEGORIES`.
- `textParagraph` **légende** : une ligne par catégorie `{émoji} {libellé}` (les 8, dans l'ordre ALE, AVI, ACT, CTI,
  IOC, DUR, INF, Autre), précédée de « Repères visuels par catégorie » : sert d'aide-mémoire permanent de l'espace.
- Pas de bouton. Repli : `✅ Veille CERT-FR active — {N} publication(s) antérieure(s) non reprise(s).`

### 5. Message de test (`envoyerMessageTest()`, RM-19)

Distinguable à trois niveaux : émoji 🧪, mot **TEST** en tête de titre **et** de repli, couleur grise `#5F6368` ; aucune
référence CERTFR.

- `header.title` : `🧪 TEST — Veille CERT-FR` ; `header.subtitle` : `Message de test, aucune publication réelle`.
- `textParagraph` : « Ce message valide le webhook de l'espace. Il ne correspond à aucune publication du CERT-FR et
  n'a aucun effet sur la mémoire du script. »
- `decoratedText` « Mode du script » : « Simulation (DRY_RUN activé) : seul ce message de test est posté » ou
  « Mode réel (DRY_RUN désactivé) ».
- `decoratedText` (`CLOCK`) « Envoyé le » : `dd/MM/yyyy HH:mm`.
- `buttonList` : « Ouvrir le site du CERT-FR » → `https://cert.cyber.gouv.fr/` (permet de vérifier le rendu du bouton).
- Repli : `🧪 TEST — Veille CERT-FR — message de test du {date}, ignorer`.
- Journal : ligne `envoyerMessageTest` (résultat HTTP, masqué). Si `WEBHOOK_URL` est absente ou mal formée : rien n'est posté,
  message d'erreur `erreurWebhookNonConfigure` au journal et exception levée (visible dans l'éditeur).

### 6. E-mails d'alerte de fonctionnement (RM-17)

Surface : `MailApp.sendEmail` avec `htmlBody` **et** `body` en texte brut, `name: 'Veille CERT-FR'`, expéditeur = compte
propriétaire (`compte-technique@domaine.com`). Aucune image, tableaux avec `role="presentation"`, largeur maximale 640 px,
police système, corps 14 px minimum, lisible sur mobile (une colonne). **Jamais** de lien ni de fragment de
`WEBHOOK_URL` ; les détails techniques passent par `masquerUrl_`.

**Destinataire** : `ADRESSE_ALERTE` sinon propriétaire du script. **Fréquence** : une même alerte au plus toutes les 24 h
(clé dans `ALERTES_ENVOYEES`), **sauf** « publication refusée » (**un e-mail par jour au plus**, tous éléments refusés du jour
regroupés : le premier e-mail détaille l'élément fautif, les suivants du même jour ne sont pas envoyés, ils restent au journal) et
**flux muet** (**un seul e-mail** au début du silence, aucun rappel, puis « rétabli » dès qu'un nouvel élément apparaît) ;
**regroupement** : une exécution qui détecte plusieurs problèmes n'envoie **qu'un e-mail par type** ; un seul « rétabli » par type. **Aucune** alerte en simulation (journal seulement :
`journalAlerteSimulee`).

**Types et objets** (clés de l'annexe) :

| Type | Déclencheur | Bandeau (mot + couleur) | Objet FR |
|---|---|---|---|
| `fluxEchec` | pas de lecture valide depuis plus de `SEUIL_ECHEC_HEURES` | « ALERTE » rouge `#B3261E` | `[Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis {h} h` |
| `webhookRefuse` | 401/403/404 du webhook (arrêt de toutes les publications de l'exécution) | « ALERTE » rouge | `[Veille CERT-FR] ALERTE — l'espace Chat refuse les publications` |
| `publicationRefusee` | 400 du webhook sur un élément (élément écarté, les autres continuent) ; 1 e-mail/jour | « ATTENTION » ambre | `[Veille CERT-FR] ATTENTION — une publication a été refusée par Chat ({référence})` |
| `webhookAbsent` | `WEBHOOK_URL` absente / mal formée en mode réel | « ALERTE » rouge | `[Veille CERT-FR] ALERTE — webhook Chat non configuré` |
| `fluxMuet` | aucun nouvel élément depuis `SEUIL_SILENCE_JOURS` | « ATTENTION » ambre `#8A5A00` | `[Veille CERT-FR] ATTENTION — aucune nouvelle publication depuis {j} jours` |
| `retabli` | retour à la normale d'un des types ci-dessus | « RÉTABLI » vert `#1B6E3A` | `[Veille CERT-FR] Rétabli — {problème résolu}` |

Le mot du bandeau (ALERTE, ATTENTION, RÉTABLI) est toujours écrit : la couleur est un renfort.
Texte blanc sur ces fonds : contraste ≥ 6 : 1.

**Structure commune** (de haut en bas) :

1. **Bandeau** coloré : surtitre « Veille CERT-FR · Alerte de fonctionnement », puis mot-clé + titre court.
2. **Constat** : une à deux phrases (ce qui se passe, conséquence pour l'équipe).
3. **Tableau de faits** (2 colonnes) : « Depuis », « Dernière lecture réussie », « Dernière exécution », « Mode » (réel/simulation), et
   selon le type « Code HTTP », « Seuil configuré ».
4. **À faire** : liste numérotée (2 à 4 étapes).
5. **Détail technique (support)** : bloc `<pre>` monochrome, 6 lignes maximum, URL masquées.
6. **Pied** : nom du script, compte, mention « envoyé automatiquement, une même alerte au plus toutes les 24 h, aucune alerte
   n'est postée dans l'espace Chat ».

**Corps** (texte exact : annexe, clés `mailCorps*` et `mailActions*`). Résumé :

- *flux en échec* : « Le flux du CERT-FR n'a pas pu être lu depuis {h} h. Aucune nouvelle publication n'est relayée dans
  l'espace Chat. Le flux ne garde que les derniers éléments : une panne longue peut faire manquer des publications. » À
  faire : ouvrir le flux dans un navigateur ; lancer `diagnostiquer()` ; si HTTP 403, voir risque R-2 (site qui refuse Apps
  Script).
- *publication refusée* : « Chat a refusé la publication {référence} (HTTP 400, message invalide). L'élément est écarté et ne sera
  pas retenté ; les autres publications continuent. » Tableau de faits : référence, catégorie, taille du message, code HTTP. À
  faire : relever le détail au journal, vérifier le contenu de l'élément sur le CERT-FR, signaler le cas à l'équipe Google Workspace
  (un titre ou un résumé inattendu peut révéler un défaut de la carte) ; la publication peut être faite à la main dans l'espace.
- *webhook refusé* : « L'espace Chat « Veille CERT-FR » a refusé la publication (HTTP {code}). Les publications de cette exécution
  sont suspendues ; elles seront retentées automatiquement dès que le webhook fonctionnera (dans la limite de {j} jours). » À
  faire : vérifier que le webhook n'a pas été révoqué ni l'espace supprimé ; créer un webhook, mettre à jour `WEBHOOK_URL`, lancer
  `envoyerMessageTest()`.
- *webhook non configuré* : « La propriété `WEBHOOK_URL` est absente ou n'a pas la forme attendue
  (`https://chat.googleapis.com/v1/spaces/…`). Aucune publication n'est faite. »
- *flux muet* : « Le flux est lisible mais aucune nouvelle publication n'a été vue depuis {j} jours, alors que le CERT-FR publie en
  général chaque jour ouvré. » Envoyé **une seule fois** ; le pied de page du type précise « aucun rappel ne sera envoyé ».
- *rétabli* : « {problème résolu}. Problème signalé le {date}. Aucune action requise. » ; il précise, pour le flux et le webhook, le
  nombre de publications rattrapées si connu.

### 7. Journal d'exécution (RM-21)

**Une ligne de synthèse par exécution** (`console.log`), bilingue en préfixe et jetons `clé=valeur` neutres (greppables) :

```
[Veille CERT-FR] Exécution terminée / Run finished | resultat=ok | mode=declencheur | dryRun=false | duree=4s | lus=32 | ignores=0 | nouveaux=3 | ecartes_categorie=0 | ecartes_anciennete=0 | publies=3 | echecs=0 | reportes=0 | alertes=aucune
```

- `resultat` ∈ `ok`, `amorcage`, `partiel` (au moins un échec, un refus 400 ou un report), `echec_flux`, `webhook_refuse`, `webhook_absent`,
  `verrou_non_obtenu`, `garde_temps`, `simulation`.
- `mode` ∈ `declencheur`, `manuel`.
- `alertes` : types envoyés séparés par `+`, ou `aucune` ; en simulation `simulees:fluxEchec`.
- Exécution abandonnée (verrou) : `resultat=verrou_non_obtenu` seulement, autres jetons absents.

**Lignes de détail** (avant la synthèse, niveau `console.log`/`console.warn`) : `Catégorie inconnue / Unknown category : code={code}
cle={cle}` ; `Date illisible / Unreadable date : cle={cle}` ; `Élément ignoré / Item skipped : sans titre ou sans lien` ; `Publié /
Posted : cle={cle} categorie={code}` ; `Échec / Failure : cle={cle} http={code}` ; `Publication refusée (400), élément écarté / Post rejected (400), item discarded : cle={cle} taille={octets}`
(la synthèse compte ces éléments dans un jeton `refuses=N`, ajouté après `echecs`).

**Simulation** (RM-18) : pour chaque message qui serait posté, une ligne
`SIMULATION — message non posté / not posted : cle=CERTFR-2099-AVI-0001 categorie=AVI taille=1180 octets titre="Multiples vulnérabilités dans…"`
(titre tronqué à 80 caractères) puis, **pour le premier seulement**, le JSON complet sur une ligne
`SIMULATION — JSON du premier message / first message JSON : {…}`. En simulation, l'amorçage est décrit :
`SIMULATION — amorçage : {N} clés seraient mémorisées, 1 message d'amorçage serait posté`.

**Interdit** : `WEBHOOK_URL` entière, `key=`, `token=` (remplacés par `***`).

**État `DERNIERE_EXECUTION`** (JSON, propriété écrite par le script) : `{ "date": "ISO", "resultat": "ok", "derniereLectureReussie": "ISO",
"dernierNouvelElement": "ISO", "publies": 3 }`.

### 8. Sortie de `diagnostiquer()` (RM-24)

Un seul bloc `console.log`, jamais de `POST`. **Chaque ligne commence par un mot-état** (`OK`, `ATTENTION`, `ERREUR`, `INFO`),
jamais par une couleur seule. Libellés bilingues (clés `diag*`). Exemple rendu :

```
=== Diagnostic Veille CERT-FR / CERT-FR watch diagnostic — 22/10/2099 09:30 ===
INFO       Version / mode : DRY_RUN=true (simulation / dry run)
OK         Flux / Feed : HTTP 200 · URL finale / final URL https://cert.cyber.gouv.fr/feed/ (pas de redirection / no redirect)
OK         Éléments / Items : 32 lus / read, 0 ignorés / skipped
OK         Catégories / Categories : AVI×24, ACT×3, ALE×2, CTI×2, DUR×1
OK         Plus récent / Latest : 22/10/2099 09:12
ATTENTION  Références non reconnues / Unrecognised references : 1 (classées « Autre » / classed "Other")
ERREUR     WEBHOOK_URL : absente / missing
INFO       CATEGORIES : toutes / all
INFO       Mémoire / Memory : 120 clés / keys (sur / of 300 max), ~3 Ko / KB
OK         Déclencheur / Trigger : 1 déclencheur horaire sur relever() / 1 hourly trigger on relever()
INFO       Dernière exécution / Last run : 22/10/2099 09:00 · ok · dernière lecture réussie / last successful read 22/10/2099 09:00
OK         Scopes : script.external_request, script.scriptapp, script.send_mail
=== Fin du diagnostic / End of diagnostic ===
```

Valeurs possibles : `WEBHOOK_URL` → `OK … présente, forme valide (https://chat.googleapis.com/v1/spaces/***)` /
`ERREUR … absente` / `ERREUR … forme invalide` ; déclencheur → `OK` (1), `ATTENTION … aucun`, `ATTENTION … {n} (doublon)` ;
flux illisible → `ERREUR Flux : HTTP 403 …` ; en simulation avec webhook présent → `INFO`, pas `ERREUR`.

### 9. Fonctions lancées à la main (messages au journal)

Aucune boîte de dialogue (un script autonome n'a pas d'interface classeur). Chaque fonction écrit une ligne au journal et lève une
exception en cas d'impossibilité (visible dans l'éditeur) :

| Fonction | Message au journal (FR / EN) |
|---|---|
| `installerDeclencheur()` | « Déclencheur horaire installé sur relever() (n'importe quel déclencheur précédent supprimé). » |
| `supprimerDeclencheur()` | « {n} déclencheur(s) supprimé(s) sur relever(). » |
| `reinitialiserMemoire()` sans confirmation | « Réinitialisation refusée : saisir la propriété CONFIRMER_REINITIALISATION = oui, puis relancer. Rien n'a été modifié. » (aucune exception : simple ligne d'avertissement) |
| `reinitialiserMemoire()` avec `CONFIRMER_REINITIALISATION=oui` | « Mémoire effacée : le prochain lancement refera l'amorçage (un message d'information, aucune publication antérieure). Propriété CONFIRMER_REINITIALISATION remise à vide. » |
| `relever()` manuel | ligne de synthèse §7 avec `mode=manuel` |

### 10. Propriétés du script

**Saisies par l'administrateur** (Paramètres du projet > Propriétés du script) :

| Nom | Défaut | Description / validation |
|---|---|---|
| `WEBHOOK_URL` | (vide) | **Secret.** URL du webhook de l'espace ; doit commencer par `https://chat.googleapis.com/v1/spaces/`. |
| `DRY_RUN` | `true` (CONFIG) | `false` (minuscule) pour publier ; toute autre valeur = simulation. |
| `URL_FLUX` | `https://cert.cyber.gouv.fr/feed/` | Surcharge de l'URL du flux ; https obligatoire. |
| `CATEGORIES` | (vide = toutes) | Codes séparés par des virgules (`ALE,AVI,CTI`) ; codes inconnus ignorés et signalés au journal et au diagnostic. |
| `ADRESSE_ALERTE` | propriétaire du script | Destinataire des e-mails ; adresse mal formée → repli propriétaire, avertissement au journal. |
| `LANGUE` | `fr` | `fr` ou `en` pour Chat et e-mails (retenue). |
| `CONFIRMER_REINITIALISATION` | (vide) | `oui` autorise **un** appel de `reinitialiserMemoire()` ; remise à vide par le script après usage. |
| `AGE_MAX_JOURS` | `7` | Ancienneté maximale d'une publication relayée (RM-6). |
| `MAX_PUBLICATIONS_PAR_EXECUTION` | `20` | Plafond (RM-12). |
| `MEMOIRE_MAX` | `300` | Clés conservées (RM-8). |
| `SEUIL_ECHEC_HEURES` | `6` | Heures sans lecture valide avant alerte (RM-17). |
| `SEUIL_SILENCE_JOURS` | `5` | Jours sans nouvel élément avant alerte « flux muet ». |

Les cinq dernières valeurs numériques sont des constantes de `CONFIG`, surchargeables par propriété (décision n°6).
**Écrites par le script** (ne pas modifier à la main) : `ELEMENTS_VUS` (liste JSON de clés), `DERNIERE_EXECUTION` (§7),
`ALERTES_ENVOYEES` (JSON : type → date du dernier envoi ; effacé au « rétabli »).

### 11. Messages et erreurs (clé → quand)

Les textes exacts sont en annexe. Principe : une phrase claire d'abord, le détail technique (code HTTP, message Google, URL masquée)
ensuite, après un « — ».

| Clé | Quand |
|---|---|
| `erreurVerrou` | Verrou non obtenu en 30 s : exécution abandonnée |
| `erreurFluxHttp` | Flux : code ≠ 200 après nouvels essais |
| `erreurFluxXml` | Flux : XML illisible ou racine ≠ `rss/channel` |
| `erreurFluxVide` | Flux : aucun `item` valide |
| `erreurWebhookRefuse` | Webhook : 401/403/404 (arrêt de l'exécution) |
| `erreurPublicationRefusee` | Webhook : 400 sur un élément (écarté, les autres continuent) |
| `avertReinitialisationRefusee` | `reinitialiserMemoire()` sans `CONFIRMER_REINITIALISATION=oui` |
| `erreurWebhookTransitoire` | Webhook : 429/5xx persistants après essais (retenté à la prochaine exécution, sans alerte) |
| `erreurWebhookNonConfigure` | `WEBHOOK_URL` absente ou mal formée |
| `infoWebhookNonConfigureSimulation` | idem en simulation : simple mention |
| `avertGardeTemps` | Arrêt propre avant 5 min |
| `avertAdresseAlerte` | `ADRESSE_ALERTE` invalide |
| `avertCategoriesInconnues` | `CATEGORIES` contient un code inconnu |

### 12. Accessibilité et langue

- Information jamais portée par la couleur seule : émoji de forme distincte + mot écrit (cartes), mot-état (diagnostic), mot du bandeau
  (e-mails).
- Contrastes ≥ 4,5 : 1 (texte coloré sur blanc, tableau §2) ; ≥ 6 : 1 pour le texte blanc des bandeaux d'e-mail.
- Émojis lus par les lecteurs d'écran : toujours accompagnés du libellé, jamais seuls.
- Dates `dd/MM/yyyy HH:mm`, fuseau Europe/Paris ; langue `fr` par défaut, repli `fr`.

### 13. Exemples rendus (données fictives)

**Cartes Chat** (3 publications fictives, ordre chronologique de publication) :

| En-tête | Sous-titre | Titre (gras) | Catégorie (ligne) | Publié le | Résumé | Bouton |
|---|---|---|---|---|---|---|
| 🚨 ALERTE | CERT-FR · CERTFR-2099-ALE-001 | Vulnérabilité critique dans un produit fictif | 🚨 ALERTE | 22/10/2099 07:40 | Une vulnérabilité exploitée activement est corrigée. | Consulter sur le CERT-FR |
| 🛡️ Avis de sécurité | CERT-FR · CERTFR-2099-AVI-0001 | Multiples vulnérabilités dans un produit fictif (22 octobre 2099) | 🛡️ Avis de sécurité | 22/10/2099 09:12 | Plusieurs vulnérabilités ont été corrigées. | Consulter sur le CERT-FR |
| 📰 Bulletin d'actualité | CERT-FR · CERTFR-2099-ACT-001 | Bulletin d'actualité de la semaine 43 | 📰 Bulletin d'actualité | 22/10/2099 10:05 | (aucun) | Consulter sur le CERT-FR |

Texte de repli correspondant : `🚨 ALERTE — CERTFR-2099-ALE-001 — Vulnérabilité critique dans un produit fictif` /
`🛡️ Avis de sécurité — CERTFR-2099-AVI-0001 — Multiples vulnérabilités dans un produit fictif (22 octobre 2099)` /
`📰 Bulletin d'actualité — CERTFR-2099-ACT-001 — Bulletin d'actualité de la semaine 43`.

**Ligne de journal** : voir §7. **Diagnostic** : voir §8. **E-mail « flux en échec »** (rendu texte) :

```
Objet : [Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis 7 h
De : Veille CERT-FR <compte-technique@domaine.com>   À : prenom.nom@exemple.test

[ALERTE] Veille CERT-FR · Alerte de fonctionnement
Le flux CERT-FR est illisible depuis 7 h

Le flux du CERT-FR n'a pas pu être lu depuis 7 h. Aucune nouvelle publication n'est relayée dans l'espace Chat.

Depuis                    22/10/2099 02:00
Dernière lecture réussie  22/10/2099 02:00
Dernière exécution        22/10/2099 09:00
Mode                      Réel
Code HTTP                 503
Seuil configuré           6 h

À faire
1. Ouvrir https://cert.cyber.gouv.fr/feed/ dans un navigateur.
2. Lancer diagnostiquer() depuis l'éditeur Apps Script.
3. Si le code est 403, le site refuse peut-être Apps Script : prévenir l'équipe Google Workspace.

Détail technique
HTTP 503 après 3 essais — https://cert.cyber.gouv.fr/feed/

Message automatique du script gws-chat-veille-cert-fr (compte compte-technique@domaine.com). Une même alerte est envoyée
au plus toutes les 24 h. Aucune alerte n'est postée dans l'espace Chat.
```

### 14. Décisions du demandeur (2026-10-22) intégrées à ce design

1. **Prérequis de mise en service** : l'espace « Veille CERT-FR » doit être créé en mode **fils de discussion** (vérifié par le
   gestionnaire à la création, avant de créer le webhook), sinon « un fil par publication » (RM-14) n'a pas de sens. Vérification de
   la console (webhooks entrants) par un super admin inchangée.
2. **Webhook 400** : l'élément fautif est **écarté** (mémorisé sans publication), signalé au journal et par un e-mail dédié
   « publication refusée » (**un e-mail par jour au plus**, tous éléments confondus) ; **les autres éléments continuent**.
   **401, 403, 404 et webhook absent** arrêtent toutes les publications de l'exécution (e-mails « webhook refusé » / « non configuré »).
3. **Amorçage** : la mémoire d'amorçage est écrite **après** l'acceptation (200) du message d'amorçage.
4. **Simulation** : l'amorçage n'est jamais posté (accepté).
5. **`LANGUE`** (`fr` par défaut) : retenue. 6. **Seuils** : constantes `CONFIG` surchargeables par propriété : retenu.
7. **`SEUIL_ECHEC_HEURES`** en heures depuis la dernière lecture réussie : retenu.
8. **Flux muet** : **un seul e-mail** au début du silence, puis « rétabli » à la première nouvelle publication ; aucun rappel quotidien.
9. **`reinitialiserMemoire()`** : refusée sauf si la propriété `CONFIRMER_REINITIALISATION` vaut `oui` ; elle est **remise à vide**
   après usage.
10. et 11. (lien hors domaine, échappement du `text`, thème sombre) : vérifiés à la recette CA-19, sans changement.

---

## English

### 1. Principles

1. **Surface**: Chat incoming webhook (`cardsV2` + fallback `text`). No interactivity (a webhook cannot handle clicks); the
   only button is an `openLink` to an https CERT-FR link.
2. **Widgets used** (all webhook-safe): `header`, `textParagraph`, `decoratedText`, `buttonList` (`openLink`). **Not used**: images
   (header `imageUrl` is an external failure point), `columns` (uncertain webhook support), `grid`, inputs, `onClick.action`.
   Formatting limited to Chat's restricted HTML: `<b>`, `<i>`, `<font color>`, `<a href>`.
3. **The category marker never relies on colour alone**: each category has a **distinct-shape emoji** + a **written label** + a
   **colour** (reinforcement). It appears in the card header, in a "Category" line and in the fallback text.
4. **Alerts (ALE) stay the most visible**: upper-case label, extra alert banner at the top of the card, upper-case fallback.
   No `@all` (Q-13).
5. **Language**: French by default for Chat and e-mails (a trigger run has no user locale; `Session.getActiveUserLocale()` is tried
   for manual runs, falling back to `fr`). Optional `LANGUE` property (default `fr`, kept). Log and diagnostic are **bilingual**.
6. **Safe text**: every feed value is escaped (`&`, `<`, `>`) **before** insertion, including in `text`; the title sits between
   `<b>…</b>` added by the script.

### 2. Category markers

See the French table in section 2 (code, labels FR/EN, emoji, colour, contrast): ALE 🚨 `#C5221F`, AVI 🛡️ `#B06000`, ACT 📰
`#1558B0`, CTI 🕵️ `#7B1FA2`, IOC 🔎 `#00695C`, DUR 🔒 `#455A64`, INF ℹ️ `#5F6368`, Other ❔ `#6D4C41`. Stored in
`CONFIG.AFFICHAGE_CATEGORIES`; labels in I18n. The same code always gives the same emoji and colour. Colours are to be validated
visually in light and dark themes at acceptance (CA-19).

### 3. Publication card

Header: `{emoji} {category label}` (ALE: `🚨 ALERT`), subtitle `CERT-FR · {reference}`. One section, widgets in this order: (ALE only)
red bold banner; bold escaped title; "Category" decorated text with coloured emoji and label; "Published on" decorated text
(`CLOCK` icon, `dd/MM/yyyy HH:mm`, Europe/Paris); summary (if any, 300 characters); `buttonList` with "Read on CERT-FR" (only for an
https CERT-FR link; otherwise a non-clickable "Unverified link (outside CERT-FR domain)" paragraph). Fallback `text`:
`{emoji} {LABEL} — {reference} — {title}` (title cut at 200 characters, upper case for ALE). No `thread`/`threadKey`
(one thread per publication). Reference JSON and layout sketch: see the French section 3 (identical structure).

### 4. Bootstrap message (first run)

One card, posted **in live mode only** (dry run: log only, never posted); memory is written **only after** the webhook answers 200: `✅ CERT-FR watch active` / "CERT-FR feed · polled every hour"; paragraph
"New CERT-FR publications will be relayed here, one per thread. {N} earlier publication(s) not included."; "Categories relayed:
all (or list)"; a **legend** with the 8 emoji + labels. No button.

### 4 bis. Go-live prerequisite for the space

The "Veille CERT-FR" space must be created in **threaded** mode (checked by the manager before creating the webhook), otherwise
"one thread per publication" is meaningless. Also: incoming webhooks allowed (super admin), `WEBHOOK_URL` set, test message seen.
`reinitialiserMemoire()` refuses to run unless `CONFIRMER_REINITIALISATION=oui` (log warning, nothing changed); after a confirmed
reset the property is emptied. Webhook 400 on one item: item discarded (memorised, not posted), logged, e-mail "post rejected"
(max one per day), others continue; 401/403/404/missing webhook stop the whole run.

### 5. Test message (`envoyerMessageTest()`)

Distinguishable by 🧪, the word **TEST** at the start of title and fallback, grey colour, and no CERTFR reference. Content: purpose,
current mode (dry run / live), send time, button "Open the CERT-FR website". No effect on memory; posted even in dry run.

### 6. Operational e-mails

`MailApp`, HTML + plain text, no image, 640 px, mobile-readable, sender `compte-technique@domaine.com` named "Veille CERT-FR". Types:
feed failing (red "ALERT"), webhook rejected 401/403/404 (red), webhook not configured (red), **post rejected** (amber "WARNING":
webhook 400 on one item, item discarded and others continue, at most one e-mail per day), silent feed (amber "WARNING", **one single
e-mail** at the start of the silence, no reminder), restored (green "RESTORED"). Banner word always written. Other types: at most once
per 24 h, one e-mail per type per run, never in dry run, never a secret. Structure: banner, finding, facts table, "To do" numbered list, technical detail (masked), footer. Exact texts: annex.

### 7. Log

One summary line per run, bilingual prefix and neutral `key=value` tokens (`resultat`, `mode`, `dryRun`, `duree`, `lus`, `ignores`,
`nouveaux`, `ecartes_categorie`, `ecartes_anciennete`, `publies`, `echecs`, `reportes`, `alertes`); detail lines for unknown
category, unreadable date, skipped item, posted, failed; in dry run one `SIMULATION` line per message plus the first message's
JSON. No secret. Example in the French section 7.

### 8. `diagnostiquer()`

One log block, no `POST`; every line starts with a status word (`OK`, `ATTENTION`, `ERREUR`, `INFO`); bilingual labels. Example in the
French section 8.

### 9. Script properties

See the French table in section 10 (`WEBHOOK_URL`, `DRY_RUN`, `URL_FLUX`, `CATEGORIES`, `ADRESSE_ALERTE`, proposed `LANGUE`,
`AGE_MAX_JOURS`, `MAX_PUBLICATIONS_PAR_EXECUTION`, `MEMOIRE_MAX`, `SEUIL_ECHEC_HEURES`, `SEUIL_SILENCE_JOURS` as `CONFIG` constants
overridable by property, plus `CONFIRMER_REINITIALISATION` (`oui` allows one `reinitialiserMemoire()` call, reset to empty after use); script-written:
`ELEMENTS_VUS`, `DERNIERE_EXECUTION`, `ALERTES_ENVOYEES`).

### 10. Requester's decisions (2026-10-22) built into this design

1. **Go-live prerequisite**: the "Veille CERT-FR" space must be created in **threaded** mode (checked by the manager before creating
   the webhook); otherwise "one thread per publication" is meaningless.
2. **Webhook 400**: the faulty item is **discarded** (memorised without posting), logged, and reported by a dedicated "publication
   rejected" e-mail (**at most one per day**); **other items continue**. **401, 403, 404 and missing webhook** stop all posting
   for the run.
3. **Bootstrap**: memory is written **after** the bootstrap message is accepted (200). 4. Bootstrap never posted in dry run: accepted.
5. `LANGUE` property (default `fr`): kept. 6. Thresholds: `CONFIG` constants overridable by property: kept.
7. `SEUIL_ECHEC_HEURES` in hours since the last successful read: kept.
8. **Silent feed**: **one single e-mail** at the start of the silence, then "restored"; no daily reminder.
9. `reinitialiserMemoire()`: refused unless the `CONFIRMER_REINITIALISATION` property equals `oui`; it is **reset to empty** after use.
10.-11. (non-CERT-FR link, `text` escaping, dark theme): checked at acceptance CA-19, no change.

---

## Annexe : textes FR/EN pour I18n.gs / Annex: FR/EN texts for I18n.gs

Convention du dépôt : clés en camelCase, paramètres `{0}`, `{1}`… via `t_(cle, langue, ...)`. Les listes (`mailActions*`) sont
des lignes séparées par `\n` que le code transforme en `<li>`. Les valeurs entre `{}` sont à échapper par le code **avant**
insertion (données du flux). `tBilingue_` : journal et diagnostic.

### A. Catégories

| Clé | FR | EN |
|---|---|---|
| `categorieAle` | Alerte | Alert |
| `categorieAvi` | Avis de sécurité | Security advisory |
| `categorieAct` | Bulletin d'actualité | News bulletin |
| `categorieCti` | Rapport de menace | Threat report |
| `categorieIoc` | Indicateurs de compromission | Indicators of compromise |
| `categorieDur` | Guide de durcissement | Hardening guide |
| `categorieInf` | Information | Information |
| `categorieAutre` | Autre | Other |

### B. Carte de publication

| Clé | FR | EN |
|---|---|---|
| `carteTitreEntete` | {0} {1} | {0} {1} |
| `carteSousTitre` | CERT-FR · {0} | CERT-FR · {0} |
| `carteBandeauAlerte` | {0} ALERTE — vulnérabilité exploitée ou critique : à examiner en priorité | {0} ALERT — exploited or critical vulnerability: review first |
| `carteEtiquetteCategorie` | Catégorie | Category |
| `carteEtiquetteDate` | Publié le | Published on |
| `carteBouton` | Consulter sur le CERT-FR | Read on CERT-FR |
| `carteLienHorsDomaine` | Lien non vérifié (hors domaine CERT-FR) : {0} | Unverified link (outside CERT-FR domain): {0} |
| `texteRepli` | {0} {1} — {2} — {3} | {0} {1} — {2} — {3} |

### C. Amorçage

| Clé | FR | EN |
|---|---|---|
| `amorcageTitre` | ✅ Veille CERT-FR active | ✅ CERT-FR watch active |
| `amorcageSousTitre` | Flux CERT-FR · relève toutes les heures | CERT-FR feed · polled every hour |
| `amorcageCorpsUne` | Les nouvelles publications du CERT-FR seront relayées ici, une par fil de discussion. 1 publication antérieure non reprise. | New CERT-FR publications will be relayed here, one per thread. 1 earlier publication not included. |
| `amorcageCorpsPlusieurs` | Les nouvelles publications du CERT-FR seront relayées ici, une par fil de discussion. {0} publications antérieures non reprises. | New CERT-FR publications will be relayed here, one per thread. {0} earlier publications not included. |
| `amorcageEtiquetteCategories` | Catégories relayées | Categories relayed |
| `amorcageToutes` | toutes | all |
| `amorcageLegende` | Repères visuels par catégorie | Visual markers by category |
| `amorcageRepli` | ✅ Veille CERT-FR active — {0} publication(s) antérieure(s) non reprise(s). | ✅ CERT-FR watch active — {0} earlier publication(s) not included. |

### D. Message de test

| Clé | FR | EN |
|---|---|---|
| `testTitre` | 🧪 TEST — Veille CERT-FR | 🧪 TEST — CERT-FR watch |
| `testSousTitre` | Message de test, aucune publication réelle | Test message, not a real publication |
| `testCorps` | Ce message valide le webhook de l'espace. Il ne correspond à aucune publication du CERT-FR et n'a aucun effet sur la mémoire du script. | This message validates the space webhook. It matches no CERT-FR publication and has no effect on the script memory. |
| `testEtiquetteMode` | Mode du script | Script mode |
| `testModeSimulation` | Simulation (DRY_RUN activé) : seul ce message de test est posté | Dry run (DRY_RUN on): only this test message is posted |
| `testModeReel` | Mode réel (DRY_RUN désactivé) | Live mode (DRY_RUN off) |
| `testEtiquetteDate` | Envoyé le | Sent on |
| `testBouton` | Ouvrir le site du CERT-FR | Open the CERT-FR website |
| `testRepli` | 🧪 TEST — Veille CERT-FR — message de test du {0}, à ignorer | 🧪 TEST — CERT-FR watch — test message of {0}, please ignore |

### E. E-mails

| Clé | FR | EN |
|---|---|---|
| `mailExpediteur` | Veille CERT-FR | CERT-FR watch |
| `mailSurtitre` | Veille CERT-FR · Alerte de fonctionnement | CERT-FR watch · Operational alert |
| `mailMotAlerte` | ALERTE | ALERT |
| `mailMotAttention` | ATTENTION | WARNING |
| `mailMotRetabli` | RÉTABLI | RESTORED |
| `mailObjetFluxEchec` | [Veille CERT-FR] ALERTE — flux CERT-FR illisible depuis {0} h | [CERT-FR watch] ALERT — CERT-FR feed unreadable for {0} h |
| `mailObjetWebhookRefuse` | [Veille CERT-FR] ALERTE — l'espace Chat refuse les publications | [CERT-FR watch] ALERT — the Chat space rejects posts |
| `mailObjetPublicationRefusee` | [Veille CERT-FR] ATTENTION — une publication a été refusée par Chat ({0}) | [CERT-FR watch] WARNING — a post was rejected by Chat ({0}) |
| `mailTitrePublicationRefusee` | Une publication a été refusée par Chat | A post was rejected by Chat |
| `mailCorpsPublicationRefusee` | Chat a refusé la publication {0} (HTTP 400, message invalide). L'élément est écarté et ne sera pas retenté ; les autres publications continuent. | Chat rejected the post {0} (HTTP 400, invalid message). The item is discarded and will not be retried; other posts continue. |
| `mailActionsPublicationRefusee` | Relever le détail au journal d'exécution (clé et taille du message).\nVérifier le contenu de l'élément sur le CERT-FR.\nSignaler le cas à l'équipe Google Workspace : un titre ou un résumé inattendu peut révéler un défaut de la carte.\nSi besoin, publier l'élément à la main dans l'espace. | Read the detail in the execution log (key and message size).\nCheck the item's content on CERT-FR.\nReport the case to the Google Workspace team: an unexpected title or summary may reveal a card defect.\nIf needed, post the item manually in the space. |
| `mailPiedUneFois` | Aucun rappel ne sera envoyé : un e-mail « rétabli » suivra à la première nouvelle publication. | No reminder will be sent: a "restored" e-mail will follow at the first new publication. |
| `mailPiedUneParJour` | Au plus un e-mail « publication refusée » par jour ; les éléments suivants restent au journal. | At most one "post rejected" e-mail per day; further items stay in the log. |
| `mailProblemePublicationRefusee` | Aucune publication refusée récemment | No recent rejected post |
| `mailEtiquetteReference` | Référence | Reference |
| `mailEtiquetteCategorie` | Catégorie | Category |
| `mailEtiquetteTaille` | Taille du message | Message size |
| `mailObjetWebhookAbsent` | [Veille CERT-FR] ALERTE — webhook Chat non configuré | [CERT-FR watch] ALERT — Chat webhook not configured |
| `mailObjetFluxMuet` | [Veille CERT-FR] ATTENTION — aucune nouvelle publication depuis {0} jours | [CERT-FR watch] WARNING — no new publication for {0} days |
| `mailObjetRetabli` | [Veille CERT-FR] Rétabli — {0} | [CERT-FR watch] Restored — {0} |
| `mailTitreFluxEchec` | Le flux CERT-FR est illisible depuis {0} h | The CERT-FR feed has been unreadable for {0} h |
| `mailTitreWebhookRefuse` | L'espace Chat refuse les publications | The Chat space rejects posts |
| `mailTitreWebhookAbsent` | Le webhook Chat n'est pas configuré | The Chat webhook is not configured |
| `mailTitreFluxMuet` | Aucune nouvelle publication depuis {0} jours | No new publication for {0} days |
| `mailTitreRetabli` | Retour à la normale | Back to normal |
| `mailCorpsFluxEchec` | Le flux du CERT-FR n'a pas pu être lu depuis {0} h. Aucune nouvelle publication n'est relayée dans l'espace Chat. Le flux ne garde que les derniers éléments : une panne longue peut faire manquer des publications. | The CERT-FR feed could not be read for {0} h. No new publication is relayed to the Chat space. The feed only keeps the latest items: a long outage can cause missed publications. |
| `mailCorpsWebhookRefuse` | L'espace Chat « Veille CERT-FR » a refusé la publication (HTTP {0}). Les publications de cette exécution sont suspendues ; elles seront retentées automatiquement dès que le webhook fonctionnera, dans la limite de {1} jours. | The "Veille CERT-FR" Chat space rejected the post (HTTP {0}). Posting is suspended for this run; items will be retried automatically once the webhook works, within {1} days. |
| `mailCorpsWebhookAbsent` | La propriété WEBHOOK_URL est absente ou n'a pas la forme attendue (https://chat.googleapis.com/v1/spaces/…). Aucune publication n'est faite. | The WEBHOOK_URL property is missing or malformed (https://chat.googleapis.com/v1/spaces/…). Nothing is posted. |
| `mailCorpsFluxMuet` | Le flux est lisible, mais aucune nouvelle publication n'a été vue depuis {0} jours, alors que le CERT-FR publie en général chaque jour ouvré. Aucun rappel ne sera envoyé. | The feed is readable, but no new publication has been seen for {0} days, while CERT-FR normally publishes every working day. No reminder will be sent. |
| `mailCorpsRetabli` | {0}. Problème signalé le {1}. Aucune action requise. | {0}. Problem reported on {1}. No action required. |
| `mailProblemeFluxEchec` | Le flux CERT-FR est de nouveau lisible | The CERT-FR feed is readable again |
| `mailProblemeWebhookRefuse` | L'espace Chat accepte de nouveau les publications | The Chat space accepts posts again |
| `mailProblemeWebhookAbsent` | Le webhook Chat est configuré | The Chat webhook is configured |
| `mailProblemeFluxMuet` | De nouvelles publications sont de nouveau reçues | New publications are being received again |
| `mailEtiquetteDepuis` | Depuis | Since |
| `mailEtiquetteDerniereLecture` | Dernière lecture réussie | Last successful read |
| `mailEtiquetteDerniereExecution` | Dernière exécution | Last run |
| `mailEtiquetteMode` | Mode | Mode |
| `mailEtiquetteHttp` | Code HTTP | HTTP code |
| `mailEtiquetteSeuil` | Seuil configuré | Configured threshold |
| `mailValeurModeReel` | Réel | Live |
| `mailValeurJamais` | jamais | never |
| `mailTitreActions` | À faire | To do |
| `mailTitreDetail` | Détail technique (support) | Technical detail (support) |
| `mailActionsFluxEchec` | Ouvrir le flux dans un navigateur : {0}.\nLancer diagnostiquer() depuis l'éditeur Apps Script.\nSi le code HTTP est 403, le site refuse peut-être Apps Script : prévenir l'équipe Google Workspace. | Open the feed in a browser: {0}.\nRun diagnostiquer() from the Apps Script editor.\nIf the HTTP code is 403, the site may be rejecting Apps Script: inform the Google Workspace team. |
| `mailActionsWebhookRefuse` | Vérifier que l'espace existe et que le webhook n'a pas été révoqué.\nCréer un nouveau webhook dans l'espace (Applications et intégrations > Webhooks).\nMettre à jour la propriété WEBHOOK_URL, puis lancer envoyerMessageTest(). | Check that the space exists and the webhook was not revoked.\nCreate a new webhook in the space (Apps & integrations > Webhooks).\nUpdate the WEBHOOK_URL property, then run envoyerMessageTest(). |
| `mailActionsWebhookAbsent` | Créer le webhook dans l'espace (Applications et intégrations > Webhooks).\nSaisir son URL dans la propriété WEBHOOK_URL (Paramètres du projet > Propriétés du script).\nLancer envoyerMessageTest() pour vérifier. | Create the webhook in the space (Apps & integrations > Webhooks).\nEnter its URL in the WEBHOOK_URL property (Project settings > Script properties).\nRun envoyerMessageTest() to check. |
| `mailActionsFluxMuet` | Consulter https://cert.cyber.gouv.fr/ pour vérifier que de nouvelles publications existent.\nLancer diagnostiquer() : vérifier la date du plus récent élément et les références reconnues.\nSi le site publie bien, vérifier l'URL du flux (propriété URL_FLUX). | Check https://cert.cyber.gouv.fr/ for new publications.\nRun diagnostiquer(): check the latest item date and recognised references.\nIf the site is publishing, check the feed URL (URL_FLUX property). |
| `mailPied` | Message automatique du script gws-chat-veille-cert-fr (compte {0}). Une même alerte est envoyée au plus toutes les 24 h. Aucune alerte n'est postée dans l'espace Chat. | Automatic message from the gws-chat-veille-cert-fr script (account {0}). The same alert is sent at most once every 24 h. No alert is posted to the Chat space. |

### F. Journal

| Clé | FR | EN |
|---|---|---|
| `journalFinExecution` | Exécution terminée | Run finished |
| `journalSimulationMessage` | SIMULATION — message non posté : cle={0} categorie={1} taille={2} octets titre="{3}" | DRY RUN — message not posted: cle={0} categorie={1} taille={2} bytes titre="{3}" |
| `journalSimulationJson` | SIMULATION — JSON du premier message : {0} | DRY RUN — first message JSON: {0} |
| `journalSimulationAmorcage` | SIMULATION — amorçage : {0} clés seraient mémorisées, 1 message d'amorçage serait posté | DRY RUN — bootstrap: {0} keys would be memorised, 1 bootstrap message would be posted |
| `journalAlerteSimulee` | SIMULATION — e-mail non envoyé : {0} | DRY RUN — e-mail not sent: {0} |
| `journalElementIgnore` | Élément ignoré : sans titre ou sans lien | Item skipped: no title or no link |
| `journalCategorieInconnue` | Catégorie inconnue : code={0} cle={1} | Unknown category: code={0} cle={1} |
| `journalDateIllisible` | Date illisible, heure de lecture utilisée : cle={0} | Unreadable date, read time used: cle={0} |
| `journalPublie` | Publié : cle={0} categorie={1} | Posted: cle={0} categorie={1} |
| `journalEchecPublication` | Échec de publication : cle={0} http={1} | Posting failed: cle={0} http={1} |
| `journalDeclencheurInstalle` | Déclencheur horaire installé sur relever() ; tout déclencheur précédent supprimé. | Hourly trigger installed on relever(); any previous trigger removed. |
| `journalDeclencheurSupprime` | {0} déclencheur(s) supprimé(s) sur relever(). | {0} trigger(s) removed from relever(). |
| `journalMemoireEffacee` | Mémoire effacée : le prochain lancement refera l'amorçage (un message d'information, aucune publication antérieure). Propriété CONFIRMER_REINITIALISATION remise à vide. | Memory cleared: the next run will bootstrap again (one information message, no earlier publication). CONFIRMER_REINITIALISATION property emptied. |
| `journalReinitialisationRefusee` | Réinitialisation refusée : saisir la propriété CONFIRMER_REINITIALISATION = oui, puis relancer. Rien n'a été modifié. | Reset refused: set the CONFIRMER_REINITIALISATION property to oui, then run again. Nothing was changed. |
| `journalPublicationRefusee` | Publication refusée (400), élément écarté : cle={0} taille={1} | Post rejected (400), item discarded: cle={0} taille={1} |
| `journalAmorcageRefuse` | Message d'amorçage refusé (HTTP {0}) : mémoire non écrite, amorçage refait à la prochaine exécution. | Bootstrap message rejected (HTTP {0}): memory not written, bootstrap redone at the next run. |
| `journalTest` | Message de test envoyé (HTTP {0}). | Test message sent (HTTP {0}). |

### G. Diagnostic

| Clé | FR | EN |
|---|---|---|
| `diagTitre` | Diagnostic Veille CERT-FR — {0} | CERT-FR watch diagnostic — {0} |
| `diagFin` | Fin du diagnostic | End of diagnostic |
| `diagStatutOk` / `diagStatutAttention` / `diagStatutErreur` / `diagStatutInfo` | OK / ATTENTION / ERREUR / INFO | OK / WARNING / ERROR / INFO |
| `diagMode` | Mode : DRY_RUN={0} | Mode: DRY_RUN={0} |
| `diagFlux` | Flux : HTTP {0} · URL finale {1} ({2}) | Feed: HTTP {0} · final URL {1} ({2}) |
| `diagRedirection` / `diagSansRedirection` | redirection suivie / pas de redirection | redirect followed / no redirect |
| `diagElements` | Éléments : {0} lus, {1} ignorés | Items: {0} read, {1} skipped |
| `diagCategories` | Catégories : {0} | Categories: {0} |
| `diagPlusRecent` | Plus récent : {0} | Latest: {0} |
| `diagReferencesInconnues` | Références non reconnues : {0} (classées « Autre ») | Unrecognised references: {0} (classed "Other") |
| `diagWebhookOk` | WEBHOOK_URL : présente, forme valide ({0}) | WEBHOOK_URL: present, valid format ({0}) |
| `diagWebhookAbsent` | WEBHOOK_URL : absente | WEBHOOK_URL: missing |
| `diagWebhookInvalide` | WEBHOOK_URL : forme invalide (attendu : https://chat.googleapis.com/v1/spaces/…) | WEBHOOK_URL: invalid format (expected: https://chat.googleapis.com/v1/spaces/…) |
| `diagCategoriesFiltre` | CATEGORIES : {0} | CATEGORIES: {0} |
| `diagMemoire` | Mémoire : {0} clés (sur {1} au plus), environ {2} Ko | Memory: {0} keys (max {1}), about {2} KB |
| `diagDeclencheurOk` | Déclencheur : 1 déclencheur horaire sur relever() | Trigger: 1 hourly trigger on relever() |
| `diagDeclencheurAucun` | Déclencheur : aucun (lancer installerDeclencheur()) | Trigger: none (run installerDeclencheur()) |
| `diagDeclencheurDoublon` | Déclencheur : {0} déclencheurs sur relever() (lancer installerDeclencheur()) | Trigger: {0} triggers on relever() (run installerDeclencheur()) |
| `diagDerniereExecution` | Dernière exécution : {0} · {1} · dernière lecture réussie {2} | Last run: {0} · {1} · last successful read {2} |
| `diagAucuneExecution` | Dernière exécution : aucune | Last run: none |
| `diagScopes` | Scopes : {0} | Scopes: {0} |
| `diagFluxErreur` | Flux : {0} | Feed: {0} |

### H. Messages d'erreur et d'avertissement

| Clé | FR | EN |
|---|---|---|
| `erreurVerrou` | Une autre exécution est en cours : celle-ci est abandonnée. | Another run is in progress: this one is abandoned. |
| `erreurFluxHttp` | Le flux CERT-FR ne répond pas correctement — HTTP {0} après {1} essais. | The CERT-FR feed is not responding properly — HTTP {0} after {1} attempts. |
| `erreurFluxXml` | Le flux CERT-FR n'est pas un flux RSS lisible — {0} | The CERT-FR feed is not a readable RSS feed — {0} |
| `erreurFluxVide` | Le flux CERT-FR ne contient aucune publication exploitable. | The CERT-FR feed contains no usable publication. |
| `erreurWebhookRefuse` | L'espace Chat refuse les publications (webhook révoqué, espace supprimé ou accès refusé) — HTTP {0}. | The Chat space rejects posts (revoked webhook, deleted space or access denied) — HTTP {0}. |
| `erreurPublicationRefusee` | Chat refuse cette publication (message invalide) — HTTP 400 ; élément écarté, les autres continuent. | Chat rejects this post (invalid message) — HTTP 400; item discarded, others continue. |
| `avertReinitialisationRefusee` | Réinitialisation refusée : confirmation absente. | Reset refused: confirmation missing. |
| `erreurWebhookTransitoire` | L'espace Chat est momentanément indisponible — HTTP {0} ; nouvel essai à la prochaine exécution. | The Chat space is temporarily unavailable — HTTP {0}; retry at the next run. |
| `erreurWebhookNonConfigure` | WEBHOOK_URL est absente ou mal formée : aucune publication possible. | WEBHOOK_URL is missing or malformed: nothing can be posted. |
| `infoWebhookNonConfigureSimulation` | WEBHOOK_URL absente ou mal formée (sans conséquence en simulation). | WEBHOOK_URL missing or malformed (harmless in dry run). |
| `avertGardeTemps` | Arrêt avant la limite de temps : les publications restantes seront traitées à l'exécution suivante. | Stopped before the time limit: remaining items will be handled at the next run. |
| `avertAdresseAlerte` | ADRESSE_ALERTE invalide : e-mails envoyés au propriétaire du script. | ADRESSE_ALERTE invalid: e-mails sent to the script owner. |
| `avertCategoriesInconnues` | CATEGORIES contient des codes inconnus ignorés : {0}. | CATEGORIES contains unknown codes, ignored: {0}. |

## Fin de document / End of document

- Aucun `.gs` produit. `dev-gas` code sans autre décision d'ergonomie que celles listées ci-dessus ; les points du §14 attendent
  l'arbitrage du demandeur. / No `.gs` produced; open points of section 14 await the requester's decision.
