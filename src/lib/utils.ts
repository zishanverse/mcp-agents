import { LearningPath } from './schemas';

function getBoolEnv(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeVideoId(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const cleaned = candidate.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(cleaned)) {
    return cleaned;
  }
  const match = cleaned.match(/^([A-Za-z0-9_-]{11})/);
  if (match) {
    return match[1];
  }
  return null;
}

export function collectVideoTitleCandidates(text: string): string[] {
  if (!text) return [];

  const candidates: string[] = [];

  const pushCandidate = (value: string | null) => {
    if (!value) return;
    const cleaned = value.trim().replace(/^[-–:•·]+|[-–:•·]+$/g, '');
    if (cleaned.length >= 5) {
      candidates.push(cleaned);
    }
  };

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;
    const lower = stripped.toLowerCase();

    if (lower.includes('type') && lower.includes('video')) {
      const quoted = stripped.match(/"([^"\r\n]{5,200})"/g);
      if (quoted) {
        for (const q of quoted) {
          pushCandidate(q.replace(/"/g, ''));
        }
      } else {
        const parts = stripped.split(/[-–]\s*type/i);
        const before = parts[0].replace(/^[\-*•\d\.\)\s]+/, '');
        pushCandidate(before);
      }
    }
    if (lower.includes('youtube') && !lower.includes('http')) {
      const quoted = stripped.match(/"([^"\r\n]{5,200})"/g);
      if (quoted) {
        for (const q of quoted) {
          pushCandidate(q.replace(/"/g, ''));
        }
      } else {
        const segment = stripped.split(/youtube/i)[0];
        const before = segment.replace(/^[\-*•\d\.\)\s]+/, '');
        pushCandidate(before);
      }
    }
  }

  const bracketed = text.match(/\[(.{5,200}?)]/g);
  if (bracketed) {
    for (const token of bracketed) {
      const tok = token.substring(1, token.length - 1).trim();
      if (tok && !/^PL[a-zA-Z0-9_-]+/.test(tok)) {
        candidates.push(tok);
      }
    }
  }

  // Deduplicate candidates list
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const cand of candidates) {
    if (cand && !seen.has(cand)) {
      seen.add(cand);
      deduped.push(cand);
    }
  }
  return deduped;
}

export async function searchYoutubeForTitle(
  title: string,
  preferRecent: boolean = true,
  excludeIds?: Set<string>
): Promise<string | null> {
  if (!getBoolEnv('ENABLE_YOUTUBE_TITLE_LOOKUP', true)) {
    return null;
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  const exclude = excludeIds || new Set<string>();

  if (apiKey) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 730); // 24 months ago

      const runQuery = async (recent: boolean): Promise<any[]> => {
        let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(title)}&type=video&maxResults=10&key=${apiKey}`;
        if (recent) {
          url += `&order=date&publishedAfter=${cutoffDate.toISOString()}`;
        } else {
          url += `&order=relevance`;
        }
        
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`YouTube API returned HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.items || [];
      };

      const searchOrder = preferRecent ? [true, false] : [false];
      for (const recent of searchOrder) {
        const items = await runQuery(recent);
        for (const item of items) {
          const vid = item.id?.videoId;
          if (!vid || exclude.has(vid)) continue;

          if (recent) {
            const publishedAt = item.snippet?.publishedAt;
            if (publishedAt) {
              const pubDate = new Date(publishedAt);
              if (pubDate < cutoffDate) continue;
            }
          }
          return vid;
        }
      }
    } catch (e) {
      console.warn(`[utils] searchYoutubeForTitle API lookup failed: ${e}. Trying fallback scrape...`);
    }
  }

  // Fallback Web Scraping
  try {
    const query = encodeURIComponent(title);
    const url = `https://www.youtube.com/results?search_query=${query}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (response.ok) {
      const html = await response.text();
      // Match 11 character video IDs
      const videoIds = [...html.matchAll(/watch\?v=([A-Za-z0-9_-]{11})/g)].map(m => m[1]);
      for (const vid of videoIds) {
        if (!exclude.has(vid)) {
          return vid;
        }
      }
    }
  } catch (scrapeError) {
    console.error(`[utils] searchYoutubeForTitle fallback scrape failed: ${scrapeError}`);
  }

  return null;
}

export async function extractVideoIdsFromText(
  text: string,
  fetchGenericUrls: boolean = true,
  maxFetches: number = 5,
  titleHints?: string[]
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();

  const record = (videoId: string | null) => {
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId);
      ids.push(videoId);
    }
  };

  if (!text) return ids;

  const directPatterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi,
    /watch\?v=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /video\s*id[:\-\s]+([A-Za-z0-9_-]{11})/gi,
  ];

  for (const pattern of directPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      record(normalizeVideoId(match[1]));
    }
  }

  const urlPattern = /https?:\/\/[^\s)]+/gi;
  const fetchTargets: string[] = [];
  const matches = text.matchAll(urlPattern);

  for (const match of matches) {
    const url = match[0];
    if (!url.toLowerCase().includes('youtu')) continue;

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes('youtube.com') && !host.includes('youtu.be')) continue;

      let vid: string | null = null;
      if (parsed.searchParams.has('v')) {
        vid = normalizeVideoId(parsed.searchParams.get('v'));
      } else {
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (host.endsWith('youtu.be') && pathParts.length > 0) {
          vid = normalizeVideoId(pathParts[0]);
        } else if (host.includes('youtube.com') && pathParts.length > 0) {
          if (['embed', 'v', 'shorts', 'live'].includes(pathParts[0]) && pathParts.length > 1) {
            vid = normalizeVideoId(pathParts[1]);
          }
        }
      }

      if (vid) {
        record(vid);
      } else {
        fetchTargets.push(url);
      }
    } catch (e) {}
  }

  if (fetchGenericUrls && fetchTargets.length > 0) {
    for (const url of fetchTargets.slice(0, maxFetches)) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const html = await res.text();
          const match = html.match(/watch\?v=([A-Za-z0-9_-]{11})/);
          if (match) {
            record(normalizeVideoId(match[1]));
          }
        }
      } catch (err) {}
    }
  }

  const titleCandidates = [...(titleHints || [])];
  for (const cand of collectVideoTitleCandidates(text)) {
    if (!titleCandidates.includes(cand)) {
      titleCandidates.push(cand);
    }
  }

  if (titleCandidates.length > 0) {
    for (const title of titleCandidates) {
      if (ids.length >= 40) break;
      const vid = await searchYoutubeForTitle(title, true, seen);
      if (vid) {
        record(normalizeVideoId(vid));
      }
    }
  }

  return ids;
}

export async function extractVideoIdsFromLearningPath(lp: LearningPath): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();

  const record = (videoId: string | null) => {
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId);
      ids.push(videoId);
    }
  };

  // Perform video lookup searches for each video resource in the generated path
  for (const day of lp.days) {
    for (const r of day.resources) {
      if (r.type === 'Video') {
        let vid: string | null = null;
        if (r.title) {
          vid = await searchYoutubeForTitle(r.title, true, seen);
        }

        if (vid) {
          const validId = normalizeVideoId(vid);
          record(validId);
          r.url = `https://www.youtube.com/watch?v=${validId}`;
        }
      }
    }
  }

  return ids;
}

export async function filterAvailableVideos(videoIds: string[]): Promise<[string[], string[]]> {
  if (!videoIds || videoIds.length === 0) {
    return [[], []];
  }

  // Deduplicate list
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const vid of videoIds) {
    if (vid && !seen.has(vid)) {
      seen.add(vid);
      deduped.push(vid);
    }
  }

  if (!getBoolEnv('ENABLE_YOUTUBE_AVAILABILITY_CHECK', false)) {
    return [deduped, []];
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[utils] GOOGLE_API_KEY missing, bypassing video availability filter.');
    return [deduped, []];
  }

  try {
    const available: string[] = [];
    const unavailable: string[] = [];

    // Query in batches of 50 video IDs
    for (let i = 0; i < deduped.length; i += 50) {
      const chunk = deduped.slice(i, i + 50);
      const url = `https://www.googleapis.com/youtube/v3/videos?part=status&id=${chunk.join(',')}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`YouTube API videos list returned HTTP ${res.status}`);
      }
      const data = await res.json();
      const returned: Record<string, any> = {};
      for (const item of (data.items || [])) {
        returned[item.id] = item;
      }

      for (const vid of chunk) {
        const item = returned[vid];
        if (!item) {
          unavailable.push(vid);
          continue;
        }
        const status = item.status || {};
        if (status.privacyStatus === 'public' && status.uploadStatus === 'processed') {
          available.push(vid);
        } else {
          unavailable.push(vid);
        }
      }
    }

    return [available, unavailable];
  } catch (e) {
    console.error(`[utils] filterAvailableVideos lookup failed: ${e}`);
    return [deduped, []];
  }
}
