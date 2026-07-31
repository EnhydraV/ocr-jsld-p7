/**
 * Restauration de la base : point d'entrée. La logique est dans
 * `lib/backupRunner.ts` (testable). Cf. DOCUMENTATION.md § 7.3.
 *
 *   npm run backup:verify        restauration À BLANC du dernier instantané :
 *                                vérifie qu'il est réellement restaurable, sans
 *                                toucher à la base en service
 *   npm run restore -- --yes     restauration RÉELLE du dernier instantané
 *   npm run restore -- --yes --from backups/orion-20260731-030000.db
 *
 * Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est le
 * mode `--verify`, automatisé par le service `backup`, qui fait la différence.
 */
import { databaseFileFromUrl } from '../lib/backup';
import { resolveSource, restoreSnapshot, verifySnapshot } from '../lib/backupRunner';
import { describeInspection } from '../lib/snapshotInspection';

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'backups';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv);
  const fromIndex = argv.indexOf('--from');
  const source = resolveSource(BACKUP_DIR, fromIndex === -1 ? undefined : argv[fromIndex + 1]);

  if (flags.has('--verify')) {
    const { inspection } = await verifySnapshot(source);
    console.log(`Vérification de ${source} : ${describeInspection(inspection)}`);
    console.log('Instantané restaurable.');
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

  const result = await restoreSnapshot({
    source,
    databaseFile: databaseFileFromUrl(process.env.DATABASE_URL),
    backupDir: BACKUP_DIR,
  });

  if (result.safetySnapshot) console.log(`État précédent conservé : ${result.safetySnapshot}`);
  for (const sidecar of result.removedSidecars) console.log(`Journal résiduel supprimé : ${sidecar}`);
  console.log(`Restauré depuis ${source} : ${describeInspection(result.inspection)}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
