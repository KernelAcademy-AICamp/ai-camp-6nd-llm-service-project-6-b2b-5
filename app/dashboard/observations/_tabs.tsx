import Link from "next/link";
import { cn } from "@/lib/utils";

export type ObservationTabKey = "writing" | "done" | "timeline";

// 관찰일지 3개 탭. status 컬럼이 없어 "작성중"은 AI 작성 플로우(new) 진입으로 매핑.
// qs 로 role·user·classroom 쿼리 유지.
const TABS: { key: ObservationTabKey; label: string; href: string }[] = [
  { key: "writing", label: "작성중", href: "/dashboard/observations/new" },
  { key: "done", label: "완료", href: "/dashboard/observations" },
  { key: "timeline", label: "발달타임라인", href: "/dashboard/observations/timeline" },
];

export function ObservationTabs({
  active,
  qs,
}: {
  active: ObservationTabKey;
  qs: string;
}) {
  return (
    <nav className="flex items-center gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${t.href}${qs}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              on
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
