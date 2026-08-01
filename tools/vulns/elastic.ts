/**
 * Projection des alertes Dependabot dans Elasticsearch, pour le dashboard
 * « Vulnérabilités » (§ 8). Un document par alerte, `_id` = numéro d'alerte :
 * réindexer met à jour les états (open → fixed…) sans jamais dupliquer.
 */
import type { BulkDocument, IndexMapping, IndexResult } from '../elastic.js';
import { indexDocuments } from '../elastic.js';
import type { DependabotAlert } from './types.js';

export const DEFAULT_INDEX = 'orion-vulnerabilities';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mapping explicite : tout en keyword/date, ces champs servent à agréger. */
export const MAPPING: IndexMapping = {
  mappings: {
    properties: {
      '@timestamp': { type: 'date' },
      state: { type: 'keyword' },
      severity: { type: 'keyword' },
      package: { type: 'keyword' },
      ecosystem: { type: 'keyword' },
      manifest: { type: 'keyword' },
      scope: { type: 'keyword' },
      ghsa_id: { type: 'keyword' },
      cve_id: { type: 'keyword' },
      summary: { type: 'keyword' },
      cvss_score: { type: 'float' },
      created_at: { type: 'date' },
      fixed_at: { type: 'date' },
      dismissed_at: { type: 'date' },
      dismissed_reason: { type: 'keyword' },
      remediation_days: { type: 'float' },
    },
  },
};

/**
 * `@timestamp` = date de création : la chronologie du dashboard raconte
 * l'apparition des vulnérabilités. Le délai de remédiation (§ 5.3) n'est
 * calculé que pour les alertes réellement corrigées — un classement sans
 * correctif (dismissed) n'est pas une remédiation.
 */
export function buildAlertDocuments(alerts: DependabotAlert[]): BulkDocument[] {
  return alerts.map((alert) => ({
    id: `alert-${alert.number}`,
    body: {
      '@timestamp': alert.created_at,
      state: alert.state,
      severity: alert.security_advisory.severity,
      package: alert.dependency.package.name,
      ecosystem: alert.dependency.package.ecosystem,
      manifest: alert.dependency.manifest_path,
      scope: alert.dependency.scope,
      ghsa_id: alert.security_advisory.ghsa_id,
      cve_id: alert.security_advisory.cve_id,
      summary: alert.security_advisory.summary,
      cvss_score: alert.security_advisory.cvss?.score ?? null,
      created_at: alert.created_at,
      fixed_at: alert.fixed_at,
      dismissed_at: alert.dismissed_at ?? alert.auto_dismissed_at,
      dismissed_reason: alert.dismissed_reason,
      remediation_days: alert.fixed_at
        ? (Date.parse(alert.fixed_at) - Date.parse(alert.created_at)) / DAY_MS
        : null,
    },
  }));
}

export async function indexAlerts(
  documents: BulkDocument[],
  baseUrl: string,
  index: string
): Promise<IndexResult> {
  return indexDocuments(documents, baseUrl, index, MAPPING);
}
