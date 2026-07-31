/**
 * Restauration de la base depuis un instantané — cf. DOCUMENTATION.md § 7.3.
 *
 *   npm run backup:verify        restauration À BLANC du dernier instantané :
 *                                vérifie qu'il est réellement restaurable, sans
 *                                toucher à la base de production
 *   npm run restore -- --yes     restauration RÉELLE du dernier instantané
 *   npm run restore -- --yes --from backups/orion-20260731-030000.db
 *
 * Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est le
 * mode `--verify`, automatisable, qui fait la différence.
 */
import { copyFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseFileFromUrl, latestSnapshot, snapshotName, snapshotPath, walSidecars } from '../lib/backup';
import { describeInspection, inspectSnapshot } from '../lib/snapshotInspection';

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'backups';

function resolveSource(explicit: string | undefined): string {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Instantané introuvable : ${explicit}`);
    return explicit;
  }
  const latest = latestSnapshot(existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR) : []);
  if (!latest) throw new Error(`Aucun instantané dans ${BACKUP_DIR}`);
  return snapshotPath(BACKUP_DIR, latest);
}

/** Restauration à blanc : on restaure ailleurs, on contrôle, on jette. */
async function verify(source: string): Promise<void> {
  const probe = join(tmpdir(), `orion-verify-${Date.now()}.db`);
  copyFileSync(source, probe);
  try {
    const result = await inspectSnapshot(probe);
    console.log(`Vérification de ${source} : ${describeInspection(result)}`);
    if (result.integrity !== 'ok') throw new Error('Instantané non restaurable');
    console.log('Instantané restaurable.');
  } finally {
    if (existsSync(probe)) unlinkSync(probe);
  }
}

async function restore(source: string): Promise<void> {
  const databaseFile = databaseFileFromUrl(process.env.DATABASE_URL);

  // Filet : la base actuelle est sauvegardée avant d'être remplacée, donc la
  // restauration est réversible
  if (existsSync(databaseFile)) {
    const safety = snapshotPath(BACKUP_DIR, `pre-restore-${snapshotName(new Date())}`);
    copyFileSync(databaseFile, safety);
    console.log(`État précédent conservé : ${safety}`);
  }

  copyFileSync(source, databaseFile);

  // Sans cela, SQLite rejouerait le WAL de l'ANCIENNE base par-dessus la base
  // restaurée : corruption ou données périmées
  for (const sidecar of walSidecars(databaseFile)) {
    unlinkSync(sidecar);
    console.log(`Journal résiduel supprimé : ${sidecar}`);
  }

  const result = await inspectSnapshot(databaseFile);
  console.log(`Restauré depuis ${source} : ${describeInspection(result)}`);
  if (result.integrity !== 'ok') throw new Error('Base restaurée incohérente');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv);
  const fromIndex = argv.indexOf('--from');
  const source = resolveSource(fromIndex === -1 ? undefined : argv[fromIndex + 1]);

  if (flags.has('--verify')) {
    await verify(source);
    return;
  }

  // Action destructive : jamais par défaut. Le serveur doit être arrêté, sinon
  // il écrit dans le fichier qu'on remplace.
  if (!flags.has('--yes')) {
    console.error(
      'Restauration réelle : ajouter --yes pour confirmer.\n' +
        "Arrêter d'abord l'application (docker compose stop server), sinon la base est écrite pendant le remplacement.\n" +
        `Instantané visé : ${source}`
    );
    process.exit(1);
  }
  await restore(source);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
