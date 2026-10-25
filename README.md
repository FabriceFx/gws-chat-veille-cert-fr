# GWS – Chat – Veille CERT-FR dans un espace Google Chat

Dépôt / Repository : [`fabricefx-group/gws-chat-veille-cert-fr`](https://gitlab.com/fabricefx-group/gws-chat-veille-cert-fr)  
Wiki : [`fabricefx-group/gws-chat-veille-cert-fr/-/wikis`](https://gitlab.com/fabricefx-group/gws-chat-veille-cert-fr/-/wikis/home)

- [Français](#français)
- [English](#english)

---

## Français

### Ce que fait le script

Le script est **autonome** (sans classeur). Toutes les heures, il lit le flux RSS public du CERT-FR
(`https://cert.cyber.gouv.fr/feed/`), déduit la catégorie de chaque publication à partir de sa référence
`CERTFR-AAAA-CODE-NNN`, écarte celles déjà vues et publie chaque **nouvelle** publication, une seule fois, sous forme de
**carte** dans l'espace Google Chat « Veille CERT-FR » de la DSI. La publication passe par un **webhook entrant** : aucun
scope Chat n'est nécessaire. Chaque publication ouvre son propre fil de discussion. Les alertes de fonctionnement
partent **par e-mail**, jamais dans l'espace.

Le script ne juge pas la pertinence d'une publication (« l'organisation est-elle concernée ? ») : il relaie, l'équipe décide.
Il ne reproduit que le titre, un résumé court (300 caractères) et le lien vers le texte officiel.

**Catégories et repères visuels.** Chaque catégorie a un émoji de forme distincte, un libellé écrit et une couleur.
La couleur n'est qu'un renfort. Une catégorie inconnue est classée « Autre » et signalée au journal.

| Code | Catégorie | Repère | Remarque |
|---|---|---|---|
| `ALE` | Alerte | 🚨 | Libellé en capitales, bandeau d'alerte en tête de carte |
| `AVI` | Avis de sécurité | 🛡️ | 4 à 6 par jour ouvré |
| `ACT` | Bulletin d'actualité | 📰 | Hebdomadaire |
| `CTI` | Rapport de menace | 🕵️ | |
| `IOC` | Indicateurs de compromission | 🔎 | |
| `DUR` | Guide de durcissement | 🔒 | |
| `INF` | Information | ℹ️ | |
| — | Autre | ❔ | Code inconnu |

**Contenu d'une carte** : en-tête (repère et catégorie, référence), titre en gras, ligne « Catégorie », date de
publication (heure de Paris), résumé s'il existe, bouton « Consulter sur le CERT-FR ». Le bouton n'existe que pour un
lien `https` d'un domaine CERT-FR (`cert.cyber.gouv.fr`, `cert.ssi.gouv.fr`) ; sinon le lien est affiché en texte non
cliquable. Tout texte venant du flux est échappé (`&`, `<`, `>`) avant insertion.

**Fonctionnement**

- **Relève horaire**, 7 jours sur 7. Les nouvelles publications sont postées du plus ancien au plus récent, 20 au plus par
  exécution (le reste à l'exécution suivante), avec 1,1 s d'écart.
- **Anti-doublon** : la clé est la référence CERT-FR (ou, à défaut, le `guid`, puis le lien normalisé). La mémoire, bornée
  à 300 clés, est la propriété `ELEMENTS_VUS`. Une clé n'est mémorisée qu'après la réponse 200 du webhook. Une publication
  déjà vue n'est jamais republiée, même si le CERT-FR la met à jour.
- **Filtres** : la propriété `CATEGORIES` limite les catégories publiées. Une publication filtrée, ou plus ancienne que
  `AGE_MAX_JOURS` jours, est mémorisée sans être publiée.
- **Premier lancement** : aucune publication antérieure n'est reprise. Le script poste **un seul message d'information**
  (avec la légende des repères visuels), puis mémorise les clés du flux, **seulement après** l'acceptation de ce message.
- **Simulation (`DRY_RUN`)** : vrai par défaut. Le flux est réellement lu, le calcul est complet, mais **aucun message
  n'est posté**, la mémoire n'est pas modifiée et aucun e-mail n'est envoyé. Le journal liste chaque message qui serait
  posté et le JSON du premier.
- **Erreurs** : nouvel essai (3 essais, attente de 1 s, 2 s, 4 s) sur 429, 5xx et délai dépassé. Une réponse 400 du webhook
  écarte le seul élément fautif (mémorisé sans publication, un e-mail par jour au plus) et la publication continue. Les
  réponses 401, 403, 404 ou un webhook absent arrêtent toutes les publications de l'exécution.
- **Alertes par e-mail** (`MailApp`), jamais dans Chat : flux illisible depuis plus de `SEUIL_ECHEC_HEURES` heures,
  webhook refusé, webhook non configuré, publication refusée, flux muet depuis plus de `SEUIL_SILENCE_JOURS` jours (un seul
  e-mail, sans rappel), puis e-mail « rétabli ». Une même alerte part au plus toutes les 24 h. Aucune alerte en simulation.
- **Sécurité des exécutions** : verrou de script (30 s), garde de temps (arrêt propre avant 5 min : un message n'est
  démarré que si son pire cas tient avant cette limite), URL du webhook toujours masquée dans le journal et les e-mails.

| Sortie | Contenu |
|---|---|
| Messages Chat | Une carte par publication ; un message d'amorçage au premier lancement ; un message « TEST » sur demande |
| E-mails | Alertes de fonctionnement à `ADRESSE_ALERTE` |
| Journal d'exécution | Une ligne de synthèse par exécution (`resultat`, `mode`, `dryRun`, `lus`, `nouveaux`, `publies`, `echecs`…), lignes de détail, sans secret |
| Propriétés du script | `ELEMENTS_VUS`, `DERNIERE_EXECUTION`, `ALERTES_ENVOYEES` (écrites par le script) |

### Fichiers

| Fichier | Contenu |
|---|---|
| `src/appsscript.json` | Manifeste : V8, Europe/Paris, trois scopes explicites, `urlFetchWhitelist`, aucun service avancé |
| `src/Config.gs` | `CONFIG` figé : `DRY_RUN`, réglages et seuils, repères visuels, noms des propriétés |
| `src/I18n.gs` | Textes FR / EN : cartes, e-mails, journal, diagnostic ; `t_`, `tBilingue_` |
| `src/Main.gs` | Points d'entrée : `relever`, `installerDeclencheur`, `supprimerDeclencheur`, `envoyerMessageTest`, `reinitialiserMemoire`, `aPropos` |
| `src/Traitement.gs` | Déroulé d'une exécution : verrou, filtres, amorçage, publication, garde de temps, synthèse |
| `src/Analyse.gs` | Lecture du flux RSS (`XmlService`), références, catégories, clés, nettoyage des champs |
| `src/Cartes.gs` | Construction des cartes `cardsV2` (publication, amorçage, test) et du texte de repli |
| `src/Publication.gs` | Envoi au webhook, interprétation des codes HTTP, mémoire anti-doublon |
| `src/Alertes.gs` | E-mails d'alerte (flux, webhook, refus, flux muet, rétabli) et état `ALERTES_ENVOYEES` |
| `src/Services.gs` | Appels `UrlFetchApp` avec nouvel essai, propriétés, déclencheurs, `MailApp` |
| `src/Utils.gs` | Horloge, dates, masquage des secrets, verrou, garde de temps |
| `src/Diagnostic.gs` | Sections de `diagnostiquer()` |
| `src/Tests.gs` | `diagnostiquer()` et `testerSansApi()` |
| `tests/banc.js` | Banc Node (simulation des services), **35 tests** |
| `design.md` | Dossier de conception technique (cartes, e-mails, journal, repères visuels) |
| `CHANGELOG.md` | Historique des versions (Keep a Changelog) |
| `LICENSE` | Licence open source MIT |
| `.clasp.json.example` | Modèle de configuration clasp sans identifiant |
| `.gitlab-ci.yml` | Pipeline CI/CD GitLab (tests automatisés, SAST, détection de secrets) |

### Prérequis

| Élément | Détail |
|---|---|
| Script | Script **autonome**, propriété d'un compte technique dédié (ex. `compte-technique@domaine.com`). Pas de classeur. |
| Rôle admin | Aucun rôle d'administration Workspace pour l'exécution. Prérequis ponctuel : un **super admin** (ou un rôle délégué avec le privilège « Paramètres des services > Google Chat ») vérifie que les **webhooks entrants** sont autorisés (console d'administration > Applications > Google Workspace > Google Chat > Paramètres des applications Chat), pour l'unité organisationnelle du gestionnaire de l'espace. |
| Espace Chat | Espace « Veille CERT-FR » en **mode fils de discussion** ; son gestionnaire crée le webhook. |
| Service avancé | Aucun. |
| Scopes | `script.external_request` : lire le flux CERT-FR et poster vers le webhook. `script.scriptapp` : installer et supprimer le déclencheur horaire. `script.send_mail` : envoyer les alertes de fonctionnement avec `MailApp`. Aucun scope Chat, Gmail, Drive ni Admin SDK. |
| `urlFetchWhitelist` | `https://cert.cyber.gouv.fr/`, `https://www.cert.cyber.gouv.fr/`, `https://cert.ssi.gouv.fr/`, `https://www.cert.ssi.gouv.fr/`, `https://chat.googleapis.com/v1/spaces/`. Si `diagnostiquer()` montre que le flux redirige vers un autre domaine, **ajouter ce domaine** dans `appsscript.json`. |
| Contrôle d'accès | Si la stratégie « Contrôle des accès des applications » restreint les scopes, autoriser ce projet. |

Le scope `userinfo.email` n'est volontairement pas déclaré. Le script ne peut donc pas lire de façon fiable l'adresse du
compte qui l'exécute : **renseignez toujours `ADRESSE_ALERTE`**. Sans elle, les alertes n'ont pas de destinataire garanti.

**Propriétés du script** (Paramètres du projet > Propriétés du script)

| Propriété | Défaut | Rôle |
|---|---|---|
| `WEBHOOK_URL` | (vide) | **Secret.** URL du webhook de l'espace, de la forme `https://chat.googleapis.com/v1/spaces/…`. Ne jamais la copier dans le dépôt, un ticket ou un message. |
| `ADRESSE_ALERTE` | (vide) | **À renseigner** : destinataire des e-mails d'alerte (ex. `alerte@exemple.test`). |
| `DRY_RUN` | `true` (`CONFIG`) | `false` (minuscules) pour publier ; toute autre valeur = simulation. |
| `LANGUE` | `fr` | `fr` ou `en` : langue des cartes et des e-mails. Valeur inconnue = `fr`. Le contenu CERT-FR reste en français. |
| `CATEGORIES` | (vide = toutes) | Codes séparés par des virgules, ex. `ALE,AVI,CTI`. Codes inconnus ignorés et signalés. |
| `URL_FLUX` | `https://cert.cyber.gouv.fr/feed/` | Surcharge de l'adresse du flux (`https` obligatoire). |
| `AGE_MAX_JOURS` | `7` | Ancienneté maximale d'une publication relayée. |
| `MAX_PUBLICATIONS_PAR_EXECUTION` | `20` | Plafond de messages par exécution. |
| `MEMOIRE_MAX` | `300` | Clés conservées (plafonnées à 350 pour tenir dans 9 Ko). |
| `SEUIL_ECHEC_HEURES` | `6` | Heures depuis la dernière lecture réussie avant l'alerte « flux en échec ». |
| `SEUIL_SILENCE_JOURS` | `5` | Jours sans nouvel élément avant l'alerte « flux muet ». |
| `CONFIRMER_REINITIALISATION` | (vide) | `oui` autorise **un** appel de `reinitialiserMemoire()` ; le script la remet à vide ensuite. |

Pour les cinq seuils numériques, une valeur non entière ou inférieure à 1 est ignorée : la valeur de `CONFIG` s'applique
et un avertissement apparaît au journal et au diagnostic. `ELEMENTS_VUS`, `DERNIERE_EXECUTION` et `ALERTES_ENVOYEES` sont
écrites par le script : ne pas les modifier à la main.

### Installation

Le déploiement s'effectue via clasp en liant votre propre projet Apps Script (voir étape 4).

1. **Espace Chat.** Dans l'espace « Veille CERT-FR », vérifier qu'il est en mode **fils de discussion**. Sinon, « un fil par
   publication » ne s'applique pas.
2. **Console d'administration.** Faire vérifier par un super admin que les webhooks entrants sont autorisés (voir
   Prérequis).
3. **Webhook.** Le gestionnaire de l'espace crée un webhook nommé « CERT-FR » (Applications et intégrations > Webhooks) et
   copie son URL.
4. **Script.** Créer un projet **autonome** dans Apps Script, copier `.clasp.json.example` vers `.clasp.json` (fichier ignoré par Git) et y renseigner votre identifiant de script (Paramètres du projet > Identifiant du script) ; ne pas utiliser `clasp create`, qui réécrit `src/appsscript.json`.
5. **Déploiement.** Cloner le dépôt et déployer avec clasp :

   ```bash
   git clone https://gitlab.com/fabricefx-group/gws-chat-veille-cert-fr.git
   cd gws-chat-veille-cert-fr
   clasp push -f        # envoie src/ et le manifeste (remplace le contenu de l'éditeur)
   ```

6. **Propriétés.** Dans l'éditeur, Paramètres du projet > Propriétés du script : saisir `WEBHOOK_URL` et
   `ADRESSE_ALERTE`. Laisser `DRY_RUN` absente (simulation).
7. **Autorisation et diagnostic.** Lancer `diagnostiquer()` : la première exécution demande l'autorisation des trois
   scopes. Vérifier dans le journal : flux HTTP 200, URL finale (ajouter son domaine à `urlFetchWhitelist` si elle sort
   des domaines CERT-FR), catégories reconnues pour tous les éléments, `WEBHOOK_URL` « présente, forme valide »,
   `ADRESSE_ALERTE` « OK », scopes.
8. **Simulation.** Lancer `relever()` : le journal liste les messages qui seraient postés. Rien n'est posté.
9. **Message de test.** Lancer `envoyerMessageTest()` : un message « 🧪 TEST » doit apparaître dans l'espace, avec son
   propre fil. Contrôler aussi le texte de repli (notification), le thème sombre et les liens rendus cliquables par Chat.
10. **Déclencheur.** Lancer `installerDeclencheur()` : un seul déclencheur horaire sur `relever()`.
11. **Passage en réel.** Ajouter la propriété `DRY_RUN` = `false` (aucune modification du code). Le premier lancement réel
    poste le message d'amorçage, mémorise le flux, puis relaie les nouvelles publications à chaque heure.

### Utilisation

Aucun menu : les fonctions se lancent depuis l'éditeur Apps Script (liste déroulante des fonctions, **Exécuter**).

| Fonction | Rôle |
|---|---|
| `relever()` | Relève et publie. Appelée par le déclencheur ; peut aussi être lancée à la main (`mode=manuel`). |
| `installerDeclencheur()` | Crée **un seul** déclencheur horaire sur `relever()` (supprime d'abord les précédents). |
| `supprimerDeclencheur()` | Retire le déclencheur de `relever()`. |
| `envoyerMessageTest()` | Poste un message « TEST », **même en simulation**, sans toucher à la mémoire. Lève une erreur si le webhook est absent ou refusé. |
| `reinitialiserMemoire()` | Efface `ELEMENTS_VUS` (nouvel amorçage au prochain lancement). Exige `CONFIRMER_REINITIALISATION` = `oui` ; sinon rien n'est modifié et le journal explique la marche à suivre. |
| `diagnostiquer()` | Diagnostic en lecture seule, sans aucun POST : flux, `WEBHOOK_URL` (masquée), réglages effectifs et leur origine, mémoire, déclencheur, dernière exécution, scopes. |
| `testerSansApi()` | Tests rapides sans API réelle (références, catégories, textes, cartes, réglages). |
| `aPropos()` | Affiche les informations sur le script et mentionne le développeur. |

**Lire les résultats.** Ouvrir Exécutions dans l'éditeur. Chaque exécution écrit une ligne de synthèse :

```
[Veille CERT-FR] Exécution terminée / Run finished | resultat=ok | mode=declencheur | dryRun=false | duree=4s | lus=32 | nouveaux=3 | publies=3 | echecs=0 | reportes=0 | alertes=aucune
```

`resultat` vaut `ok`, `amorcage`, `partiel`, `echec_flux`, `webhook_refuse`, `webhook_absent`, `verrou_non_obtenu`,
`garde_temps` ou `simulation`. Dans `diagnostiquer()`, chaque ligne commence par un mot-état : `OK`, `ATTENTION`,
`ERREUR`, `INFO`.

**Mode simulation et passage en réel.** Tant que `DRY_RUN` n'est pas `false`, le script ne poste rien (sauf
`envoyerMessageTest()`). Pour repasser en simulation, supprimer la propriété `DRY_RUN` ou la mettre à `true`. Le code
versionné garde `DRY_RUN: true`.

**Changer de webhook** (fuite, espace recréé) : le gestionnaire révoque l'ancien webhook et en crée un autre ; mettre à
jour `WEBHOOK_URL`, puis lancer `envoyerMessageTest()`.

### Tests

```bash
node tests/banc.js # banc de test unitaire (--verbeux pour le détail)
```

Le banc compte **35 tests** et n'appelle aucune vraie API. Il simule `UrlFetchApp` (flux fictifs `CERTFR-2099-…`, codes
HTTP, `Retry-After`), `XmlService`, `PropertiesService`, `LockService`, `MailApp`, `ScriptApp`, `Session`, l'horloge et
`Utilities.sleep`, avec une URL de webhook inventée. Il couvre l'analyse du flux et des catégories, l'anti-doublon, les
filtres, le premier lancement, la simulation, le plafond et l'ordre de publication, la reprise après échec, les codes 400,
401, 403, 404, 429 et 5xx, les alertes (flux en échec, flux muet, rétabli), le masquage des secrets, la réinitialisation
confirmée, les réglages et la langue, la garde de temps et le diagnostic.

**Non testable hors API** : le rendu réel des cartes dans Chat (mode fils, thème sombre, liens automatiques), la
structure réelle du flux et son éventuel refus des appels d'Apps Script, la distribution des e-mails, l'autorisation OAuth.
C'est l'objet de la recette réelle (critère CA-19) : `diagnostiquer()` sur le vrai flux, simulation, message de
test.

### Limites connues

- **Profondeur du flux** : le flux ne garde que les derniers éléments. Une panne plus longue que sa couverture fait manquer
  des publications ; l'alerte « flux en échec » part après `SEUIL_ECHEC_HEURES` heures.
- **Quotas** : environ 1 message par seconde et par espace (d'où la pause de 1,1 s) ; 6 minutes par exécution (garde de
  temps à 5 min, le reste est repris à l'exécution suivante) ; propriété du script limitée à 9 Ko par valeur.
- **Volumétrie** : 24 lectures par jour ; 5 à 8 messages par jour ouvré, 20 à 30 les jours de correctifs éditeurs. Au-delà de
  20 nouveaux éléments en une heure, le reste est reporté.
- **Mises à jour** : une alerte mise à jour par le CERT-FR n'est pas republiée.
- **Un seul flux, un seul espace** ; pas de mise en avant par mots-clés, pas de `@all`, pas de bouton interactif (un
  webhook ne traite pas les clics).
- **Accès au flux** : le site peut refuser les appels d'Apps Script (403) ; l'alerte « flux en échec » le signale.
- **Adresse d'alerte** : sans `ADRESSE_ALERTE`, le destinataire de repli (compte exécutant) peut être illisible.
- **Statut** : outil interne DSI, livré en simulation ; la recette réelle (CA-19) reste à faire.

### À propos

Développé par **Fabrice Faucheux** ([https://faucheux.bzh](https://faucheux.bzh)).

### Licence

Ce projet est sous licence [MIT](LICENSE).

---

## English

### What the script does

The script is **standalone** (no spreadsheet). Every hour it reads the public CERT-FR RSS feed
(`https://cert.cyber.gouv.fr/feed/`), derives each publication's category from its `CERTFR-YYYY-CODE-NNN` reference,
skips those already seen and posts each **new** publication, once, as a **card** in the IT department's "Veille CERT-FR"
Google Chat space. Posting uses an **incoming webhook**: no Chat scope is needed. Each publication opens its own thread.
Operational alerts go **by e-mail**, never to the space.

The script does not judge relevance ("is the organization affected?"): it relays, the team decides. It only reproduces the title, a
short summary (300 characters) and the link to the official text.

**Categories and visual markers.** Each category has a distinct-shape emoji, a written label and a colour. Colour is only
a reinforcement. An unknown category is classed "Other" and logged.

| Code | Category | Marker | Note |
|---|---|---|---|
| `ALE` | Alert | 🚨 | Upper-case label, alert banner at the top of the card |
| `AVI` | Security advisory | 🛡️ | 4 to 6 per working day |
| `ACT` | News bulletin | 📰 | Weekly |
| `CTI` | Threat report | 🕵️ | |
| `IOC` | Indicators of compromise | 🔎 | |
| `DUR` | Hardening guide | 🔒 | |
| `INF` | Information | ℹ️ | |
| — | Other | ❔ | Unknown code |

**Card content**: header (marker and category, reference), bold title, "Category" line, publication date (Paris time),
summary if any, "Read on CERT-FR" button. The button only exists for an `https` link on a CERT-FR domain
(`cert.cyber.gouv.fr`, `cert.ssi.gouv.fr`); otherwise the link is shown as non-clickable text. Every feed value is escaped
(`&`, `<`, `>`) before insertion.

**How it works**

- **Hourly polling**, 7 days a week. New publications are posted oldest first, at most 20 per run (the rest on the next
  run), 1.1 s apart.
- **De-duplication**: the key is the CERT-FR reference (otherwise the `guid`, then the normalised link). The memory,
  limited to 300 keys, is the `ELEMENTS_VUS` property. A key is stored only after the webhook answers 200. A publication
  already seen is never reposted, even if CERT-FR updates it.
- **Filters**: the `CATEGORIES` property limits the categories posted. A filtered publication, or one older than
  `AGE_MAX_JOURS` days, is stored without being posted.
- **First run**: no earlier publication is relayed. The script posts **a single information message** (with the legend of
  the visual markers), then stores the feed keys **only after** that message is accepted.
- **Dry run (`DRY_RUN`)**: true by default. The feed is really read and the computation is complete, but **nothing is
  posted**, the memory is unchanged and no e-mail is sent. The log lists every message that would be posted and the JSON of
  the first one.
- **Errors**: retry (3 attempts, waits of 1 s, 2 s, 4 s) on 429, 5xx and timeouts. A 400 from the webhook discards only the
  faulty item (stored without posting, at most one e-mail per day) and posting continues. 401, 403, 404 or a missing
  webhook stop all posting for the run.
- **E-mail alerts** (`MailApp`), never in Chat: feed unreadable for more than `SEUIL_ECHEC_HEURES` hours, webhook rejected,
  webhook not configured, post rejected, silent feed for more than `SEUIL_SILENCE_JOURS` days (one e-mail, no reminder),
  then a "restored" e-mail. The same alert is sent at most every 24 h. No alert in dry run.
- **Run safety**: script lock (30 s), time guard (clean stop before 5 min: a message only starts if its worst case fits
  before that limit), webhook URL always masked in the log and e-mails.

| Output | Content |
|---|---|
| Chat messages | One card per publication; a bootstrap message on first run; a "TEST" message on demand |
| E-mails | Operational alerts to `ADRESSE_ALERTE` |
| Execution log | One summary line per run (`resultat`, `mode`, `dryRun`, `lus`, `nouveaux`, `publies`, `echecs`…), detail lines, no secret |
| Script properties | `ELEMENTS_VUS`, `DERNIERE_EXECUTION`, `ALERTES_ENVOYEES` (written by the script) |

### Files

| File | Content |
|---|---|
| `src/appsscript.json` | Manifest: V8, Europe/Paris, three explicit scopes, `urlFetchWhitelist`, no advanced service |
| `src/Config.gs` | Frozen `CONFIG`: `DRY_RUN`, settings and thresholds, visual markers, property names |
| `src/I18n.gs` | FR / EN texts: cards, e-mails, log, diagnostic; `t_`, `tBilingue_` |
| `src/Main.gs` | Entry points: `relever`, `installerDeclencheur`, `supprimerDeclencheur`, `envoyerMessageTest`, `reinitialiserMemoire`, `aPropos` |
| `src/Traitement.gs` | Run flow: lock, filters, bootstrap, posting, time guard, summary |
| `src/Analyse.gs` | RSS feed reading (`XmlService`), references, categories, keys, field cleaning |
| `src/Cartes.gs` | `cardsV2` card building (publication, bootstrap, test) and fallback text |
| `src/Publication.gs` | Webhook posting, HTTP code handling, de-duplication memory |
| `src/Alertes.gs` | Alert e-mails (feed, webhook, rejection, silent feed, restored) and `ALERTES_ENVOYEES` state |
| `src/Services.gs` | `UrlFetchApp` calls with retry, properties, triggers, `MailApp` |
| `src/Utils.gs` | Clock, dates, secret masking, lock, time guard |
| `src/Diagnostic.gs` | `diagnostiquer()` sections |
| `src/Tests.gs` | `diagnostiquer()` and `testerSansApi()` |
| `tests/banc.js` | Node bench (simulated services), **35 tests** |
| `design.md` | Technical design (cards, e-mails, log, visual markers) |
| `CHANGELOG.md` | Version history (Keep a Changelog) |
| `LICENSE` | Open source MIT License |
| `.clasp.json.example` | clasp configuration template without credentials |
| `.gitlab-ci.yml` | GitLab CI/CD pipeline (automated tests, SAST, secret detection) |

### Prerequisites

| Item | Detail |
|---|---|
| Script | **Standalone** script owned by a dedicated technical account (e.g. `compte-technique@domaine.com`). No spreadsheet. |
| Admin role | No Workspace admin role for execution. One-off prerequisite: a **super admin** (or a delegated role with the "Services settings > Google Chat" privilege) checks that **incoming webhooks** are allowed (Admin console > Apps > Google Workspace > Google Chat > Chat apps settings) for the space manager's organizational unit. |
| Chat space | "Veille CERT-FR" space in **threaded** mode; its manager creates the webhook. |
| Advanced service | None. |
| Scopes | `script.external_request`: read the CERT-FR feed and post to the webhook. `script.scriptapp`: install and remove the hourly trigger. `script.send_mail`: send operational alerts with `MailApp`. No Chat, Gmail, Drive or Admin SDK scope. |
| `urlFetchWhitelist` | `https://cert.cyber.gouv.fr/`, `https://www.cert.cyber.gouv.fr/`, `https://cert.ssi.gouv.fr/`, `https://www.cert.ssi.gouv.fr/`, `https://chat.googleapis.com/v1/spaces/`. If `diagnostiquer()` shows the feed redirecting to another domain, **add that domain** to `appsscript.json`. |
| Access control | If the "API controls" policy restricts scopes, allow this project. |

The `userinfo.email` scope is deliberately not declared. The script therefore cannot reliably read the address of the
account running it: **always set `ADRESSE_ALERTE`**. Without it, alerts have no guaranteed recipient.

**Script properties** (Project settings > Script properties)

| Property | Default | Role |
|---|---|---|
| `WEBHOOK_URL` | (empty) | **Secret.** Space webhook URL, shaped `https://chat.googleapis.com/v1/spaces/…`. Never copy it into the repository, a ticket or a message. |
| `ADRESSE_ALERTE` | (empty) | **Set it**: recipient of alert e-mails (e.g. `alerte@exemple.test`). |
| `DRY_RUN` | `true` (`CONFIG`) | `false` (lower case) to post; any other value = dry run. |
| `LANGUE` | `fr` | `fr` or `en`: language of cards and e-mails. Unknown value = `fr`. CERT-FR content stays in French. |
| `CATEGORIES` | (empty = all) | Comma-separated codes, e.g. `ALE,AVI,CTI`. Unknown codes are ignored and reported. |
| `URL_FLUX` | `https://cert.cyber.gouv.fr/feed/` | Feed address override (`https` required). |
| `AGE_MAX_JOURS` | `7` | Maximum age of a relayed publication. |
| `MAX_PUBLICATIONS_PAR_EXECUTION` | `20` | Messages per run cap. |
| `MEMOIRE_MAX` | `300` | Keys kept (capped at 350 to fit in 9 KB). |
| `SEUIL_ECHEC_HEURES` | `6` | Hours since the last successful read before the "feed failing" alert. |
| `SEUIL_SILENCE_JOURS` | `5` | Days without a new item before the "silent feed" alert. |
| `CONFIRMER_REINITIALISATION` | (empty) | `oui` allows **one** `reinitialiserMemoire()` call; the script empties it afterwards. |

For the five numeric thresholds, a non-integer value or one below 1 is ignored: the `CONFIG` value applies and a warning
appears in the log and the diagnostic. `ELEMENTS_VUS`, `DERNIERE_EXECUTION` and `ALERTES_ENVOYEES` are written by the
script: do not edit them by hand.

### Installation

Deployment is done via clasp by binding your own Apps Script project (see step 4).

1. **Chat space.** Check that the "Veille CERT-FR" space is in **threaded** mode. Otherwise "one thread per publication"
   does not apply.
2. **Admin console.** Ask a super admin to check that incoming webhooks are allowed (see Prerequisites).
3. **Webhook.** The space manager creates a webhook named "CERT-FR" (Apps & integrations > Webhooks) and copies its URL.
4. **Script.** Create a **standalone** project in Apps Script, copy `.clasp.json.example` to `.clasp.json` (Git-ignored file) and paste your script ID into it (Project settings > Script ID); do not use `clasp create`, which rewrites `src/appsscript.json`.
5. **Deployment.** Clone the repository and deploy with clasp:

   ```bash
   git clone https://gitlab.com/fabricefx-group/gws-chat-veille-cert-fr.git
   cd gws-chat-veille-cert-fr
   clasp push -f        # sends src/ and the manifest (replaces the editor content)
   ```

6. **Properties.** In the editor, Project settings > Script properties: set `WEBHOOK_URL` and `ADRESSE_ALERTE`. Leave
   `DRY_RUN` unset (dry run).
7. **Authorisation and diagnostic.** Run `diagnostiquer()`: the first run asks to authorise the three scopes. Check the log:
   feed HTTP 200, final URL (add its domain to `urlFetchWhitelist` if it leaves the CERT-FR domains), categories
   recognised for every item, `WEBHOOK_URL` "present, valid form", `ADRESSE_ALERTE` "OK", scopes.
8. **Dry run.** Run `relever()`: the log lists the messages that would be posted. Nothing is posted.
9. **Test message.** Run `envoyerMessageTest()`: a "🧪 TEST" message must appear in the space, in its own thread. Also check
   the fallback text (notification), the dark theme and the links Chat makes clickable.
10. **Trigger.** Run `installerDeclencheur()`: a single hourly trigger on `relever()`.
11. **Go live.** Add the `DRY_RUN` = `false` property (no code change). The first live run posts the bootstrap message,
    stores the feed, then relays new publications every hour.

### Usage

No menu: functions are run from the Apps Script editor (function drop-down, **Run**).

| Function | Role |
|---|---|
| `relever()` | Polls and posts. Called by the trigger; can also be run by hand (`mode=manuel`). |
| `installerDeclencheur()` | Creates **a single** hourly trigger on `relever()` (removes previous ones first). |
| `supprimerDeclencheur()` | Removes the `relever()` trigger. |
| `envoyerMessageTest()` | Posts a "TEST" message, **even in dry run**, without touching the memory. Throws if the webhook is missing or rejected. |
| `reinitialiserMemoire()` | Clears `ELEMENTS_VUS` (new bootstrap at the next run). Requires `CONFIRMER_REINITIALISATION` = `oui`; otherwise nothing changes and the log explains how to confirm. |
| `diagnostiquer()` | Read-only diagnostic, no POST: feed, `WEBHOOK_URL` (masked), effective settings and their origin, memory, trigger, last run, scopes. |
| `testerSansApi()` | Quick tests without a real API (references, categories, texts, cards, settings). |
| `aPropos()` | Displays information about the script and author. |

**Reading the results.** Open Executions in the editor. Each run writes one summary line:

```
[Veille CERT-FR] Exécution terminée / Run finished | resultat=ok | mode=declencheur | dryRun=false | duree=4s | lus=32 | nouveaux=3 | publies=3 | echecs=0 | reportes=0 | alertes=aucune
```

`resultat` is `ok`, `amorcage`, `partiel`, `echec_flux`, `webhook_refuse`, `webhook_absent`, `verrou_non_obtenu`,
`garde_temps` or `simulation`. In `diagnostiquer()`, each line starts with a status word: `OK`, `ATTENTION`, `ERREUR`,
`INFO`.

**Dry run and going live.** As long as `DRY_RUN` is not `false`, the script posts nothing (except
`envoyerMessageTest()`). To go back to dry run, delete the `DRY_RUN` property or set it to `true`. The versioned code
keeps `DRY_RUN: true`.

**Changing the webhook** (leak, recreated space): the manager revokes the old webhook and creates a new one; update
`WEBHOOK_URL`, then run `envoyerMessageTest()`.

### Tests

```bash
node tests/banc.js # unit test bench (--verbeux for details)
```

The bench has **35 tests** and calls no real API. It simulates `UrlFetchApp` (fictitious `CERTFR-2099-…` feeds, HTTP codes,
`Retry-After`), `XmlService`, `PropertiesService`, `LockService`, `MailApp`, `ScriptApp`, `Session`, the clock and
`Utilities.sleep`, with an invented webhook URL. It covers feed and category parsing, de-duplication, filters, first run,
dry run, cap and posting order, resume after failure, 400, 401, 403, 404, 429 and 5xx codes, alerts (feed failing, silent
feed, restored), secret masking, confirmed reset, settings and language, the time guard and the diagnostic.

**Not testable outside the API**: the real rendering of cards in Chat (threaded mode, dark theme, auto-links), the real feed
structure and whether it rejects Apps Script calls, e-mail delivery, OAuth authorisation. This is the purpose of the live
acceptance (criterion CA-19): `diagnostiquer()` on the real feed, dry run, test message.

### Known limits

- **Feed depth**: the feed only keeps the latest items. An outage longer than its coverage loses publications; the "feed
  failing" alert is sent after `SEUIL_ECHEC_HEURES` hours.
- **Quotas**: about 1 message per second per space (hence the 1.1 s pause); 6 minutes per run (time guard at 5 min, the
  rest is resumed on the next run); script property limited to 9 KB per value.
- **Volume**: 24 reads per day; 5 to 8 messages per working day, 20 to 30 on vendor patch days. Beyond 20 new items in one
  hour, the rest is deferred.
- **Updates**: an alert updated by CERT-FR is not reposted.
- **One feed, one space**; no keyword highlighting, no `@all`, no interactive button (a webhook cannot handle clicks).
- **Feed access**: the site may reject Apps Script calls (403); the "feed failing" alert reports it.
- **Alert address**: without `ADRESSE_ALERTE`, the fallback recipient (executing account) may be unreadable.
- **Status**: internal IT tool, delivered in dry run; the live acceptance (CA-19) is still to be done.

### About

Developed by **Fabrice Faucheux** ([https://faucheux.bzh](https://faucheux.bzh)).

### License

This project is licensed under the [MIT](LICENSE) License.
