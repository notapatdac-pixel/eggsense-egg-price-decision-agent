import type { NewsItem } from "@/lib/types"
import { db } from "./client"

const SIXTY_DAYS_MS = 60 * 86_400_000

export async function getCachedNews(queryKey: string, limit = 8): Promise<NewsItem[]> {
  const { data, error } = await db()
    .from("news_cache")
    .select("*")
    .eq("query_key", queryKey)
    .gt("expires_at", new Date().toISOString())
    .order("fetched_at", { ascending: false })
    .limit(limit)
  if (error) { console.error("getCachedNews:", error.message, error.code); return [] }
  return (data ?? []) as unknown as NewsItem[]
}

/** Read articles published within 60 days, newest first. Used by the serve layer. */
export async function getActiveNews(queryKey: string, limit = 60): Promise<NewsItem[]> {
  const since = new Date(Date.now() - SIXTY_DAYS_MS).toISOString()
  const { data, error } = await db()
    .from("news_cache")
    .select("*")
    .eq("query_key", queryKey)
    .gt("published_at", since)
    .order("published_at", { ascending: false })
    .limit(limit)
  if (error) { console.error("getActiveNews:", error.message, error.code); return [] }
  return (data ?? []) as unknown as NewsItem[]
}

/** Insert only articles not already in DB (deduplicated by URL, title as fallback).
 *  Returns the number of new rows inserted. */
export async function insertNewArticles(queryKey: string, articles: Partial<NewsItem>[]): Promise<number> {
  if (!articles.length) return 0

  const since = new Date(Date.now() - SIXTY_DAYS_MS).toISOString()
  const { data: existing } = await db()
    .from("news_cache")
    .select("url, title")
    .eq("query_key", queryKey)
    .gt("published_at", since)

  const seenUrls   = new Set((existing ?? []).map((r) => r.url).filter(Boolean))
  const seenTitles = new Set((existing ?? []).map((r) => r.title).filter(Boolean))

  const fresh = articles.filter((a) => {
    if (a.url   && seenUrls.has(a.url))     return false
    if (!a.url  && a.title && seenTitles.has(a.title)) return false
    return true
  })

  if (!fresh.length) return 0

  const expiresAt = new Date(Date.now() + SIXTY_DAYS_MS).toISOString()
  const rows = fresh.map(({ id: _id, time_ago_label: _t, ...rest }) => ({
    ...rest,
    query_key: queryKey,
    expires_at: expiresAt,
  }))

  const { error } = await db().from("news_cache").insert(rows)
  if (error) { console.error("insertNewArticles:", error.message, error.code); return 0 }
  return fresh.length
}

export async function getRecentNews(limitHours = 72, limit = 20): Promise<Array<{ category: string | null; title: string | null }>> {
  const since = new Date(Date.now() - limitHours * 60 * 60 * 1000).toISOString()
  const { data, error } = await db()
    .from("news_cache")
    .select("category,title")
    .gt("fetched_at", since)
    .gt("expires_at", new Date().toISOString())
    .order("fetched_at", { ascending: false })
    .limit(limit)
  if (error) { console.error("getRecentNews:", error.message); return [] }
  return (data ?? []) as Array<{ category: string | null; title: string | null }>
}

export async function saveNewsCache(queryKey: string, articles: Partial<NewsItem>[]): Promise<void> {
  const { error: delErr } = await db().from("news_cache").delete().eq("query_key", queryKey)
  if (delErr) console.error("saveNewsCache delete:", delErr.message, delErr.code)

  if (!articles.length) return

  // Strip computed/client-only fields that have no DB column
  const rows = articles.map(({ id: _id, time_ago_label: _t, ...rest }) => ({ ...rest, query_key: queryKey }))
  const { error: insErr } = await db().from("news_cache").insert(rows)
  if (insErr) console.error("saveNewsCache insert:", insErr.message, "code:", insErr.code, "details:", insErr.details)
}
