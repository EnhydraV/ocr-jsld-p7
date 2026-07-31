/**
 * Sauvegarde de la base : instantané à chaud + application de la rétention.
 *
 *   npm run backup                       une passe (poste de développement)
 *   npm run backup -- --loop             boucle planifiée (service `backup` du compose)
 *   docker compose exec -T server node dist/scripts/backup.js      (à la demande)
 *   docker run --rm -v orion-db:/app/data -v "$PWD/backups":/app/backups \
 *     ghcr.io/enhydrav/ocr-jsld-p7-server:latest node dist/scripts/backup.js
 *
 * Aucun outil supplémentaire n'est requis : ni CLI sqlite3, ni image dédiée.
 * Prisma, déjà présent pour les migrations, suffit. Cf. § 7.
 *
 *   node dist/scripts/backup.js --health   état du planificateur (healthcheck)
 *
 * Variables : BACKUP_DIR, BACKUP_INTERVAL_MINUTES (défaut 60),
 * BACKUP_VERIFY_HOUR (heure UTC du contrôle quotidien de restaurabilité, défaut 4).
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_RETENTION,
  databaseFileFromUrl,
  latestSnapshot,
  millisecondsUntilNextRun,
  selectSnapshotsToDelete,
  snapshotName,
  snapshotPath,
} from '../lib/backup';
import { describeInspection, inspectSnapshot } from '../lib/snapshotInspection';
import { evaluateHealth, readState, writeState, type BackupState } from '../lib/backupState';
import logger from '../lib/logger';

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'backups';
const INTERVAL_MINUTES = Number(process.env.BACKUP_INTERVAL_MINUTES ?? 60);
const VERIFY_HOUR = Number(process.env.BACKUP_VERIFY_HOUR ?? 4);

async function takeSnapshot(): Promise<string> {
  const databaseFile = databaseFileFromUrl(process.env.DATABASE_URL);
  if (!existsSync(databaseFile)) throw new Error(`Base introuvable : ${databaseFile}`);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const name = snapshotName(new Date());
  // Chemin absolu : VACUUM INTO résout un relatif depuis le cwd du processus,
  // Prisma depuis le schéma — deux références différentes, donc aucun relatif
  const target = resolve(snapshotPath(BACKUP_DIR, name));

  // VACUUM INTO refuse d'écraser un fichier existant : pas d'écrasement
  // accidentel d'une sauvegarde
  const client = new PrismaClient();
  try {
    // Instantané cohérent même si l'application écrit pendant l'opération
    await client.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    await client.$disconnect();
  }

  // Une sauvegarde non vérifiée n'est qu'une intention de sauvegarde
  const inspection = await inspectSnapshot(target);
  if (inspection.integrity !== 'ok') {
    unlinkSync(target);
    throw new Error(`Instantané corrompu (${inspection.integrity}) — fichier supprimé`);
  }

  const sizeKb = Math.round(statSync(target).size / 1024);
  const existing = readdirSync(BACKUP_DIR);
  const obsolete = selectSnapshotsToDelete(existing, DEFAULT_RETENTION);
  for (const file of obsolete) unlinkSync(snapshotPath(BACKUP_DIR, file));

  // Événement structuré : il remonte dans Kibana comme les logs applicatifs
  // (dashboard « Sauvegardes », § 7.3)
  logger.info('backup_snapshot', {
    component: 'backup',
    snapshot: name,
    sizeKb,
    organizations: inspection.organizations,
    contacts: inspection.contacts,
    kept: existing.length - obsolete.length,
    deleted: obsolete.length,
  });
  return name;
}

/**
 * Contrôle quotidien de restaurabilité. Lève si l'instantané n'est pas
 * restaurable : un contrôle qui se contenterait d'afficher son résultat ne
 * vaudrait rien, personne ne lisant les journaux d'un service qui va bien.
 */
async function verifyDaily(): Promise<string> {
  const latest = latestSnapshot(readdirSync(BACKUP_DIR));
  if (!latest) throw new Error('contrôle impossible : aucun instantané');

  const inspection = await inspectSnapshot(snapshotPath(BACKUP_DIR, latest));
  if (inspection.integrity !== 'ok') {
    throw new Error(`instantané ${latest} NON restaurable (${inspection.integrity})`);
  }
  logger.info('backup_verified', {
    component: 'backup',
    snapshot: latest,
    detail: describeInspection(inspection),
    organizations: inspection.organizations,
    contacts: inspection.contacts,
  });
  return latest;
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/**
 * Boucle du service `backup` : alignée sur l'horloge (et non sur l'instant de
 * démarrage du conteneur), pour que les instantanés tombent à heure ronde.
 */
async function loop(): Promise<void> {
  logger.info('backup_scheduler_started', {
    component: 'backup',
    intervalMinutes: INTERVAL_MINUTES,
    verifyHourUtc: VERIFY_HOUR,
  });

  for (;;) {
    await sleep(millisecondsUntilNextRun(new Date(), INTERVAL_MINUTES));

    const previous = readState(BACKUP_DIR);
    try {
      await takeSnapshot();
      const verified = new Date().getUTCHours() === VERIFY_HOUR ? await verifyDaily() : undefined;

      writeState(BACKUP_DIR, {
        lastRun: new Date().toISOString(),
        status: 'ok',
        intervalMinutes: INTERVAL_MINUTES,
        // On conserve la trace du dernier instantané réellement vérifié : c'est
        // celui vers lequel se replier en cas de doute (§ 7.3)
        lastVerified: verified ?? previous?.lastVerified,
        lastVerifiedAt: verified ? new Date().toISOString() : previous?.lastVerifiedAt,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Une erreur ponctuelle ne doit pas tuer le planificateur : les
      // sauvegardes suivantes ont toutes leurs chances de réussir. En revanche
      // l'incident est écrit dans l'état, ce qui rend le service `unhealthy`.
      logger.error('backup_failed', { component: 'backup', reason: message });
      writeState(BACKUP_DIR, {
        lastRun: new Date().toISOString(),
        status: 'failed',
        message,
        intervalMinutes: INTERVAL_MINUTES,
        lastVerified: previous?.lastVerified,
        lastVerifiedAt: previous?.lastVerifiedAt,
      });
    }
  }
}

/** Verdict lisible par Docker : code de sortie 0 (sain) ou 1 (défaillant). */
function reportHealth(): void {
  const verdict = evaluateHealth(readState(BACKUP_DIR), new Date());
  console.log(verdict.reason);
  if (!verdict.healthy) process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes('--health')) {
    reportHealth();
    return;
  }
  if (process.argv.includes('--loop')) {
    await loop();
    return;
  }

  // Passe unique : l'état est mis à jour aussi, pour que le healthcheck reflète
  // une sauvegarde lancée à la main
  const name = await takeSnapshot();
  const state: BackupState = { lastRun: new Date().toISOString(), status: 'ok', intervalMinutes: INTERVAL_MINUTES };
  writeState(BACKUP_DIR, { ...readState(BACKUP_DIR), ...state, lastVerified: name });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
