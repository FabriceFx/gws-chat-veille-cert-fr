# Journal des modifications / Changelog

Toutes les modifications notables apportées à ce projet sont consignées dans ce fichier. Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] - 2026-10-25

### Français

> **L'angle coût de l'inaction** : laisser du code de veille et de sécurité sans garde-fous automatisés, c'est risquer qu'une régression silencieuse ou une fuite de secret passe inaperçue jusqu'au jour de l'incident.

#### Ajouté
- Configuration du pipeline d'intégration continue GitLab CI (`.gitlab-ci.yml`) avec analyse de sécurité statique (SAST), détection automatique de secrets et exécution des 35 tests unitaires du banc.
- Rédaction et publication du Wiki GitLab technique complet (5 chapitres : architecture, catégorisation CERT-FR, cartes Google Chat, persistance anti-doublon et guide d'exploitation).

#### Modifié
- Mise à jour des références officielles du dépôt vers GitLab (`fabricefx-group/gws-chat-veille-cert-fr`).

---

### English

> **The cost of inaction angle**: Leaving security-critical scripts without automated guardrails means risking silent regressions or leaked secrets until an incident strikes.

#### Added
- GitLab CI/CD continuous integration pipeline (`.gitlab-ci.yml`) with static application security testing (SAST), secret detection, and automated execution of the 35 unit test bench.
- Full technical GitLab Wiki documentation (5 chapters: architecture, CERT-FR categorization, Google Chat cards, de-duplication persistence, and operations guide).

#### Changed
- Updated official repository references to GitLab (`fabricefx-group/gws-chat-veille-cert-fr`).

---

## [1.0.0] - 2026-10-24

### Français

> **L'angle terre promise** : la sérénité retrouvée d'une équipe informatique informée immédiatement des menaces critiques sans jamais avoir à scruter manuellement des flux RSS au fil de l'eau.

#### Ajouté
- Relève automatisée et horaire du flux RSS officiel du CERT-FR (`https://cert.cyber.gouv.fr/feed/`).
- Déduction automatique de la catégorie à partir de la référence officielle `CERTFR-AAAA-CODE-NNN` (alertes, avis de sécurité, actualités, rapports de menace, IOC, guides de durcissement, informations).
- Publication sous forme de cartes `cardsV2` Google Chat via webhook entrant (un fil de discussion par publication).
- Différenciation visuelle stricte par catégorie (émoji unique, libellé écrit, couleur de renfort).
- Mémoire anti-doublon persistante stockée en propriétés de script (`ELEMENTS_VUS`), bornée à 300 clés avec contrôle dynamique de la taille UTF-8 (plafond 8,8 Ko).
- Amorçage propre au premier lancement : publication d'un message de présentation avec légende visuelle sans polluer l'espace avec l'historique antérieur.
- Mode simulation (`DRY_RUN: true` par défaut) pour tester l'intégralité du traitement sans émettre de message vers Chat ni envoyer d'e-mail.
- Système d'alertes de fonctionnement par e-mail (`MailApp`) bilingue HTML/texte en cas d'incident (flux illisible, webhook refusé, 400 rejeté, flux muet depuis 5 jours) avec notification de retour à la normale (« rétabli »).
- Diagnostic complet en lecture seule (`diagnostiquer()`) pour valider la configuration, le flux réel, les quotas et les scopes accordés.
- Message de validation interactive (`envoyerMessageTest()`) vérifiant la connectivité du webhook sans altérer la mémoire.
- Procédure de réinitialisation sécurisée sous verrou (`reinitialiserMemoire()`) avec confirmation explicite requise.
- Banc de test automatisé autonome (35 tests Node.js simulant 100 % de l'environnement Google Apps Script).

---

### English

> **The promised land angle**: Peace of mind for IT teams who stay instantly alerted of critical vulnerabilities 24/7 without ever having to manually refresh external RSS feeds.

#### Added
- Automated hourly polling of the official CERT-FR RSS feed (`https://cert.cyber.gouv.fr/feed/`).
- Automatic category derivation from official `CERTFR-YYYY-CODE-NNN` references (alerts, security advisories, news, threat reports, IOCs, hardening guides, information).
- Publication as Google Chat `cardsV2` via incoming webhook (one dedicated thread per publication).
- Visual category markers (distinct emoji, written label, reinforcing color).
- Persistent de-duplication memory stored in script properties (`ELEMENTS_VUS`), capped at 300 keys with UTF-8 size monitoring (< 8.8 KB).
- Clean bootstrap on first run: informative welcome card with visual legend, skipping historical backlog.
- Dry run mode (`DRY_RUN: true` by default) to preview runs without posting to Chat or sending e-mails.
- Operational e-mail alerts (`MailApp`) with HTML/text rendering on failures (feed down, webhook rejected, 400 rejection, silent feed) and automatic restored notifications.
- Comprehensive read-only diagnostics (`diagnostiquer()`) inspecting live feed structure, properties, and OAuth scopes.
- Interactive test message (`envoyerMessageTest()`) validating webhook connectivity without touching memory.
- Safe memory reset under lock (`reinitialiserMemoire()`) protected by confirmation property.
- Full autonomous test bench (35 Node.js tests simulating Apps Script services).
