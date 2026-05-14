import type { NewsItem } from "@/lib/types"

const CAT_COLOR: Record<string, string> = {
  PRODUCTION:    "#2E7D32",
  "FEED COSTS":  "#BF5000",
  "OIL & ENERGY":"#B45309",
  "WAR & TRADE": "#B91C1C",
  WEATHER:       "#0277BD",
  EXPORT:        "#1565C0",
  POLICY:        "#6A1B9A",
  DISEASE:       "#B91C1C",
  MARKET:        "#37474F",
}
const CAT_ICON: Record<string, string> = {
  PRODUCTION: "🐔", "FEED COSTS": "🌽", "OIL & ENERGY": "⛽",
  "WAR & TRADE": "⚠️", WEATHER: "🌧️", EXPORT: "🚢",
  POLICY: "📋", DISEASE: "🦠", MARKET: "📊",
}

function CardBody({ item, catColor, catIcon }: { item: NewsItem; catColor: string; catIcon: string }) {
  return (
    <>
      <div className="relative h-[96px] bg-[#EDE8DF] flex-shrink-0 overflow-hidden">
        {item.image_url && (
          <img
            src={item.image_url}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        )}
        <span
          className="absolute top-1.5 left-1.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/90"
          style={{ color: catColor }}
        >
          {catIcon} {item.category ?? "MARKET"}
        </span>
        {!item.image_url && (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl opacity-40">{catIcon}</span>
          </div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-[12px] font-semibold leading-[1.45] text-[#1A1A1A] line-clamp-3">
          {item.title}
        </p>
        {item.snippet && (
          <p className="text-[11px] text-[#7A736A] leading-snug line-clamp-2">
            {item.snippet}
          </p>
        )}
        <div className="flex justify-between items-center text-[10px] text-[#9E9890] mt-auto pt-1.5 border-t border-[#F5F0EB]">
          <span className="flex items-center gap-1 truncate max-w-[60%]">
            {item.source_logo && (
              <img src={item.source_logo} alt="" className="w-3 h-3 rounded-sm flex-shrink-0" />
            )}
            <span className="truncate">{item.source ?? "—"}</span>
          </span>
          <span className="flex-shrink-0 font-medium">{item.time_ago_label ?? ""}</span>
        </div>
      </div>
    </>
  )
}

export function NewsCard({ item }: { item: NewsItem }) {
  const catColor = CAT_COLOR[item.category ?? ""] ?? "#37474F"
  const catIcon  = CAT_ICON[item.category  ?? ""] ?? "📰"
  const hasLink  = !!(item.url && item.url !== "#")

  if (hasLink) {
    return (
      <a
        href={item.url!}
        target="_blank"
        rel="noopener noreferrer"
        className="card flex flex-col overflow-hidden hover:shadow-md cursor-pointer transition-shadow"
      >
        <CardBody item={item} catColor={catColor} catIcon={catIcon} />
      </a>
    )
  }

  return (
    <div className="card flex flex-col overflow-hidden cursor-default">
      <CardBody item={item} catColor={catColor} catIcon={catIcon} />
    </div>
  )
}
