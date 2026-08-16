/**
 * Métriques DORA et KPI du pipeline, calculées depuis l'API GitHub Actions.
 *
 *   npm run dora                       rapport texte (cache disque)
 *   npm run dora -- --refresh          force le rafraîchissement depuis l'API
 *   npm run dora:index                 indexe les métriques dans Elasticsearch
 *   npm run dora:index -- --dry-run    affiche les documents sans les envoyer
 *
 * Variables d'environnement : GITHUB_TOKEN (facultatif, relève la limite de
 * 60 requêtes/h), ELASTICSEARCH_URL (défaut http://localhost:9200), DORA_REPO,
 * DORA_CACHE, PIPELINE_INDEX, DORA_WORKFLOW (chemin du workflow mesuré, défaut
 * `.github/workflows/ci.yml` — les runs « Dependabot Updates » sont écartés).
 * Elles peuvent être posées une fois pour toutes dans `tools/.env`
 * (cf. `.env.example`) plutôt qu'exportées à chaque terminal.
 *
 * Les définitions retenues sont justifiées dans DOCUMENTATION.md § 6.1.
 */
import './loadEnv.js';
import { DEFAULT_WORKFLOW_PATH, fetchRunsWithJobs } from './dora/github.js';
import { computeMetrics } from './dora/metrics.js';
import { buildReport } from './dora/report.js';
import { buildBulkBody, buildDocuments, DEFAULT_INDEX, indexDocuments } from './dora/elastic.js';

const REPO = process.env.DORA_REPO ?? 'EnhydraV/ocr-jsld-p7';
const CACHE_DIR = process.env.DORA_CACHE ?? '.dora-cache';
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
const INDEX = process.env.PIPELINE_INDEX ?? DEFAULT_INDEX;
const WORKFLOW_PATH = process.env.DORA_WORKFLOW ?? DEFAULT_WORKFLOW_PATH;

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  const entries = await fetchRunsWithJobs({
    repo: REPO,
    cacheDir: CACHE_DIR,
    refresh: flags.has('--refresh'),
    workflowPath: WORKFLOW_PATH,
  });
  const metrics = computeMetrics(entries);

  if (!flags.has('--index')) {
    console.log(buildReport(metrics, REPO, WORKFLOW_PATH));
    return;
  }

  const documents = buildDocuments(entries, metrics);

  if (flags.has('--dry-run')) {
    const counts = documents.reduce<Record<string, number>>((accumulator, document) => {
      const type = String(document.body.doc_type);
      accumulator[type] = (accumulator[type] ?? 0) + 1;
      return accumulator;
    }, {});
    console.log(`${documents.length} documents à indexer dans « ${INDEX} » :`, counts);
    console.log('\nExtrait NDJSON (2 premiers documents) :');
    console.log(buildBulkBody(documents.slice(0, 2), INDEX).trimEnd());
    return;
  }

  const result = await indexDocuments(documents, ELASTICSEARCH_URL, INDEX);
  console.log(
    `${result.documents} documents indexés dans « ${INDEX} » sur ${ELASTICSEARCH_URL}` +
      (result.errors > 0 ? ` — ${result.errors} en erreur` : '')
  );
  console.log(`Dans Kibana : data view « ${INDEX} », champ temporel « @timestamp ».`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
