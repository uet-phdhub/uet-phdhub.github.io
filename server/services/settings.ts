import { calculatePublicationPoint, mergeRegulationConfig } from '../../shared/regulation3638';
import type { Regulation3638Config, SystemBannerConfig } from '../../shared/types';
import { db } from '../db';

let cachedConfig: Regulation3638Config | null = null;
let cacheLoadedAt = 0;
let cachedBanner: SystemBannerConfig | null = null;
let bannerLoadedAt = 0;
const CACHE_TTL_MS = 10_000;

export function clearRegulationConfigCache() {
  cachedConfig = null;
  cacheLoadedAt = 0;
  cachedBanner = null;
  bannerLoadedAt = 0;
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

export async function getRegulationConfigByVersionId(versionId?: number | null): Promise<Regulation3638Config> {
  if (!versionId) return getRegulationConfig();
  const row = (
    await db.execute({
      sql: 'SELECT config_json FROM regulation_versions WHERE id = ?',
      args: [Number(versionId)],
    })
  ).rows[0] as { config_json?: string } | undefined;
  if (!row?.config_json) return getRegulationConfig();
  try {
    return mergeRegulationConfig(JSON.parse(row.config_json));
  } catch {
    return getRegulationConfig();
  }
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

  // Keep default regulation_versions row synchronized
  await db.execute({
    sql: `UPDATE regulation_versions
          SET config_json = ?, revision = revision + 1, updated_at = datetime('now', '+7 hours')
          WHERE is_default = 1`,
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

const DEFAULT_BANNER: SystemBannerConfig = {
  maintenanceMode: false,
  maintenanceMessage: 'Hệ thống đang bảo trì định kỳ. Vui lòng quay lại sau ít phút.',
  bannerText: '',
  bannerTone: 'info',
};

export async function getSystemBannerConfig(forceRefresh = false): Promise<SystemBannerConfig> {
  if (!forceRefresh && cachedBanner && Date.now() - bannerLoadedAt < CACHE_TTL_MS) {
    return cachedBanner;
  }
  try {
    const row = (
      await db.execute("SELECT value FROM settings WHERE key = 'system_banner_config'")
    ).rows[0] as { value?: string } | undefined;
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      cachedBanner = {
        maintenanceMode: Boolean(parsed.maintenanceMode),
        maintenanceMessage: String(parsed.maintenanceMessage || DEFAULT_BANNER.maintenanceMessage),
        bannerText: String(parsed.bannerText || ''),
        bannerTone: parsed.bannerTone === 'warning' ? 'warning' : 'info',
      };
    } else {
      cachedBanner = { ...DEFAULT_BANNER };
    }
  } catch {
    cachedBanner = { ...DEFAULT_BANNER };
  }
  bannerLoadedAt = Date.now();
  return cachedBanner;
}

export async function saveSystemBannerConfig(patch: Partial<SystemBannerConfig>): Promise<SystemBannerConfig> {
  const cur = await getSystemBannerConfig(true);
  const next: SystemBannerConfig = {
    maintenanceMode: patch.maintenanceMode !== undefined ? Boolean(patch.maintenanceMode) : cur.maintenanceMode,
    maintenanceMessage:
      patch.maintenanceMessage !== undefined ? String(patch.maintenanceMessage).trim() : cur.maintenanceMessage,
    bannerText: patch.bannerText !== undefined ? String(patch.bannerText).trim() : cur.bannerText,
    bannerTone: patch.bannerTone === 'warning' ? 'warning' : patch.bannerTone === 'info' ? 'info' : cur.bannerTone,
  };
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES ('system_banner_config', ?, datetime('now', '+7 hours'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [JSON.stringify(next)],
  });
  cachedBanner = next;
  bannerLoadedAt = Date.now();
  return next;
}

export async function renderEmailTemplate(
  code: string,
  vars: Record<string, string | number | null | undefined>,
  fallback: { subject: string; body: string }
): Promise<{ subject: string; body: string }> {
  try {
    const row = (
      await db.execute({
        sql: 'SELECT subject_template, body_template, active FROM email_templates WHERE code = ?',
        args: [code],
      })
    ).rows[0] as any;
    if (!row || Number(row.active) === 0) return fallback;
    const interpolate = (tpl: string) =>
      tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => String(vars[k] ?? ''));
    return {
      subject: interpolate(String(row.subject_template)),
      body: interpolate(String(row.body_template)),
    };
  } catch {
    return fallback;
  }
}
