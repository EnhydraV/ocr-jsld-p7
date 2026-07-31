/**
 * Opérations de sauvegarde et de restauration — cf. DOCUMENTATION.md § 7.
 *
 * Toute la logique vit ici, et non dans les scripts : ces fonctions ne lisent
 * aucune variable d'environnement et n'écrivent aucun journal, elles reçoivent
 * leurs paramètres et renvoient des données. Elles sont donc testables, là où un
 * script à `process.argv` ne l'est pas.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_RETENTION,
  latestSnapshot,
  selectSnapshotsToDelete,
  snapshotName,
  snapshotPath,
  walSidecars,
  type RetentionPolicy,
} from './backup';
import { inspectSnapshot, type SnapshotInspection } from './snapshotInspection';

export interface SnapshotResult {
  name: string;
  sizeKb: number;
  kept: number;
  deleted: number;
  inspection: SnapshotInspection;
}

export interface CreateSnapshotOptions {
  databaseFile: string;
  backupDir: string;
  retention?: RetentionPolicy;
  now?: Date;
}

/**
 * Instantané à chaud via `VACUUM INTO`, que SQLite garantit cohérent même sous
 * écritures concurrentes, puis application de la rétention.
 */
export async function createSnapshot(options: CreateSnapshotOptions): Promise<SnapshotResult> {
  const { databaseFile, backupDir, retention = DEFAULT_RETENTION, now = new Date() } = options;
  if (!existsSync(databaseFile)) throw new Error(`Base introuvable : ${databaseFile}`);

  mkdirSync(backupDir, { recursive: true });
  const name = snapshotName(now);
  // Chemin absolu : VACUUM INTO résout un relatif depuis le cwd du processus,
  // Prisma depuis le répertoire du schéma — deux références différentes
  const target = resolve(snapshotPath(backupDir, name));

  // VACUUM INTO refuse d'écraser un fichier existant : pas d'écrasement
  // accidentel d'une sauvegarde
  const client = new PrismaClient({ datasources: { db: { url: `file:${resolve(databaseFile)}` } } });
  try {
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

  const existing = readdirSync(backupDir);
  const obsolete = selectSnapshotsToDelete(existing, retention);
  for (const file of obsolete) unlinkSync(snapshotPath(backupDir, file));

  return {
    name,
    sizeKb: Math.round(statSync(target).size / 1024),
    kept: existing.length - obsolete.length,
    deleted: obsolete.length,
    inspection,
  };
}

/** Instantané visé : celui demandé, ou le plus récent du répertoire. */
export function resolveSource(backupDir: string, explicit?: string): string {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Instantané introuvable : ${explicit}`);
    return explicit;
  }
  const latest = latestSnapshot(existsSync(backupDir) ? readdirSync(backupDir) : []);
  if (!latest) throw new Error(`Aucun instantané dans ${backupDir}`);
  return snapshotPath(backupDir, latest);
}

export interface VerificationResult {
  snapshot: string;
  inspection: SnapshotInspection;
}

/**
 * Restauration à blanc : l'instantané est restauré ailleurs, contrôlé, puis
 * jeté. **Lève** s'il n'est pas restaurable — un contrôle qui se contenterait
 * d'afficher son résultat ne servirait à rien (§ 7.3).
 */
export async function verifySnapshot(source: string): Promise<VerificationResult> {
  const probe = join(tmpdir(), `orion-verify-${process.pid}-${Date.now()}.db`);
  copyFileSync(source, probe);
  try {
    const inspection = await inspectSnapshot(probe);
    if (inspection.integrity !== 'ok') {
      throw new Error(`instantané ${source} NON restaurable (${inspection.integrity})`);
    }
    return { snapshot: source, inspection };
  } finally {
    if (existsSync(probe)) unlinkSync(probe);
  }
}

export interface RestoreResult {
  source: string;
  safetySnapshot: string | null;
  removedSidecars: string[];
  inspection: SnapshotInspection;
}

/**
 * Remplace la base par un instantané. L'état courant est d'abord copié sous
 * `pre-restore-*`, ce qui rend l'opération réversible.
 */
export async function restoreSnapshot(options: {
  source: string;
  databaseFile: string;
  backupDir: string;
  now?: Date;
}): Promise<RestoreResult> {
  const { source, databaseFile, backupDir, now = new Date() } = options;
  if (!existsSync(source)) throw new Error(`Instantané introuvable : ${source}`);

  let safetySnapshot: string | null = null;
  if (existsSync(databaseFile)) {
    mkdirSync(backupDir, { recursive: true });
    safetySnapshot = snapshotPath(backupDir, `pre-restore-${snapshotName(now)}`);
    copyFileSync(databaseFile, safetySnapshot);
  }

  copyFileSync(source, databaseFile);

  // Sans cela, SQLite rejouerait le WAL de l'ANCIENNE base par-dessus la base
  // restaurée : corruption ou données périmées
  const removedSidecars = walSidecars(databaseFile);
  for (const sidecar of removedSidecars) unlinkSync(sidecar);

  const inspection = await inspectSnapshot(databaseFile);
  if (inspection.integrity !== 'ok') throw new Error(`Base restaurée incohérente (${inspection.integrity})`);

  return { source, safetySnapshot, removedSidecars, inspection };
}
