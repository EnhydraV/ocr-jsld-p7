/**
 * Sauvegarde de la base : point d'entrée. Toute la logique vit dans
 * `lib/backupRunner.ts` (testable) ; ce script ne fait que lire l'environnement,
 * enchaîner les appels et journaliser.
 *
 *   npm run backup                         une passe (poste de développement)
 *   npm run backup -- --loop               boucle planifiée (service `backup` du compose)
 *   node dist/scripts/backup.js --health   état du planificateur (healthcheck Docker)
 *   docker compose exec -T server node dist/scripts/backup.js      (à la demande)
 *
 * Aucun outil supplémentaire n'est requis : ni CLI sqlite3, ni image dédiée.
 * Prisma, déjà présent pour les migrations, suffit. Cf. DOCUMENTATION.md § 7.
 *
 * Variables : BACKUP_DIR, BACKUP_INTERVAL_MINUTES (défaut 60),
 * BACKUP_VERIFY_HOUR (heure UTC du contrôle de restaurabilité, défaut 4).
 */
import { databaseFileFromUrl, millisecondsUntilNextRun } from '../lib/backup';
import { createSnapshot } from '../lib/backupRunner';
import { runScheduledBackup } from '../lib/backupScheduler';
import type { SnapshotResult, VerificationResult } from '../lib/backupRunner';
import { evaluateHealth, readState, writeState } from '../lib/backupState';
import { describeInspection } from '../lib/snapshotInspection';
import logger from '../lib/logger';

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'backups';
const INTERVAL_MINUTES = Number(process.env.BACKUP_INTERVAL_MINUTES ?? 60);
const VERIFY_HOUR = Number(process.env.BACKUP_VERIFY_HOUR ?? 4);

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Journalise le résultat d'une sauvegarde, planifiée ou lancée à la main. */
function report(result: { snapshot?: SnapshotResult; verified?: VerificationResult; failure?: string }): void {
  if (result.failure) {
    // Événement d'erreur structuré : il remonte dans Kibana, dashboard
    // « Sauvegardes » (§ 7.3)
    logger.error('backup_failed', { component: 'backup', reason: result.failure });
    return;
  }

  const snapshot = result.snapshot;
  if (snapshot) {
    logger.info('backup_snapshot', {
      component: 'backup',
      snapshot: snapshot.name,
      sizeKb: snapshot.sizeKb,
      organizations: snapshot.inspection.organizations,
      contacts: snapshot.inspection.contacts,
      kept: snapshot.kept,
      deleted: snapshot.deleted,
    });
  }
  if (result.verified) {
    logger.info('backup_verified', {
      component: 'backup',
      snapshot: result.verified.snapshot,
      detail: describeInspection(result.verified.inspection),
    });
  }
}

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

  // Sauvegarde immédiate au démarrage, avant l'alignement sur l'horloge : sur
  // un volume vierge l'état n'existe pas encore, et le healthcheck (--health)
  // répondrait « défaillant » jusqu'au prochain créneau — jusqu'à une heure
  // sur une installation neuve (bloquait le `--wait` du smoke test CI).
  // Accessoirement, une stack qui démarre est protégée tout de suite ; la
  // rétention horaire absorbe le doublon.
  report(
    await runScheduledBackup({
      databaseFile: databaseFileFromUrl(process.env.DATABASE_URL),
      backupDir: BACKUP_DIR,
      intervalMinutes: INTERVAL_MINUTES,
      verifyHour: VERIFY_HOUR,
    })
  );

  for (;;) {
    await sleep(millisecondsUntilNextRun(new Date(), INTERVAL_MINUTES));
    report(
      await runScheduledBackup({
        databaseFile: databaseFileFromUrl(process.env.DATABASE_URL),
        backupDir: BACKUP_DIR,
        intervalMinutes: INTERVAL_MINUTES,
        verifyHour: VERIFY_HOUR,
      })
    );
  }
}

async function main(): Promise<void> {
  // Verdict lisible par Docker : code de sortie 0 (sain) ou 1 (défaillant)
  if (process.argv.includes('--health')) {
    const verdict = evaluateHealth(readState(BACKUP_DIR), new Date());
    console.log(verdict.reason);
    if (!verdict.healthy) process.exit(1);
    return;
  }

  if (process.argv.includes('--loop')) {
    await loop();
    return;
  }

  // Passe unique : l'état est mis à jour aussi, pour que le healthcheck reflète
  // une sauvegarde lancée à la main
  const snapshot = await createSnapshot({
    databaseFile: databaseFileFromUrl(process.env.DATABASE_URL),
    backupDir: BACKUP_DIR,
  });
  report({ snapshot });
  writeState(BACKUP_DIR, {
    ...readState(BACKUP_DIR),
    lastRun: new Date().toISOString(),
    status: 'ok',
    intervalMinutes: INTERVAL_MINUTES,
    lastVerified: snapshot.name,
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
