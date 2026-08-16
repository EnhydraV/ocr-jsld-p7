# Orion CRM — pipeline CI/CD

CRM interne simplifiée (contacts et organisations) servant de support à la mise en place d'une **chaîne d'intégration
et de livraison continues** complète : tests automatisés, analyse de qualité et de sécurité, conteneurisation,
versionnage automatique, publication d'images, supervision, sauvegardes.

- **Front** : React 19 + TypeScript + Vite + Tailwind CSS
- **Back** : Node.js 22 + Express 5 + TypeScript + Prisma + SQLite
- **Chaîne** : GitHub Actions, SonarQube Cloud, Trivy, semantic-release, GHCR, Docker Compose, Elasticsearch/Logstash/Kibana

La documentation technique complète — étapes de mise en œuvre, plans de conteneurisation, de testing, de sécurité, de
sauvegarde et de mise à jour, métriques DORA et KPI — est dans **[DOCUMENTATION.md](DOCUMENTATION.md)**. Ce fichier-ci
ne couvre que l'exécution et les choix techniques.

---

## Démarrage rapide

**Prérequis** : Docker avec Compose. Rien d'autre — ni Node, ni base de données à installer.

```bash
git clone https://github.com/EnhydraV/ocr-jsld-p7.git && cd ocr-jsld-p7
mkdir -p backups                 # doit exister avant le premier démarrage (voir ci-dessous)
docker compose up -d --build
```

| Service | Adresse |
|---|---|
| Application | http://localhost:4200 |
| API | http://localhost:8080/api/health |

`--build` reconstruit les images depuis les sources. Pour utiliser celles que la CI a publiées sur GHCR - c'est le
mode « déploiement » du [§ 3.3](DOCUMENTATION.md) - remplacer par `docker compose pull` puis `docker compose up -d --wait` : `pull` est
nécessaire, `up` seul réutilise sans broncher une image locale périmée.

Les migrations Prisma sont appliquées automatiquement au démarrage du conteneur : une installation neuve part d'une
base vide et fonctionnelle. Arrêt : `docker compose down` — les données **survivent** (volume nommé `orion-db`).
`docker compose down -v` détruit le volume, donc la base : commande réservée au poste de développement.

> **`mkdir -p backups`** n'est pas une coquetterie : le répertoire est gitignoré, et créé par Docker il appartiendrait
> à `root`, que le conteneur non-root ne peut pas écrire. Le pipeline le crée de son côté.

### Supervision (optionnelle)

La stack Elasticsearch / Logstash / Kibana vit dans un compose **séparé** et volontairement **hors du pipeline** (elle
demande environ 4 Go de mémoire, cf. § 6 de la documentation).

**Prérequis** — copier les deux modèles d'environnement, puis renseigner leur unique variable :

| Fichier | Modèle | Variable |
|---|---|---|
| `.env` | `.env.example` | `LOGSTASH_HOST=logstash` — expédie les logs applicatifs vers la stack |
| `elk/.env` | `elk/.env.example` | `GITHUB_TOKEN` — lecture des alertes Dependabot (`gh auth token` convient) |

**Raccourci** — `./run.sh` (Linux, macOS, Git Bash) ou `run.bat` (Windows) enchaînent toute la séquence ci-dessous et
attendent réellement chaque service ; `./run.sh down` ou `run.bat down` arrêtent les deux stacks. Les commandes
restent détaillées ici : un script qu'on ne peut pas lire ligne à ligne se contourne au premier incident.

**Démarrage**, dans cet ordre :

```
docker compose pull
docker compose up -d --wait
docker compose -f elk/docker-compose.yml pull
docker compose -f elk/docker-compose.yml up -d
docker compose restart server backup
```

L'ordre n'est pas indifférent. La stack applicative crée le réseau `orion`, que le compose ELK déclare `external` et ne
sait pas créer lui-même. Et le redémarrage final n'est pas décoratif : le transport Winston → Logstash ne se connecte
qu'au **démarrage** du processus — quatre tentatives, puis il se tait pour ne pas gêner l'application. Les conteneurs
applicatifs ayant forcément démarré avant Logstash, ils ont déjà renoncé ; on les relance une fois le port 5000 ouvert.

Kibana met une minute environ à répondre sur http://localhost:5601. Ensuite, indexation des métriques et création des
quatre dashboards :

```
cd tools
npm ci
npm run dora:index -- --refresh
npm run deps:index
npm run kibana:setup
```

Le service `indexer` de la stack ELK rejoue les deux indexations toutes les heures ; les lancer à la main sert
seulement à ne pas attendre pour voir des données. `kibana:setup` est rejouable et fait foi : le code des dashboards
l'emporte sur un export plus ancien.

**Arrêt** — la stack ELK d'abord, puisqu'elle est raccordée au réseau de l'autre :

```
docker compose -f elk/docker-compose.yml down
docker compose down
```

Ajouter `-v` détruit les volumes, donc la base et les index Elasticsearch. Les sauvegardes de `./backups` y survivent,
c'est précisément pourquoi elles sont hors du volume de données (voir § 7 de la documentation).

| Dashboard | Contenu | Capture |
|---|---|---|
| Pipeline CI/CD | métriques DORA et KPI du pipeline | [docs/](docs/dashboard-pipeline-dora.png) |
| Logs applicatifs | requêtes HTTP, erreurs, temps de réponse | [docs/](docs/dashboard-logs-applicatifs.png) |
| Sauvegardes | instantanés, échecs, contrôles de restaurabilité | [docs/](docs/dashboard-sauvegardes.png) |
| Vulnérabilités | alertes Dependabot par gravité et par écosystème | [docs/](docs/dashboard-vulnerabilites.png) |

### Développement local (sans Docker)

Node.js >= 22 et npm >= 10.

```bash
# Back — API sur :8080
cd server && npm ci && cp .env.example .env
npx prisma migrate dev && npm run dev

# Front — application sur :4200 (nouveau terminal)
cd client && npm ci && cp .env.example .env && npm run dev
```

Le front appelle l'API par des **URL relatives** : le proxy de Vite en développement et le reverse proxy nginx en
production font que front et API partagent toujours la même origine.

---

## Le pipeline CI/CD

Un seul workflow (`.github/workflows/ci.yml`), sept jobs, et une **matrice de déclencheurs** où chacun a un rôle
distinct :

| Déclencheur | Ce qui s'exécute | Rôle |
|---|---|---|
| Push (toute branche) | lint, types, tests + couverture, build (back et front) | Retour rapide au développeur |
| Pull request vers `main` | idem + quality gate SonarQube + build des images + smoke test de la stack + scan Trivy | Tout ce qui conditionne la fusion |
| Nightly (cron) | idem + `npm audit` | Détecter ce qu'**aucun commit ne révèle** : une CVE publiée cette nuit rend rouge un dépôt vert hier |
| Push sur `main` | suite complète + release SemVer + publication GHCR | Seul un état intégralement validé est promu |

Deux principes structurent l'ensemble :

- **le YAML n'orchestre, il n'implémente pas** : chaque étape appelle un script npm, donc la commande que lance la CI
  est *exactement* celle qu'un développeur lance en local ;
- **la livraison est conditionnée** : les jobs de release et de publication dépendent de tous les autres. Un échec
  **bloque** la livraison au lieu de la dégrader.

Couverture : 123 tests côté back, 17 côté front, 55 sur l'outillage ; seuil bloquant à 80 % sur le périmètre métier.

---

## Choix techniques, et pourquoi

| Choix | Raison |
|---|---|
| **Images multi-étages, exécution non-root** | L'étage de production ne contient ni compilateur, ni sources, ni `npm` — surface d'attaque réduite. `npm` a d'ailleurs été retiré après que Trivy y a trouvé cinq CVE dans ses propres dépendances. |
| **`nginx-unprivileged` + reverse proxy `/api`** | Le front est servi par un vrai serveur web, pas par un serveur de développement ; le proxy fait que front et API partagent la même origine, **ce qui rend CORS inutile** (le middleware a été supprimé : n'émettre aucun en-tête CORS est la politique la plus restrictive). |
| **Actions épinglées par SHA de commit** | Un tag est mutable : le déplacer suffit à faire exécuter du code arbitraire par le pipeline. C'est le vecteur de l'attaque `tj-actions` de mars 2025. |
| **Images de base épinglées par digest** | Même raisonnement, appliqué à la chaîne d'approvisionnement Docker ; Dependabot met à jour digest et tag ensemble. |
| **Trivy plutôt que Twistlock** | Twistlock (cité par le brief) est commercial, avec console sous licence ; Trivy rend le même service, en open source, et bloque sur les CVE HIGH/CRITICAL **corrigeables**. |
| **semantic-release** | La version est déduite des messages de commit : plus d'oubli de tag, plus de numéro arbitraire. Les dépendances de développement (`chore`) ne déclenchent aucune version, celles livrées (`fix`) publient un correctif. |
| **Trois étiquettes d'image sur GHCR** | `latest` pour la commodité, le **SHA du commit** pour la traçabilité (toute image remonte à un commit exact), la version quand il y a release. |
| **SQLite + Prisma** | Application interne, faible volumétrie, un seul rédacteur : une bibliothèque embarquée suffit et supprime toute une classe d'infrastructure. Prisma abstrait le SQL, ce qui laisse la porte ouverte à PostgreSQL. |
| **Migrations versionnées, appliquées à l'entrée** | Le schéma est toujours à jour au démarrage du conteneur, et son historique vit dans git. |
| **ELK hors du pipeline** | Consigne du brief, et bon sens : c'est un outil d'observation du *runtime*, pas de validation du code. |
| **Dashboards définis en code** | Un dashboard cliqué à la main n'est pas reproductible : il disparaît avec le poste qui l'héberge. Les quatre sont décrits en TypeScript et créés par l'API de Kibana. |
| **Sauvegardes par `VACUUM INTO`** | SQLite garantit un instantané **cohérent à chaud**, là où un `cp` peut capturer un état déchiré. Prisma étant déjà dans l'image, aucun outil ni conteneur supplémentaire n'est requis. |

---

## Sauvegardes et restauration

La base SQLite est la seule donnée irremplaçable du projet. Un service `backup` de la stack en prend un instantané
**horaire** (rétention 24 h / 7 j / 4 s / 12 m) et contrôle **chaque jour** qu'il est réellement restaurable. Les
instantanés sont écrits dans `./backups`, **hors du volume de données** : un `down -v` détruit la base sans emporter
ses sauvegardes.

```bash
docker compose exec -T server node dist/scripts/backup.js             # sauvegarde à la demande
docker compose exec -T server node dist/scripts/restore.js --verify   # contrôle de restaurabilité
docker compose stop server                                            # avant toute restauration réelle
docker compose exec -T server node dist/scripts/restore.js --yes      # restauration (sans --yes : refus)
```

Durées mesurées sur une base de 4,7 Mo (20 000 contacts) : sauvegarde **3,0 s**, contrôle **0,35 s**, restauration
**1,1 s**, rétablissement complet **moins d'une minute** (l'essentiel étant l'arrêt et le redémarrage du service). La
restauration conserve l'état précédent sous `pre-restore-*` : elle est réversible. Plan complet et exercices
périodiques au § 7 de la documentation.

---

## Scripts disponibles

| Module | Scripts |
|---|---|
| `server/` | `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:coverage`, `prisma:generate`, `prisma:migrate`, `prisma:studio`, `backup`, `backup:verify`, `restore` |
| `client/` | `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:coverage` |
| `tools/` | `dora`, `dora:index`, `deps:index`, `kibana:setup`, `kibana:import`, `kibana:export`, `test`, `typecheck` |
| racine | `release` (semantic-release, exécuté par le pipeline) |

---

## Structure du dépôt

```
.
├── .github/workflows/ci.yml   # Le pipeline : 7 jobs, 4 déclencheurs
├── client/                    # Front React (Dockerfile + nginx.conf)
├── server/                    # API Express
│   └── src/
│       ├── controllers/  services/  repositories/  models/  routes/
│       ├── lib/               # Prisma, logger, logique de sauvegarde
│       ├── middleware/        # Journalisation HTTP structurée
│       ├── scripts/           # Points d'entrée sauvegarde et restauration
│       └── tests/             # Unitaires et intégration
├── elk/                       # Stack de supervision (compose séparé)
├── tools/                     # Métriques DORA, alertes, dashboards en code
├── docs/                      # Captures des dashboards
├── docker-compose.yml         # server + backup + client
├── run.sh / run.bat           # Démarrage complet (raccourci ; cf. § Supervision)
├── DOCUMENTATION.md           # Documentation technique (9 sections + annexes)
└── sonar-project.properties
```

---

## API REST

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/health` | État de l'API (utilisé par les healthchecks) |
| `GET` `POST` | `/api/organizations` | Lister, créer |
| `GET` `PUT` `DELETE` | `/api/organizations/:id` | Consulter, modifier, supprimer |
| `GET` | `/api/organizations/stats` | Statistiques |
| `GET` `POST` | `/api/contacts` | Lister, créer |
| `GET` `PUT` `DELETE` | `/api/contacts/:id` | Consulter, modifier, supprimer |
| `GET` | `/api/contacts/stats` | Statistiques |
| `GET` | `/api/debug/status/:code` | Renvoie le statut demandé — génère du trafic varié pour la démonstration de supervision |

Validation des entrées par Zod, architecture en couches contrôleur → service → repository, TypeScript strict des deux
côtés.

---

## Documentation

| Document | Contenu |
|---|---|
| [DOCUMENTATION.md](DOCUMENTATION.md) | Documentation technique : mise en œuvre, conteneurisation, testing, sécurité, monitoring et métriques, sauvegarde, mise à jour, plus trois annexes (commandes utiles, détails d'implémentation, captures) |
| `docs/*.png` | Captures des quatre dashboards |

## Licence

MIT
