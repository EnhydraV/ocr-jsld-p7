/**
 * Projection des alertes Dependabot dans Elasticsearch (dashboard
 * « Vulnérabilités », § 8).
 *
 *   npm run deps:index               indexe les alertes
 *   npm run deps:index -- --dry-run  affiche les documents sans les envoyer
 *
 * Variables d'environnement : GITHUB_TOKEN (REQUIS — ex. $(gh auth token)),
 * ELASTICSEARCH_URL (défaut http://localhost:9200), VULNS_REPO, VULNS_INDEX.
 * Elles peuvent être posées une fois pour toutes dans `tools/.env`
 * (cf. `.env.example`) plutôt qu'exportées à chaque terminal.
 */
import './loadEnv.js';
import { fetchAlerts } from './vulns/github.js';
import { buildAlertDocuments, DEFAULT_INDEX, indexAlerts } from './vulns/elastic.js';

const REPO = process.env.VULNS_REPO ?? 'EnhydraV/ocr-jsld-p7';
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
const INDEX = process.env.VULNS_INDEX ?? DEFAULT_INDEX;

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  const alerts = await fetchAlerts(REPO);
  const documents = buildAlertDocuments(alerts);

  if (flags.has('--dry-run')) {
    for (const document of documents) console.log(JSON.stringify(document, null, 2));
    console.log(`${documents.length} alerte(s) — rien n'a été indexé (--dry-run).`);
    return;
  }

  const result = await indexAlerts(documents, ELASTICSEARCH_URL, INDEX);
  const open = alerts.filter((alert) => alert.state === 'open').length;
  console.log(
    `${result.documents} alerte(s) indexée(s) dans ${INDEX} (${open} ouverte(s), ${result.errors} erreur(s) d'indexation).`
  );
  if (result.errors > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
