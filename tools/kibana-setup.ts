/**
 * Configuration reproductible de Kibana : data views + dashboards versionnés.
 *
 *   npm run kibana:setup     crée les data views manquantes, puis importe
 *                            kibana/dashboards.ndjson s'il existe
 *   npm run kibana:export    exporte les dashboards de Kibana vers ce fichier
 *
 * Cycle de travail : on construit (ou ajuste) un dashboard dans l'interface, on
 * l'exporte, on commite le NDJSON. N'importe qui reconstruit alors la même vue
 * d'une seule commande, sans reproduire les clics — c'est la seule façon d'avoir
 * un dashboard reproductible. Écrire ce JSON à la main n'en est pas une : le
 * format des visualisations Lens est trop verbeux et trop pointilleux.
 *
 * Variables : KIBANA_URL (défaut http://localhost:5601), KIBANA_OBJECTS.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { buildDashboard, buildPanels } from './kibana/buildDashboard.js';
import { buildBackupDashboard, buildBackupObjects } from './kibana/buildBackupDashboard.js';
import { buildLogsDashboard, buildLogsObjects } from './kibana/buildLogsDashboard.js';
import { buildVulnDashboard, buildVulnObjects } from './kibana/buildVulnDashboard.js';
import { KIBANA_URL } from './kibana/client.js';
import { DATA_VIEWS, ensureDataView } from './kibana/dataViews.js';
import { createObjects, exportDashboards, importObjects } from './kibana/savedObjects.js';

const OBJECTS_FILE = process.env.KIBANA_OBJECTS ?? join('kibana', 'dashboards.ndjson');

async function runExport(): Promise<void> {
  const ndjson = await exportDashboards();
  if (ndjson.trim().length === 0) {
    console.log('Aucun dashboard à exporter — en construire un dans Kibana au préalable.');
    return;
  }

  mkdirSync(dirname(OBJECTS_FILE), { recursive: true });
  writeFileSync(OBJECTS_FILE, ndjson);
  const objectCount = ndjson.trim().split('\n').length;
  console.log(`${objectCount} objet(s) exporté(s) dans ${OBJECTS_FILE} — à commiter.`);
}

async function runSetup(fromFile: boolean): Promise<void> {
  for (const spec of DATA_VIEWS) {
    const result = await ensureDataView(spec);
    console.log(`Data view « ${spec.title} » : ${result === 'created' ? 'créée' : 'déjà présente'}`);
  }

  // Par défaut le dashboard décrit en code fait foi : une modification de
  // buildDashboard.ts est ainsi toujours prise en compte. `--from-file` importe
  // à la place le NDJSON exporté (utile après une retouche dans l'interface).
  if (fromFile) {
    if (!existsSync(OBJECTS_FILE)) {
      throw new Error(`${OBJECTS_FILE} absent : lancer « npm run kibana:export » d'abord.`);
    }
    // Kibana exige une extension .ndjson sur le fichier envoyé
    const summary = await importObjects(readFileSync(OBJECTS_FILE, 'utf8'), basename(OBJECTS_FILE));
    console.log(`${summary.successCount} objet(s) importé(s) depuis ${OBJECTS_FILE}`);
    for (const error of summary.errors ?? []) {
      console.error(`  échec ${error.type}/${error.id} : ${error.error.type}`);
    }
    return;
  }

  const panels = buildPanels();
  const logsObjects = buildLogsObjects();
  const created = await createObjects([
    ...panels,
    buildDashboard(panels),
    ...logsObjects,
    buildLogsDashboard(),
    ...buildBackupObjects(),
    buildBackupDashboard(),
    ...buildVulnObjects(),
    buildVulnDashboard(),
  ]);
  console.log(`${created} objet(s) créés depuis le code (4 dashboards)`);
  console.log(`Pipeline       : ${KIBANA_URL}/app/dashboards#/view/orion-pipeline-dashboard`);
  console.log(`Logs           : ${KIBANA_URL}/app/dashboards#/view/orion-logs-dashboard`);
  console.log(`Sauvegardes    : ${KIBANA_URL}/app/dashboards#/view/orion-backup-dashboard`);
  console.log(`Vulnérabilités : ${KIBANA_URL}/app/dashboards#/view/orion-vulns-dashboard`);
}

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  console.log(`Kibana : ${KIBANA_URL}`);
  await (flags.has('--export') ? runExport() : runSetup(flags.has('--from-file')));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
