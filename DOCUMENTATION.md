# Documentation technique – Orion CRM

**Page de titre**

- **Titre du document** : Documentation technique – Orion CRM
- **Auteur** : Vincent Vanwaelscappel
- **Option choisie** : Option B (Scénario Orion)
- **Date** :

## Sommaire

1. [Introduction](#1-introduction)
2. [Étapes de mise en œuvre du pipeline CI/CD](#2-étapes-de-mise-en-œuvre-du-pipeline-cicd)
    - 2.1 [Structure du pipeline](#21-structure-du-pipeline)
    - 2.2 [Scripts d'automatisation](#22-scripts-dautomatisation)
    - 2.3 [Reproductibilité](#23-reproductibilité)
3. [Plan de conteneurisation et de déploiement](#3-plan-de-conteneurisation-et-de-déploiement)
    - 3.1 [Dockerfiles](#31-dockerfiles)
    - 3.2 [docker-compose.yml](#32-docker-composeyml)
    - 3.3 [Stratégie de déploiement](#33-stratégie-de-déploiement)
4. [Plan de testing périodique](#4-plan-de-testing-périodique)
    - 4.1 [Types de tests automatisés](#41-types-de-tests-automatisés)
    - 4.2 [Fréquence d'exécution](#42-fréquence-dexécution)
    - 4.3 [Objectifs des tests](#43-objectifs-des-tests)
5. [Plan de sécurité](#5-plan-de-sécurité)
    - 5.1 [Résultats SonarQube](#51-résultats-sonarqube)
    - 5.2 [Analyse des risques](#52-analyse-des-risques)
    - 5.3 [Plan d'action / Remédiation](#53-plan-daction--remédiation)
6. [Monitoring, métriques & KPI](#6-monitoring-métriques--kpi)
    - 6.1 [Métriques DORA](#61-métriques-dora)
    - 6.2 [KPI personnalisés](#62-kpi-personnalisés)
    - 6.3 [Analyse synthétique du monitoring](#63-analyse-synthétique-du-monitoring)
7. [Plan de sauvegarde des données](#7-plan-de-sauvegarde-des-données)
    - 7.1 [Ce qui doit être sauvegardé](#71-ce-qui-doit-être-sauvegardé)
    - 7.2 [Procédure de sauvegarde](#72-procédure-de-sauvegarde)
    - 7.3 [Procédure de restauration](#73-procédure-de-restauration)
8. [Plan de mise à jour](#8-plan-de-mise-à-jour)
    - 8.1 [Mise à jour de l'application](#81-mise-à-jour-de-lapplication)
    - 8.2 [Mise à jour du pipeline CI/CD](#82-mise-à-jour-du-pipeline-cicd)
    - 8.3 [Fréquence & bonnes pratiques](#83-fréquence--bonnes-pratiques)
9. [Conclusion](#9-conclusion)

- [Annexes (optionnelles)](#annexes-optionnelles)

## 1. Introduction

- Contexte du projet
- Objectifs de l'industrialisation
- Technologies principales
- Présentation rapide du pipeline CI/CD mis en place

## 2. Étapes de mise en œuvre du pipeline CI/CD

### 2.1 Structure du pipeline

- Étapes principales (build back-end, build front-end, tests, analyse SonarQube, déploiement local ou optionnel cloud)
- Ordre d'exécution
- Justification du choix des actions GitHub

### 2.2 Scripts d'automatisation

- Scripts utilisés
- Leur rôle dans le pipeline
- Comment les exécuter ou les adapter

### 2.3 Reproductibilité

- Comment relancer le pipeline
- Gestion des secrets (sans jamais les afficher)

## 3. Plan de conteneurisation et de déploiement

### 3.1 Dockerfiles

**État initial.** Le dépôt fournit un Dockerfile par module (`server/Dockerfile`, `client/Dockerfile`), volontairement
basiques : image `node:22` complète (~1 Go), `npm install` non reproductible, build et exécution dans la même image,
processus lancé en root, et front servi par `vite preview` (outil de prévisualisation, non prévu pour la production).

**Choix techniques cibles.**

| Choix               | Décision                                                    | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|---------------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Image de base build | `node:22-alpine`                                            | Version alignée sur `engines` (Node ≥ 22), variante alpine ~5× plus légère que l'image complète, surface d'attaque réduite                                                                                                                                                                                                                                                                                                                                                                           |
| Installation        | `npm ci`                                                    | Installation reproductible depuis `package-lock.json` (échoue si le lock est désynchronisé), contrairement à `npm install`                                                                                                                                                                                                                                                                                                                                                                           |
| Structure           | Multi-stage build                                           | L'étage `builder` compile (TypeScript > `dist/`, Vite > `dist/`) ; l'étage final ne contient que le résultat du build et les dépendances de production (`npm ci --omit=dev`). Image finale plus petite, sans compilateur ni devDependencies                                                                                                                                                                                                                                                          |
| Runtime front       | `nginxinc/nginx-unprivileged:alpine`                        | Un build Vite est un ensemble de fichiers statiques : nginx est fait pour ça (performances, cache, gzip), là où `vite preview` ne l'est pas. La variante *unprivileged* tourne nativement en utilisateur non-root sur un port non privilégié (8080). Image maintenue par NGINX Inc. (éditeur de nginx, Docker Verified Publisher), construite depuis les mêmes sources que l'image officielle `nginx` - préférable à un durcissement non-root manuel de l'image officielle, plus fragile à maintenir |
| Utilisateur         | `USER node` (back) / `nginx` (front)                        | Ne jamais exécuter un conteneur en root : en cas de compromission du processus, l'attaquant n'a pas les droits root dans le conteneur                                                                                                                                                                                                                                                                                                                                                                |
| Healthcheck         | `HEALTHCHECK` sur `GET /api/health` (back) et `/` (front)   | Le back expose déjà `/api/health` ; permet à Docker/Compose de connaître l'état réel du service, pas seulement l'existence du processus                                                                                                                                                                                                                                                                                                                                                              |
| `.dockerignore`     | `node_modules`, `dist`, `.env*`, `*.db`, `.git`, `coverage` | Contexte de build minimal, et garantie qu'aucun secret ni base locale n'est copié dans l'image                                                                                                                                                                                                                                                                                                                                                                                                       |

**Spécificités Prisma/SQLite (back).** Trois contraintes structurent le Dockerfile back :

1. `prisma generate` doit être exécuté dans l'image finale (le client généré dépend de la plateforme - musl sur
   alpine) ;
2. les migrations doivent être **versionnées** (le starter les excluait du versionnement via `.gitignore`) et
   appliquées au démarrage du conteneur via `prisma migrate deploy` dans l'entrypoint - sans cela, un conteneur neuf
   démarre sans base ;
3. le fichier SQLite doit vivre **hors de l'image**, dans un volume (`DATABASE_URL=file:/app/data/orion.db`), sinon les
   données sont perdues à chaque recréation du conteneur. Ce volume est aussi la cible du plan de sauvegarde (§ 7).

**Communication front > back.** L'URL d'API du front (`VITE_API_URL`) est injectée **au moment du build** Vite, ce qui
figerait l'URL dans l'image. Plutôt que de builder une image par environnement, le nginx du front fait office de reverse
proxy : `/api` est relayé vers le service back (`proxy_pass http://server:8080`), en miroir exact du proxy Vite utilisé
en dev. Le front appelle donc des URL relatives, l'image est agnostique de l'environnement, et le navigateur ne parle
qu'à une seule origine (pas de CORS inter-conteneurs).

### 3.2 docker-compose.yml

Deux services (pas de service base de données : SQLite est embarqué dans le back) :

| Service  | Image                     | Port hôte | Rôle                                                           |
|----------|---------------------------|-----------|----------------------------------------------------------------|
| `server` | build `server/Dockerfile` | 8080      | API Express + fichier SQLite dans le volume `orion-db`         |
| `client` | build `client/Dockerfile` | 4200      | nginx : statiques React + reverse proxy `/api` > `server:8080` |

- **Healthchecks** : `server` est vérifié via `/api/health` ; `client` ne démarre qu'une fois le back sain
  (`depends_on: condition: service_healthy`).
- **Volume nommé** `orion-db` monté sur `/app/data` : persistance des données entre recréations de conteneurs.
- **Réseau** : réseau bridge **nommé** `orion` (`name: orion`), déclaré explicitement plutôt que le réseau par défaut de
  Compose ; les services se résolvent par leur nom (`server`, `client`). Le nom stable et prévisible prépare la Partie
  2 : la stack de monitoring ELK, qui vivra dans un docker-compose séparé, pourra se raccorder à ce réseau via
  `external: true` pour collecter les logs applicatifs sans fusionner les deux stacks.
- **Configuration par variables d'environnement** (fichier `.env` gitignoré, jamais copié dans les images) : aucune
  valeur sensible en dur dans `docker-compose.yml`.

**Lancement local** : `docker compose up --build` puis application sur `http://localhost:4200` (API directement
joignable sur `http://localhost:8080/api/health` pour vérification). Arrêt : `docker compose down` - les données
**persistent** (le volume nommé survit aux arrêts, recréations de conteneurs et mises à jour d'images). Remise à zéro
complète : `docker compose down -v` - commande **destructive** (elle supprime le volume, donc la base), réservée au
poste de développement.

Ce risque de suppression accidentelle est traité à deux niveaux : le plan de sauvegarde (§ 7) prévoit une sauvegarde
automatisée du fichier SQLite et sa procédure de restauration ; et pour un déploiement de production, le volume serait
déclaré `external: true` (créé une fois via `docker volume create`), ce qui le rend insupprimable par `down -v`. Ce
durcissement n'est pas appliqué ici car il ajoute une étape manuelle avant le premier `docker compose up`, en
contradiction avec l'exigence d'un lancement direct.

### 3.3 Stratégie de déploiement

- **Publication d'images** : à chaque push sur `main` validé par la CI, les deux images sont construites et poussées sur
  **GitHub Container Registry** (GHCR), taguées `latest` + SHA du commit (traçabilité : toute image est reliable à un
  commit exact). L'authentification utilise le `GITHUB_TOKEN` fourni par GitHub Actions (permission `packages: write`),
  aucun secret supplémentaire à gérer.
- **Déploiement** : sur la machine cible (poste ou serveur interne Orion), `docker compose pull && docker compose up -d`
  récupère et démarre les dernières images publiées. Le healthcheck sert de smoke test post-déploiement.
- **Retour arrière** : le tag par SHA permet de redémarrer explicitement l'image du commit précédent en cas de problème
  (voir aussi plan de sauvegarde § 7 pour les données).

## 4. Plan de testing périodique

**État initial** : le starter ne contient qu'un test placeholder par module (`expect(true).toBe(true)`) ; la couverture
réelle est donc nulle. Le plan ci-dessous définit la cible que le pipeline met en œuvre ; le déroulé effectif de la
mise en place est décrit au § 2.

### 4.1 Types de tests automatisés

| Type                      | Périmètre                                                                               | Outil                                   | Ce qui est vérifié                                                                                                                   |
|---------------------------|-----------------------------------------------------------------------------------------|-----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| Analyse statique          | back + front                                                                            | ESLint, `tsc --noEmit`                  | Erreurs de typage et violations de règles avant même d'exécuter le code                                                              |
| Tests unitaires back      | services, repositories, validation Zod                                                  | Vitest (+ mock Prisma)                  | Logique métier isolée : chaque couche testée sans base de données réelle                                                             |
| Tests d'intégration back  | routes Express de bout en bout                                                          | Vitest + Supertest, base SQLite jetable | Contrats de l'API (statuts HTTP, corps de réponse, erreurs de validation) sur une vraie chaîne route > controller > service > Prisma |
| Tests de composants front | composants, hooks, services d'appel API                                                 | Vitest + Testing Library (jsdom)        | Rendu et comportement des composants React et des hooks TanStack Query, couche d'appel API (axios) mockée                                                              |
| Tests e2e navigateur      | smoke : parcours critiques (dashboard, CRUD contact) *(PR)* ; suite étendue *(nightly)* | Playwright (Chromium)                   | Le comportement réel vu de l'utilisateur : front, API et base réunis, dans un vrai navigateur                                        |
| Smoke test conteneurisé   | application complète                                                                    | `docker compose up` en CI + `curl`      | L'application démarre réellement en conteneurs : `/api/health` répond 200, le front sert sa page                                     |
| Analyse qualité/sécurité  | tout le code                                                                            | SonarQube Cloud                         | Bugs, vulnérabilités, code smells, duplication, couverture (voir § 5)                                                                |
| Audit de dépendances      | back + front                                                                            | `npm audit`                             | Vulnérabilités connues (CVE) dans les dépendances                                                                                    |

Les tests unitaires et d'intégration produisent un rapport de couverture **lcov** (provider v8), transmis à SonarQube.
Les tests e2e Playwright sont découpés en deux niveaux. Le **smoke e2e** (parcours critiques) s'exécute **en PR**, car
dans ce pipeline un merge sur `main` publie immédiatement des images déployables (§ 3.3) : tout ce qui n'est pas vérifié
avant merge l'est trop tard. Son coût est marginal - il tourne sur la stack Docker Compose que le job PR démarre déjà
pour le smoke test. La **suite étendue** (parcours secondaires, cas d'erreur) reste en nightly. Garde-fous contre la
*flakiness*, principal risque des e2e bloquants : périmètre smoke volontairement minimal, `retries` Playwright activés
en CI, et tout test devenu instable est déplacé vers la suite nightly le temps d'être fiabilisé.

### 4.2 Fréquence d'exécution

| Déclencheur                   | Tests exécutés                                                                                                                     | Rôle                                                                                                                                                                                                                                                                                                                                        |
|-------------------------------|------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Push** (toute branche)      | Lint + typecheck + tests unitaires, d'intégration et de composants avec couverture + build back et front                                                                | Feedback rapide au développeur à chaque commit poussé                                                                                                                                                                                                                                                                                       |
| **Pull request** vers `main`  | Idem push + analyse SonarQube (quality gate) + build des images Docker + smoke test compose + smoke e2e Playwright sur cette stack | Exécutée **dès l'ouverture de la PR** puis à chaque mise à jour de la branche : feedback immédiat pour l'auteur, et le reviewer ne relit que des PR déjà vertes. La protection de branche (*required status checks* + *require branches up to date*) exige ces mêmes résultats, revalidés contre le `main` courant, pour autoriser le merge |
| **Nightly** (cron quotidien)  | Suite complète + suite e2e étendue + `npm audit`                                                                                   | Détecter les régressions *sans commit* : nouvelle CVE publiée, dérive d'une dépendance, panne d'un service externe (Sonar). Un pipeline vert hier peut être rouge aujourd'hui. Les e2e longs ou en cours de fiabilisation s'exécutent ici (déclenchement manuel possible avant release)                                                     |
| **Release / push sur `main`** | Suite complète + publication des images GHCR                                                                                       | Seul un état intégralement validé est promu en artefact déployable                                                                                                                                                                                                                                                                          |

### 4.3 Objectifs des tests

- **Non-régression** : toute modification (fix, feature, montée de dépendance) est confrontée aux comportements
  existants avant d'atteindre `main` ; c'est la condition pour déployer fréquemment sans peur (métriques DORA, § 6).
- **Qualité** : critères de réussite explicites et bloquants - tests verts obligatoires, couverture ≥ 80 % sur le
  périmètre métier du back (services, repositories, validation - seuil appliqué par les *thresholds* Vitest, qui font
  échouer le job de tests sous 80 %), quality gate SonarQube au vert. Un échec bloque le merge (branche `main`
  protégée).
- **Déployabilité** : le smoke test conteneurisé garantit que ce qui est publié démarre réellement - on ne teste pas
  seulement le code, mais l'artefact déployé, dans les conditions du déploiement.
- **Alerte** : tout échec de la CI (y compris nightly) notifie l'équipe via GitHub (email/interface) ; le nightly en
  échec est traité comme un incident à investiguer, pas comme du bruit.

## 5. Plan de sécurité

### 5.1 Résultats SonarQube

**Rôle dans le pipeline.** SonarQube Cloud réalise une analyse statique (SAST) du monorepo à chaque pull request et push
sur `main` : vulnérabilités, *security hotspots* (code sensible à revoir manuellement), bugs, code smells, duplication,
complexité, et couverture de tests (via les rapports lcov produits en CI, § 4.1). Le **quality gate** est bloquant : une
PR qui le fait échouer ne peut pas être mergée. L'authentification utilise le secret GitHub `SONAR_TOKEN` (jamais en
clair dans le workflow).

**Résultats d'analyse.** *(Section complétée en Partie 2, après plusieurs exécutions du pipeline : vulnérabilités et
hotspots relevés, code smells critiques, zones de complexité, couverture mesurée, avec captures en annexe.)*

L'analyse manuelle du starter identifie déjà des candidats que SonarQube et la revue devront confirmer :

- **CORS ouvert à toutes les origines** (`app.use(cors())`) : n'importe quel site peut appeler l'API depuis le
  navigateur d'un utilisateur interne ;
- **Middleware d'erreurs inopérant** : déclaré avec 3 paramètres alors qu'Express en exige 4 pour un error handler - il
  ne s'exécute jamais, les erreurs remontent au handler par défaut (risque de fuite de stack trace) ;
- **Aucune authentification** sur l'API CRM (données clients accessibles à quiconque atteint le port) ;
- **Absence d'en-têtes de sécurité HTTP** (pas de helmet côté Express, pas de CSP côté nginx).

### 5.2 Analyse des risques

**Risques applicatifs**

| Risque                                                 | Référence OWASP                 | Impact                                                                     |
|--------------------------------------------------------|---------------------------------|----------------------------------------------------------------------------|
| API sans authentification ni contrôle d'accès          | A01 – Broken Access Control     | Lecture/modification des données CRM par tout accédant au réseau           |
| CORS non restreint                                     | A05 – Security Misconfiguration | Requêtes cross-origin malveillantes vers l'API                             |
| Error handler inopérant > réponses d'erreur par défaut | A05                             | Fuite d'informations techniques (stack traces)                             |
| Pas de rate limiting                                   | A04 – Insecure Design           | Abus de l'API, force brute future sur l'authentification                   |
| Fichier SQLite unique, non chiffré                     | -                               | Perte/exfiltration des données si le volume est compromis (mitigé par § 7) |

Point positif du starter : les entrées sont déjà validées par **Zod** dans chaque controller (protection contre
l'injection et le mass-assignment).

**Risques pipeline et chaîne d'approvisionnement**

| Risque                                               | Mitigation prévue                                                                                                      |
|------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Secret exposé en clair (token Sonar, `.env` commité) | Secrets GitHub Actions exclusivement ; `.env`, `*.db` gitignorés ; aucun secret dans les images (`.dockerignore`)      |
| Dépendance vulnérable (CVE)                          | `npm audit` en nightly + Dependabot (alertes et PR de mise à jour, § 8)                                                |
| Action GitHub compromise (supply chain)              | Actions épinglées par SHA de commit, pas seulement par tag ; permissions du `GITHUB_TOKEN` réduites au minimum par job |
| Image de base vulnérable                             | Images officielles minimales (alpine), reconstruites régulièrement (§ 8) ; scan d'images possible en extension (Trivy) |
| Conteneur exécuté en root                            | Utilisateurs non-root dans les deux images (§ 3.1)                                                                     |

### 5.3 Plan d'action / Remédiation

**Actions immédiates** (intégrées à la mise en place du pipeline) :

- mettre à jour sans délai les dépendances vulnérables détectées par `npm audit` (politique de mise à jour et premier
  cas concret au § 8.1) ;
- corriger le middleware d'erreurs (signature à 4 paramètres, réponse JSON générique sans stack trace) ;
- supprimer le middleware CORS du starter : avec le reverse proxy (§ 3.1), front et API partagent la même origine et
  aucune requête cross-origin n'est légitime - l'absence totale d'en-têtes CORS est la politique la plus restrictive
  (une allowlist explicite ne serait réintroduite que si un autre client navigateur devait un jour consommer l'API
  directement) ;
- ajouter helmet (en-têtes de sécurité HTTP) côté Express ;
- durcir la conteneurisation : non-root, multi-stage, `.dockerignore`, secrets hors images (§ 3) ;
- brancher SonarQube Cloud avec quality gate bloquant et secrets GitHub.

Les trois corrections applicatives (error handler, CORS, helmet) sont volontairement appliquées **après** la première
analyse SonarQube : le constat est ainsi documenté avant/après (captures § 5.1), preuve que le pipeline détecte puis
valide la remédiation.

**Actions à court terme** (itérations suivantes) :

- traiter les 10–20 alertes SonarQube prioritaires relevées en Partie 2 (en distinguant vulnérabilités réelles et code
  smells) ;
- atteindre et maintenir le seuil de couverture (§ 4.3) pour fiabiliser la détection de régressions ;
- activer Dependabot et instaurer une revue hebdomadaire des alertes `npm audit` ;
- ajouter un rate limiting sur l'API (`express-rate-limit`).

**Actions à long terme** :

- mettre en place une authentification (JWT + bcrypt, patterns éprouvés sur les projets précédents) et un contrôle
  d'accès par rôle (technique/commercial) - indispensable si l'application dépasse le réseau interne ;
- intégrer un scan de vulnérabilités des images Docker (Trivy) dans la CI ;
- planifier la rotation des secrets et les montées de versions majeures (Node, React, Express) selon le plan de mise à
  jour (§ 8).

## 6. Monitoring, métriques & KPI

### 6.1 Métriques DORA

*(méthode de calcul + valeurs observées pour chacune)*

- Lead Time
- Deployment Frequency
- MTTR
- Change Failure Rate

### 6.2 KPI personnalisés

- Temps de build
- Temps des tests
- Taux d'erreurs dans les logs
- Autre KPI pertinent

### 6.3 Analyse synthétique du monitoring

- Tendances observées
- Points forts
- Points à améliorer
- Dashboards
- Alertes

## 7. Plan de sauvegarde des données

### 7.1 Ce qui doit être sauvegardé

- Données (si applicable)
- Fichiers de configuration
- Artefacts de build

### 7.2 Procédure de sauvegarde

- Format
- Fréquence
- Outils utilisés (scripts, commandes simples)

### 7.3 Procédure de restauration

- Scénario d'incident
- Étapes pour revenir à une version stable
- Limitations éventuelles

## 8. Plan de mise à jour

### 8.1 Mise à jour de l'application

- Dépendances npm
- Mises à jour React / Node.js
- Mises à jour Docker (images)

Premier cas concret à intégrer à la rédaction de cette section : dès la mise en place de la CI, `npm audit` a révélé
2 vulnérabilités critiques et 1 haute dans la chaîne de test Vitest 2.x ; montée en version majeure (Vitest 4) validée
par les suites de tests avant le premier run du pipeline - illustration du cycle détection (audit nightly, § 4.2) >
mise à jour > validation par les tests.

### 8.2 Mise à jour du pipeline CI/CD

- Versions des actions GitHub
- Versions des scripts
- Maintenance du workflow

### 8.3 Fréquence & bonnes pratiques

- Conseils pour maintenir la solution dans le temps

## 9. Conclusion

- Résumé des améliorations apportées
- Gains observés (fiabilité, rapidité, qualité)
- Recommandations pour les itérations suivantes

## Annexes (optionnelles)

- Captures SonarQube
- Captures de logs (monitoring Option B)
- Extraits de workflows
- Commandes utiles
