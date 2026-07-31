import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshot, resolveSource, restoreSnapshot, verifySnapshot } from '../../lib/backupRunner';
import { snapshotName } from '../../lib/backup';

// Ces tests manipulent de VRAIS fichiers SQLite : c'est le seul moyen de vérifier
// qu'un instantané est cohérent et restaurable. La base de test (créée par le
// globalSetup) sert de source ; tout le reste vit dans un répertoire temporaire.
const SOURCE_DATABASE = join('prisma', 'test.db');

let workspace: string;
let backupDir: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'orion-backup-'));
  backupDir = join(workspace, 'backups');
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('createSnapshot', () => {
  it('produces a consistent snapshot of the live database', async () => {
    const result = await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });

    expect(result.inspection.integrity).toBe('ok');
    expect(result.sizeKb).toBeGreaterThan(0);
    expect(existsSync(join(backupDir, result.name))).toBe(true);
  });

  it('creates the backup directory when it does not exist yet', async () => {
    expect(existsSync(backupDir)).toBe(false);

    await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });

    expect(existsSync(backupDir)).toBe(true);
  });

  it('refuses to snapshot a database that is not there', async () => {
    await expect(
      createSnapshot({ databaseFile: join(workspace, 'absente.db'), backupDir })
    ).rejects.toThrow(/introuvable/);
  });

  // La rétention tourne à chaque sauvegarde : c'est ce qui évite l'accumulation
  it('applies the retention policy and reports what it removed', async () => {
    // Deux instantanés dans la même heure : le plus ancien doit disparaître
    const older = snapshotName(new Date('2026-07-31T09:00:00Z'));
    const newer = snapshotName(new Date('2026-07-31T09:30:00Z'));
    await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir, now: new Date('2026-07-31T09:00:00Z') });
    const result = await createSnapshot({
      databaseFile: SOURCE_DATABASE,
      backupDir,
      now: new Date('2026-07-31T09:30:00Z'),
    });

    expect(result.deleted).toBe(1);
    expect(readdirSync(backupDir)).toContain(newer);
    expect(readdirSync(backupDir)).not.toContain(older);
  });

  it('leaves foreign files alone', async () => {
    writeFileSync(join(workspace, 'garde.txt'), 'x');
    // Fichier étranger déposé dans le répertoire de sauvegarde
    const strange = join(backupDir, 'dump-manuel.sql');
    await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });
    writeFileSync(strange, 'contenu');

    await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir, now: new Date('2026-08-01T09:00:00Z') });

    expect(existsSync(strange)).toBe(true);
  });
});

describe('resolveSource', () => {
  it('falls back to the most recent snapshot', async () => {
    await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir, now: new Date('2026-07-30T09:00:00Z') });
    const newer = await createSnapshot({
      databaseFile: SOURCE_DATABASE,
      backupDir,
      now: new Date('2026-07-31T09:00:00Z'),
    });

    expect(resolveSource(backupDir)).toBe(join(backupDir, newer.name));
  });

  it('reports an explicit snapshot that does not exist', () => {
    expect(() => resolveSource(backupDir, join(workspace, 'absent.db'))).toThrow(/introuvable/);
  });

  it('reports an empty backup directory', () => {
    expect(() => resolveSource(backupDir)).toThrow(/Aucun instantané/);
  });
});

describe('verifySnapshot', () => {
  it('confirms a snapshot is restorable without touching the live database', async () => {
    const { name } = await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });

    const result = await verifySnapshot(join(backupDir, name));

    expect(result.inspection.integrity).toBe('ok');
    // La base source est intacte : la vérification travaille sur une copie
    expect(existsSync(SOURCE_DATABASE)).toBe(true);
  });

  // Le cas qui compte : un contrôle qui ne détecterait pas la corruption ne
  // vaudrait rien (§ 7.3)
  it('rejects a corrupted snapshot instead of reporting success', async () => {
    const corrupted = join(backupDir, snapshotName(new Date('2026-07-31T10:00:00Z')));
    await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });
    writeFileSync(corrupted, 'ceci n’est pas une base SQLite');

    await expect(verifySnapshot(corrupted)).rejects.toThrow();
  });
});

describe('restoreSnapshot', () => {
  it('replaces the database and keeps a reversible safety copy', async () => {
    const { name } = await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });
    const target = join(workspace, 'cible.db');
    copyFileSync(SOURCE_DATABASE, target);

    const result = await restoreSnapshot({ source: join(backupDir, name), databaseFile: target, backupDir });

    expect(result.inspection.integrity).toBe('ok');
    expect(result.safetySnapshot).not.toBeNull();
    expect(existsSync(result.safetySnapshot as string)).toBe(true);
  });

  it('restores onto a missing database without a safety copy to make', async () => {
    const { name } = await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });
    const target = join(workspace, 'nouvelle.db');

    const result = await restoreSnapshot({ source: join(backupDir, name), databaseFile: target, backupDir });

    expect(result.safetySnapshot).toBeNull();
    expect(existsSync(target)).toBe(true);
  });

  // Oublier ces fichiers ferait rejouer le journal de l'ANCIENNE base par-dessus
  // la base restaurée : corruption ou données périmées
  it('removes the leftover write-ahead log of the replaced database', async () => {
    const { name } = await createSnapshot({ databaseFile: SOURCE_DATABASE, backupDir });
    const target = join(workspace, 'cible.db');
    copyFileSync(SOURCE_DATABASE, target);
    writeFileSync(`${target}-wal`, 'journal résiduel');
    writeFileSync(`${target}-shm`, 'mémoire partagée résiduelle');

    const result = await restoreSnapshot({ source: join(backupDir, name), databaseFile: target, backupDir });

    expect(result.removedSidecars).toHaveLength(2);
    expect(existsSync(`${target}-wal`)).toBe(false);
    expect(existsSync(`${target}-shm`)).toBe(false);
  });

  it('refuses a snapshot that does not exist', async () => {
    await expect(
      restoreSnapshot({ source: join(workspace, 'absent.db'), databaseFile: join(workspace, 'x.db'), backupDir })
    ).rejects.toThrow(/introuvable/);
  });
});
