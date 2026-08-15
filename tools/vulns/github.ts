/** Récupération des alertes Dependabot via l'API REST GitHub. */
import type { DependabotAlert } from './types.js';

const API = 'https://api.github.com';

/**
 * Contrairement aux runs Actions (publics), les alertes exigent TOUJOURS un
 * token : `security_events`, ou `public_repo` sur un dépôt public — et un
 * compte ayant accès en écriture au dépôt (cf. DOCUMENTATION.md § 8).
 * Pas de cache disque : quelques dizaines d'alertes au plus, toujours fraîches.
 */
export async function fetchAlerts(repo: string): Promise<DependabotAlert[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN requis pour lire les alertes Dependabot. ' +
        'Le plus simple : copier tools/.env.example en tools/.env et y coller la sortie de `gh auth token`.',
    );
  }

  const alerts: DependabotAlert[] = [];
  // Pagination par CURSEUR (en-tête Link, rel="next") : cet endpoint rejette
  // `page=N` avec un 400 — constaté en réel, contrairement à l'API Actions.
  // Sans filtre `state`, il renvoie TOUS les états (open, fixed, dismissed,
  // auto_dismissed) — vérifié aussi, c'est ce qu'on veut.
  let url = `${API}/repos/${repo}/dependabot/alerts?per_page=100`;
  for (;;) {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const hint =
        response.status === 403 || response.status === 404
          ? ' (alertes Dependabot activées sur le dépôt ? token avec accès en écriture ?)'
          : '';
      throw new Error(`${url} → HTTP ${response.status}${hint}`);
    }

    alerts.push(...((await response.json()) as DependabotAlert[]));
    const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '');
    if (!next) return alerts;
    url = next[1];
  }
}
