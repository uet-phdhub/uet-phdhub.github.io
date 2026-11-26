export interface DoiLookupResult {
  doi: string;
  doi_url: string;
  title: string;
  authors: string;
  venue: string;
  pub_year: number | null;
  issn_isbn: string;
  source: 'crossref' | 'openalex';
}

export function normalizeDoi(input: string): string {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
}

export async function lookupDoiMetadata(rawDoi: string): Promise<DoiLookupResult> {
  const doi = normalizeDoi(rawDoi);
  if (!doi || !doi.includes('/')) {
    throw new Error('Mã DOI không hợp lệ (ví dụ: 10.1109/TPAMI.2024.123456).');
  }

  // 1. Try Crossref API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'UET-PhDHub/2.0 (mailto:tuyenkv@vnu.edu.vn)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as any;
      const msg = data?.message;
      if (msg) {
        const title = Array.isArray(msg.title) ? String(msg.title[0] || '') : String(msg.title || '');
        const authors = Array.isArray(msg.author)
          ? msg.author
              .map((a: any) => [a.given, a.family].filter(Boolean).join(' ').trim())
              .filter(Boolean)
              .join(', ')
          : '';
        const venue = Array.isArray(msg['container-title']) ? String(msg['container-title'][0] || '') : '';
        const dateParts =
          msg.published?.['date-parts']?.[0] ||
          msg['published-print']?.['date-parts']?.[0] ||
          msg['published-online']?.['date-parts']?.[0] ||
          msg.created?.['date-parts']?.[0];
        const pubYear = dateParts?.[0] ? Number(dateParts[0]) : null;
        const issn = Array.isArray(msg.ISSN) ? String(msg.ISSN[0] || '') : Array.isArray(msg.ISBN) ? String(msg.ISBN[0] || '') : '';
        return {
          doi,
          doi_url: `https://doi.org/${doi}`,
          title: title.trim(),
          authors,
          venue: venue.trim(),
          pub_year: Number.isFinite(pubYear) ? pubYear : null,
          issn_isbn: issn,
          source: 'crossref',
        };
      }
    }
  } catch {}

  // 2. Fallback to OpenAlex API
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  const oaRes = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`, {
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!oaRes.ok) {
    throw new Error(`Không tìm thấy thông tin công bố cho DOI "${doi}".`);
  }
  const oa = (await oaRes.json()) as any;
  const authors = Array.isArray(oa.authorships)
    ? oa.authorships
        .map((a: any) => a?.author?.display_name)
        .filter(Boolean)
        .join(', ')
    : '';
  return {
    doi,
    doi_url: `https://doi.org/${doi}`,
    title: String(oa.title || '').trim(),
    authors,
    venue: String(oa.primary_location?.source?.display_name || '').trim(),
    pub_year: oa.publication_year ? Number(oa.publication_year) : null,
    issn_isbn: String(oa.primary_location?.source?.issn_l || ''),
    source: 'openalex',
  };
}
