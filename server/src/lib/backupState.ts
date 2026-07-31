/**
 * État de la dernière sauvegarde, pour que son échec soit détectable par une
 * machine et pas seulement par la lecture des journaux (cf. DOCUMENTATION.md
 * § 7.3). C'est ce fichier que lit le healthcheck du service `backup`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_FILE = 'backup-state.json';

export type BackupStatus = 'ok' | 'failed';

export interface BackupState {
  /** Horodatage ISO de la dernière tentative, réussie ou non. */
  lastRun: string;
  status: BackupStatus;
  /** Cause de l'échec, absente quand tout va bien. */
  message?: string;
  /** Dernier instantané dont la restaurabilité a été confirmée. */
  lastVerified?: string;
  lastVerifiedAt?: string;
  /** Cadence déclarée, pour juger d'une sauvegarde en retard. */
  intervalMinutes: number;
}

export const statePath = (directory: string): string => join(directory, STATE_FILE);

export function readState(directory: string): BackupState | null {
  const file = statePath(directory);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BackupState;
  } catch {
    // Fichier tronqué (arrêt brutal en pleine écriture) : traité comme absent
    return null;
  }
}

export function writeState(directory: string, state: BackupState): void {
  writeFileSync(statePath(directory), `${JSON.stringify(state, null, 2)}\n`);
}

export interface HealthVerdict {
  healthy: boolean;
  reason: string;
}

/**
 * Santé du planificateur. Deux façons d'être en défaut : la dernière tentative a
 * échoué, ou plus aucune sauvegarde n'a eu lieu depuis deux cycles — ce second
 * cas attrape le planificateur silencieusement bloqué, qui est le plus
 * dangereux car il ne produit aucun message.
 */
export function evaluateHealth(state: BackupState | null, now: Date): HealthVerdict {
  if (!state) return { healthy: false, reason: 'aucune sauvegarde enregistrée' };
  if (state.status === 'failed') {
    return { healthy: false, reason: `dernière sauvegarde en échec : ${state.message ?? 'cause inconnue'}` };
  }

  const elapsedMinutes = (now.getTime() - Date.parse(state.lastRun)) / 60_000;
  const tolerance = state.intervalMinutes * 2;
  if (elapsedMinutes > tolerance) {
    return {
      healthy: false,
      reason: `aucune sauvegarde depuis ${Math.round(elapsedMinutes)} min (cadence ${state.intervalMinutes} min)`,
    };
  }
  return { healthy: true, reason: `dernière sauvegarde il y a ${Math.round(elapsedMinutes)} min` };
}
