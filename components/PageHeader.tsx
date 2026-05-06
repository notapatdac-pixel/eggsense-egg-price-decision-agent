import { format } from "date-fns"
export function PageHeader({ title, email }: { title: string; email: string }) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">{title}</h2>
      <div className="flex items-center gap-3">
        <span className="text-[14px] text-[#9E9890]">{format(new Date(), "MMMM dd, yyyy")}</span>
        <div className="w-9 h-9 rounded-full bg-[#3D3830] text-white flex items-center justify-center font-bold text-sm">
          {email[0]?.toUpperCase()}
        </div>
      </div>
    </div>
  )
}
