/**
 * Logique de sauvegarde de la base SQLite — cf. DOCUMENTATION.md § 7.
 *
 * SQLite est une bibliothèque, pas un serveur : aucun processus distant ne peut
 * « dumper » la base, mais tout processus ayant accès au fichier peut en prendre
 * un instantané. `VACUUM INTO` le fait **à chaud**, en garantissant la cohérence
 * même pendant les écritures — là où un `cp` peut capturer un état déchiré.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/** Rétention grand-père / père / fils, dans l'esprit d'automysqlbackup. */
export interface RetentionPolicy {
  hourly: number;
  daily: number;
  weekly: number;
  monthly: number;
}

/**
 * 24 h / 7 j / 4 s / 12 m : au plus 47 instantanés conservés. Le palier horaire
 * ramène la perte de données maximale de 24 h à 1 h sur la journée écoulée, ce
 * qui couvre le cas le plus fréquent (l'erreur de saisie repérée le jour même).
 */
export const DEFAULT_RETENTION: RetentionPolicy = { hourly: 24, daily: 7, weekly: 4, monthly: 12 };

const SNAPSHOT_PATTERN = /^orion-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;

/**
 * Chemin réel du fichier SQLite. Prisma résout un chemin relatif **par rapport au
 * schéma** (`prisma/`), pas au répertoire courant : s'en écarter ferait
 * sauvegarder une base vide créée au mauvais endroit.
 */
export function databaseFileFromUrl(url: string | undefined, schemaDir = 'prisma'): string {
  if (!url) throw new Error('DATABASE_URL absente');
  if (!url.startsWith('file:')) throw new Error(`DATABASE_URL non SQLite : ${url}`);

  const raw = url.slice('file:'.length);
  return isAbsolute(raw) ? raw : resolve(schemaDir, raw);
}

/** Nom horodaté, triable en ordre lexicographique comme chronologique. */
export function snapshotName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `orion-${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}.db`
  );
}

export function parseSnapshotDate(name: string): Date | null {
  const match = SNAPSHOT_PATTERN.exec(name);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  );
}

const hourKey = (date: Date): string => date.toISOString().slice(0, 13);
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
const monthKey = (date: Date): string => date.toISOString().slice(0, 7);

/** Lundi de la semaine : clé de semaine sans les pièges du numéro ISO. */
function weekKey(date: Date): string {
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return dayKey(monday);
}

/**
 * Sélectionne les instantanés à conserver (même algorithme que `restic forget`) :
 * le plus récent de chacune des N dernières heures, des N derniers jours, des N
 * dernières semaines et des N derniers mois. Un même fichier peut satisfaire
 * plusieurs règles — le dernier instantané du jour compte à la fois comme
 * horaire, quotidien, hebdomadaire et mensuel.
 */
export function selectSnapshotsToKeep(names: string[], policy: RetentionPolicy = DEFAULT_RETENTION): string[] {
  const dated = names
    .map((name) => ({ name, date: parseSnapshotDate(name) }))
    .filter((entry): entry is { name: string; date: Date } => entry.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const keep = new Set<string>();
  const buckets: { limit: number; key: (date: Date) => string; seen: Set<string> }[] = [
    { limit: policy.hourly, key: hourKey, seen: new Set() },
    { limit: policy.daily, key: dayKey, seen: new Set() },
    { limit: policy.weekly, key: weekKey, seen: new Set() },
    { limit: policy.monthly, key: monthKey, seen: new Set() },
  ];

  for (const entry of dated) {
    for (const bucket of buckets) {
      const key = bucket.key(entry.date);
      if (bucket.seen.size >= bucket.limit || bucket.seen.has(key)) continue;
      bucket.seen.add(key);
      keep.add(entry.name);
    }
  }
  return [...keep];
}

/** Instantanés obsolètes. Un fichier au nom non reconnu n'est jamais supprimé. */
export function selectSnapshotsToDelete(names: string[], policy: RetentionPolicy = DEFAULT_RETENTION): string[] {
  const keep = new Set(selectSnapshotsToKeep(names, policy));
  return names.filter((name) => parseSnapshotDate(name) !== null && !keep.has(name));
}

export function latestSnapshot(names: string[]): string | null {
  const [newest] = names
    .filter((name) => parseSnapshotDate(name) !== null)
    .sort((a, b) => (parseSnapshotDate(b) as Date).getTime() - (parseSnapshotDate(a) as Date).getTime());
  return newest ?? null;
}

/**
 * Attente jusqu'au prochain multiple de l'intervalle **sur l'horloge**, et non
 * depuis l'instant de démarrage : les instantanés tombent ainsi à heure ronde,
 * qu'un conteneur soit relancé ou non.
 *
 * Nota : descendre sous 60 min est sans effet durable, la rétention ne gardant
 * qu'un instantané par heure — il faudrait un palier plus fin pour en profiter.
 */
export function millisecondsUntilNextRun(now: Date, intervalMinutes: number): number {
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  return intervalMs - (now.getTime() % intervalMs);
}

/**
 * Fichiers annexes du journal WAL. Les oublier lors d'une restauration est une
 * cause classique de corruption : SQLite rejouerait un WAL appartenant à
 * l'ancienne base par-dessus le fichier restauré.
 */
export function walSidecars(databaseFile: string): string[] {
  return [`${databaseFile}-wal`, `${databaseFile}-shm`].filter((file) => existsSync(file));
}

export const snapshotPath = (directory: string, name: string): string => join(directory, name);

/**
 * URL Prisma pour un fichier donné. **Toujours absolue** : Prisma résout un
 * chemin relatif depuis le répertoire du schéma, si bien que `file:backups/x.db`
 * pointerait sur `prisma/backups/x.db` (erreur SQLite 14, « unable to open »).
 */
export const fileUrl = (path: string): string => `file:${resolve(path)}`;
