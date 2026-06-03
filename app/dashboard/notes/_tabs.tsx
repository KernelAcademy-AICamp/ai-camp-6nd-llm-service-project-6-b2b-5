import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotesTabKey = "draft" | "sent" | "history";

// 알림장 3개 탭 (작성중 → 발송됨 → 발송이력). qs 로 role·user·classroom 쿼리 유지.
const TABS: { key: NotesTabKey; label: string; href: string }[] = [
  { key: "draft", label: "작성중", href: "/dashboard/notes/drafts" },
  { key: "sent", label: "발송됨", href: "/dashboard/notes" },
  { key: "history", label: "발송이력", href: "/dashboard/notes/history" },
];

export function NotesTabs({
  active,
  qs,
}: {
  active: NotesTabKey;
  qs: string;
}) {
  return (
    <nav className="flex items-center justify-between gap-2 border-b border-slate-200">
      <div className="flex items-center gap-1">
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
      </div>
      <Link
        href={`/dashboard/notes/new${qs}`}
        className="mb-1.5 flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
      >
        <Plus className="h-4 w-4" />
        알림장 만들기
      </Link>
    </nav>
  );
}
