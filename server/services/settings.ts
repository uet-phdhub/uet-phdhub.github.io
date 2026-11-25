import { calculatePublicationPoint, mergeRegulationConfig } from '../../shared/regulation3638';
import type { Regulation3638Config } from '../../shared/types';
import { db } from '../db';

let cachedConfig: Regulation3638Config | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 10_000;

export function clearRegulationConfigCache() {
  cachedConfig = null;
  cacheLoadedAt = 0;
}

export async function getRegulationConfig(forceRefresh = false): Promise<Regulation3638Config> {
  if (!forceRefresh && cachedConfig && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  const row = (
    await db.execute({
      sql: "SELECT value FROM settings WHERE key = 'regulation_3638_config'",
    })
  ).rows[0] as { value?: string } | undefined;

  let parsed: Partial<Regulation3638Config> | null = null;
  if (row?.value) {
    try {
      parsed = JSON.parse(row.value);
    } catch {
      parsed = null;
    }
  }
  cachedConfig = mergeRegulationConfig(parsed);
  cacheLoadedAt = Date.now();
  return cachedConfig;
}

export async function saveRegulationConfig(input: Partial<Regulation3638Config>): Promise<Regulation3638Config> {
  const current = await getRegulationConfig(true);
  const merged = mergeRegulationConfig({
    ...current,
    ...input,
    pubTypePoints: {
      ...current.pubTypePoints,
      ...(input.pubTypePoints || {}),
    },
  });

  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES ('regulation_3638_config', ?, datetime('now', '+7 hours'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [JSON.stringify(merged)],
  });

  cachedConfig = merged;
  cacheLoadedAt = Date.now();
  await recalculateAllPublicationPoints(merged);
  return merged;
}

export async function recalculateAllPublicationPoints(config: Regulation3638Config) {
  const sciPubs = (await db.execute('SELECT id, pub_type, author_role, hdgsnn_max_point, total_authors FROM scientist_publications')).rows as any[];
  for (const p of sciPubs) {
    const pt = calculatePublicationPoint(
      {
        pubType: p.pub_type,
        authorRole: p.author_role,
        hdgsnnMaxPoint: p.hdgsnn_max_point,
        totalAuthors: p.total_authors,
      },
      config
    );
    await db.execute({
      sql: 'UPDATE scientist_publications SET calculated_point = ? WHERE id = ?',
      args: [pt, Number(p.id)],
    });
  }

  const phdPubs = (await db.execute('SELECT id, pub_type, author_role, hdgsnn_max_point, total_authors FROM phd_publications')).rows as any[];
  for (const p of phdPubs) {
    const pt = calculatePublicationPoint(
      {
        pubType: p.pub_type,
        authorRole: p.author_role,
        hdgsnnMaxPoint: p.hdgsnn_max_point,
        totalAuthors: p.total_authors,
      },
      config
    );
    await db.execute({
      sql: 'UPDATE phd_publications SET calculated_point = ? WHERE id = ?',
      args: [pt, Number(p.id)],
    });
  }
}
