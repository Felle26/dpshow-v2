import { NextResponse } from 'next/server';

const FEEDS = [
  { name: 'ARD Tagesschau', url: 'https://www.tagesschau.de/xml/rss2' },
  { name: 'ZDF heute', url: 'https://www.zdf.de/rss/zdf/nachrichten' },
  { name: 'Deutschlandfunk', url: 'https://www.deutschlandfunk.de/nachrichten-100.rss' },
] as const;

interface NewsItem {
  title: string;
  link: string;
  publishedAt: string;
  imageUrl: string;
  sourceName: string;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractTagValue(xmlChunk: string, tag: string): string {
  const match = xmlChunk.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ? decodeXmlEntities(match[1]) : '';
}

function extractImageUrl(xmlChunk: string): string {
  const mediaContent = xmlChunk.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (mediaContent?.[1]) {
    return decodeXmlEntities(mediaContent[1]);
  }

  const mediaThumbnail = xmlChunk.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (mediaThumbnail?.[1]) {
    return decodeXmlEntities(mediaThumbnail[1]);
  }

  const enclosure = xmlChunk.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (enclosure?.[1]) {
    return decodeXmlEntities(enclosure[1]);
  }

  return '';
}

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items: NewsItem[] = [];

  let match: RegExpExecArray | null = itemRegex.exec(xml);
  while (match) {
    const itemXml = match[1];
    const title = extractTagValue(itemXml, 'title');
    const link = extractTagValue(itemXml, 'link');
    const publishedAt = extractTagValue(itemXml, 'pubDate');
    const imageUrl = extractImageUrl(itemXml);

    if (title.length > 0) {
      items.push({
        title,
        link,
        publishedAt,
        imageUrl,
        sourceName,
      });
    }

    match = itemRegex.exec(xml);
  }

  return items;
}

function parseDateOrZero(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 Minuten

let cachedNews: { data: object; expiresAt: number } | null = null;

export async function GET() {
  try {
    if (cachedNews && Date.now() < cachedNews.expiresAt) {
      return NextResponse.json(cachedNews.data);
    }
    const responses = await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const response = await fetch(feed.url, {
            cache: 'no-store',
            next: { revalidate: 0 },
          });

          if (!response.ok) {
            return [] as NewsItem[];
          }

          const xml = await response.text();
          return parseRssItems(xml, feed.name);
        } catch {
          return [] as NewsItem[];
        }
      })
    );

    const merged = responses.flat();
    const deduped = merged.filter((item, index, arr) => {
      const key = `${item.link}::${item.title}`;
      return arr.findIndex((x) => `${x.link}::${x.title}` === key) === index;
    });

    deduped.sort((a, b) => parseDateOrZero(b.publishedAt) - parseDateOrZero(a.publishedAt));
    const items = deduped.slice(0, 24);

    const payload = {
      source: FEEDS.map((x) => x.name).join(' + '),
      updatedAt: new Date().toISOString(),
      items,
    };

    cachedNews = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Fehler beim Laden der Newsfeeds:', error);

    return NextResponse.json(
      {
        error: 'Newsfeed konnte nicht geladen werden',
      },
      { status: 500 }
    );
  }
}
