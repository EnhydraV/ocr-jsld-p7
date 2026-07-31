/**
 * Une itération du planificateur de sauvegarde (§ 7.2/7.3).
 *
 * Isolée du script pour être testable, et surtout pour que le comportement en
 * cas d'échec soit vérifié : **cette fonction ne lève jamais**. Un incident
 * ponctuel ne doit pas tuer le planificateur, mais il doit laisser une trace
 * dans l'état, que relit le healthcheck du conteneur.
 */
import { basename } from 'node:path';
import { createSnapshot, verifySnapshot, type SnapshotResult, type VerificationResult } from './backupRunner';
import { snapshotPath } from './backup';
import { readState, writeState, type BackupState } from './backupState';

export interface ScheduledRunOptions {
  databaseFile: string;
  backupDir: string;
  intervalMinutes: number;
  /** Heure UTC du contrôle quotidien de restaurabilité. */
  verifyHour: number;
  now?: Date;
}

export interface ScheduledRunResult {
  state: BackupState;
  snapshot?: SnapshotResult;
  verified?: VerificationResult;
  failure?: string;
}

export async function runScheduledBackup(options: ScheduledRunOptions): Promise<ScheduledRunResult> {
  const { databaseFile, backupDir, intervalMinutes, verifyHour, now = new Date() } = options;
  const previous = readState(backupDir);

  try {
    const snapshot = await createSnapshot({ databaseFile, backupDir, now });
    // On vérifie l'instantané QUI VIENT D'ÊTRE PRIS, et non « le plus récent du
    // répertoire » : c'est celui qu'on restaurerait, et cela évite toute
    // dépendance à l'ordre des noms de fichiers
    const verified =
      now.getUTCHours() === verifyHour
        ? await verifySnapshot(snapshotPath(backupDir, snapshot.name))
        : undefined;

    const state: BackupState = {
      lastRun: now.toISOString(),
      status: 'ok',
      intervalMinutes,
      // Trace du dernier instantané réellement vérifié : c'est vers lui qu'on se
      // replie en cas de doute (§ 7.3). On enregistre le NOM et non le chemin,
      // pour que le champ garde la même forme d'un appel à l'autre.
      lastVerified: verified ? basename(verified.snapshot) : previous?.lastVerified,
      lastVerifiedAt: verified ? now.toISOString() : previous?.lastVerifiedAt,
    };
    writeState(backupDir, state);
    return { state, snapshot, verified };
  } catch (error: unknown) {
    const failure = error instanceof Error ? error.message : String(error);
    const state: BackupState = {
      lastRun: now.toISOString(),
      status: 'failed',
      message: failure,
      intervalMinutes,
      // L'échec n'efface pas la référence du dernier instantané sain
      lastVerified: previous?.lastVerified,
      lastVerifiedAt: previous?.lastVerifiedAt,
    };
    writeState(backupDir, state);
    return { state, failure };
  }
}
