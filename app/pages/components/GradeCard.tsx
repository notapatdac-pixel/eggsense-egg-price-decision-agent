import type { GradePrice } from "@/lib/types"
import clsx from "clsx"
export function GradeCard({ data }: { data: GradePrice }) {
  const up = data.changePct > 0,
    down = data.changePct < 0
  return (
    <div className="card p-4 h-full">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-[#9E9890] uppercase tracking-[0.07em] bg-[#EDE8DF] px-2 py-0.5 rounded-full">
          Grade {data.grade}
        </span>
        <div className="text-right">
          <span className={clsx("text-[11px] font-semibold", up ? "text-success" : down ? "text-danger" : "text-[#9E9890]")}>
            {up ? "↑ +" : down ? "↓ " : "— "}
            {Math.abs(data.changePct).toFixed(1)}%
          </span>
          <p className="text-[10px] text-[#B0AAA2] leading-none mt-0.5">vs yesterday</p>
        </div>
      </div>
      <p className="text-[26px] font-bold text-[#1A1A1A] tracking-tight leading-none mb-1">฿{data.avg.toFixed(2)}</p>
      <p className="text-[11px] text-[#9E9890] tracking-[0.03em]">PER UNIT</p>
    </div>
  )
}
