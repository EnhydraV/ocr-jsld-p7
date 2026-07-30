/** Accès à l'API Kibana (stack locale, sans authentification — cf. § 6). */

export const KIBANA_URL = process.env.KIBANA_URL ?? 'http://localhost:5601';

/**
 * Toute écriture via l'API Kibana exige l'en-tête `kbn-xsrf` (protection CSRF) ;
 * son absence provoque un 400 déroutant.
 */
const BASE_HEADERS: Record<string, string> = { 'kbn-xsrf': 'true' };

export async function kibanaRequest(
  path: string,
  init: RequestInit = {},
  { allowNotFound = false }: { allowNotFound?: boolean } = {}
): Promise<Response> {
  const response = await fetch(`${KIBANA_URL}${path}`, {
    ...init,
    headers: { ...BASE_HEADERS, ...(init.headers as Record<string, string> | undefined) },
  });

  if (!response.ok && !(allowNotFound && response.status === 404)) {
    const detail = await response.text();
    throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${response.status} ${detail.slice(0, 300)}`);
  }
  return response;
}

export async function kibanaJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await kibanaRequest(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  return (await response.json()) as T;
}
