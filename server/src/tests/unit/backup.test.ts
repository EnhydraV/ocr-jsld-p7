import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  databaseFileFromUrl,
  fileUrl,
  latestSnapshot,
  millisecondsUntilNextRun,
  parseSnapshotDate,
  selectSnapshotsToDelete,
  selectSnapshotsToKeep,
  snapshotName,
} from '../../lib/backup';

describe('snapshotName', () => {
  it('names snapshots so that alphabetical order is chronological order', () => {
    const older = snapshotName(new Date('2026-07-30T03:00:00Z'));
    const newer = snapshotName(new Date('2026-07-31T03:00:00Z'));

    expect(older).toBe('orion-20260730-030000.db');
    expect([newer, older].sort()).toEqual([older, newer]);
  });

  it('parses back the date it wrote', () => {
    const date = new Date('2026-07-31T06:53:44Z');

    expect(parseSnapshotDate(snapshotName(date))?.toISOString()).toBe(date.toISOString());
  });

  it('does not recognise foreign file names', () => {
    expect(parseSnapshotDate('dump.sql')).toBeNull();
    expect(parseSnapshotDate('pre-restore-orion-20260731-065352.db')).toBeNull();
  });
});

describe('databaseFileFromUrl', () => {
  it('keeps an absolute path as is, like the one used in the container', () => {
    expect(databaseFileFromUrl('file:/app/data/orion.db')).toBe('/app/data/orion.db');
  });

  // Prisma résout un chemin relatif depuis le répertoire du schéma : s'en écarter
  // ferait sauvegarder une base vide créée ailleurs.
  it('resolves a relative path against the schema directory', () => {
    expect(databaseFileFromUrl('file:./dev.db', 'prisma')).toBe(resolve('prisma', 'dev.db'));
  });

  it('rejects a missing or non-SQLite url', () => {
    expect(() => databaseFileFromUrl(undefined)).toThrow();
    expect(() => databaseFileFromUrl('postgresql://localhost/orion')).toThrow();
  });
});

describe('fileUrl', () => {
  // Une url relative provoque « unable to open the database file » (erreur 14),
  // Prisma la résolvant depuis le schéma et non depuis le cwd.
  it('always produces an absolute url', () => {
    expect(fileUrl('backups/orion-20260731-030000.db')).toBe(
      `file:${resolve('backups/orion-20260731-030000.db')}`
    );
  });
});

describe('retention', () => {
  const policy = { hourly: 24, daily: 7, weekly: 4, monthly: 12 };

  it('keeps one snapshot per hour over the last day', () => {
    // Deux instantanés dans la même heure : seul le plus récent survit
    const names = [
      snapshotName(new Date('2026-07-31T09:00:00Z')),
      snapshotName(new Date('2026-07-31T09:30:00Z')),
      snapshotName(new Date('2026-07-31T10:00:00Z')),
    ];

    expect(selectSnapshotsToDelete(names, policy)).toEqual([snapshotName(new Date('2026-07-31T09:00:00Z'))]);
  });

  it('thins hourly snapshots older than the hourly allowance', () => {
    // Un instantané par heure sur 72 h : 24 heures gardées, puis les paliers
    // quotidiens prennent le relais
    const names = Array.from({ length: 72 }, (_, index) =>
      snapshotName(new Date(Date.parse('2026-07-31T12:00:00Z') - index * 3_600_000))
    );

    const kept = selectSnapshotsToKeep(names, policy);

    expect(kept.length).toBeGreaterThanOrEqual(policy.hourly);
    expect(kept.length).toBeLessThan(names.length);
  });

  it('keeps a single snapshot per day once the hourly window has passed', () => {
    // Sans palier horaire : deux instantanés du même jour, le plus ancien tombe
    const dailyOnly = { hourly: 0, daily: 7, weekly: 4, monthly: 12 };
    const names = [
      snapshotName(new Date('2026-07-31T03:00:00Z')),
      snapshotName(new Date('2026-07-31T15:00:00Z')),
      snapshotName(new Date('2026-07-30T03:00:00Z')),
    ];

    expect(selectSnapshotsToDelete(names, dailyOnly)).toEqual([snapshotName(new Date('2026-07-31T03:00:00Z'))]);
  });

  it('thins older snapshots down to one per week then one per month', () => {
    // Un instantané par jour sur 120 jours
    const names = Array.from({ length: 120 }, (_, index) =>
      snapshotName(new Date(Date.UTC(2026, 6, 31) - index * 86_400_000))
    );

    const kept = selectSnapshotsToKeep(names, policy);

    // Un instantané par jour : le palier horaire n'en retient qu'un (une seule
    // heure distincte par jour), puis quotidiens, hebdomadaires et mensuels
    expect(kept.length).toBeGreaterThanOrEqual(policy.daily);
    expect(kept.length).toBeLessThanOrEqual(policy.hourly + policy.daily + policy.weekly + policy.monthly);
    expect(names.length - kept.length).toBeGreaterThan(90);
  });

  it('keeps every snapshot when there are fewer than the daily allowance', () => {
    const names = Array.from({ length: 3 }, (_, index) =>
      snapshotName(new Date(Date.UTC(2026, 6, 31) - index * 86_400_000))
    );

    expect(selectSnapshotsToDelete(names, policy)).toEqual([]);
  });

  // Garde-fou : un fichier étranger (dump manuel, sauvegarde pré-restauration)
  // ne doit jamais être supprimé par la rétention.
  it('never deletes a file it does not recognise', () => {
    const names = ['dump.sql', 'pre-restore-orion-20260731-065352.db', snapshotName(new Date('2026-01-01T03:00:00Z'))];

    expect(selectSnapshotsToDelete(names, policy)).toEqual([]);
  });
});

describe('millisecondsUntilNextRun', () => {
  // Aligné sur l'horloge : un conteneur relancé à 10 h 47 sauvegarde à 11 h 00,
  // pas à 11 h 47.
  it('waits until the next round hour by default', () => {
    const wait = millisecondsUntilNextRun(new Date('2026-07-31T10:47:00Z'), 60);

    expect(wait).toBe(13 * 60_000);
  });

  // Les bornes d'un pas de 15 min sont :00, :15, :30 et :45 — 10 h 47 min 30 s
  // attend donc jusqu'à 11 h 00, et non jusqu'à 10 h 50.
  it('supports a shorter interval, aligned on real clock boundaries', () => {
    expect(millisecondsUntilNextRun(new Date('2026-07-31T10:47:30Z'), 15)).toBe(12 * 60_000 + 30_000);
  });

  it('never returns a zero or negative delay, which would spin the loop', () => {
    expect(millisecondsUntilNextRun(new Date('2026-07-31T11:00:00Z'), 60)).toBe(60 * 60_000);
    expect(millisecondsUntilNextRun(new Date('2026-07-31T11:00:00Z'), 0)).toBeGreaterThan(0);
  });
});

describe('latestSnapshot', () => {
  it('returns the most recent snapshot', () => {
    const names = ['orion-20260730-030000.db', 'orion-20260731-030000.db', 'orion-20260729-030000.db'];

    expect(latestSnapshot(names)).toBe('orion-20260731-030000.db');
  });

  it('returns null when no snapshot is present', () => {
    expect(latestSnapshot(['dump.sql'])).toBeNull();
  });
});
