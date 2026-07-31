/**
 * Inspection d'un fichier SQLite quelconque — instantané de sauvegarde comme
 * base en service (cf. DOCUMENTATION.md § 7.3).
 *
 * Prisma sait ouvrir une autre base que celle du schéma : la vérification d'une
 * sauvegarde n'exige donc aucun outil supplémentaire (ni CLI `sqlite3`), et ne
 * touche jamais à la base de production.
 */
import { PrismaClient } from '@prisma/client';
import { fileUrl } from './backup';

export interface SnapshotInspection {
  integrity: string;
  organizations: number;
  contacts: number;
}

export async function inspectSnapshot(file: string): Promise<SnapshotInspection> {
  const client = new PrismaClient({ datasources: { db: { url: fileUrl(file) } } });
  try {
    const rows = await client.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check');
    return {
      integrity: rows[0]?.integrity_check ?? 'inconnu',
      organizations: await client.organization.count(),
      contacts: await client.contact.count(),
    };
  } finally {
    await client.$disconnect();
  }
}

export const describeInspection = (inspection: SnapshotInspection): string =>
  `intégrité ${inspection.integrity}, ${inspection.organizations} organisation(s), ${inspection.contacts} contact(s)`;
