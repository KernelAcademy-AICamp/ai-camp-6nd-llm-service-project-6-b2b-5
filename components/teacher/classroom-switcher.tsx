"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, School } from "lucide-react";

export type SwitcherClassroom = {
  id: string;
  name: string;
  role: "lead" | "assistant";
};

// 교사의 담당 반을 전환하는 드롭다운.
// 담당 반이 1개면 라벨만, 2개 이상이면 select 노출. ?classroom= 만 바꾸고 나머지 쿼리는 유지.
export function ClassroomSwitcher({
  classrooms,
  activeId,
}: {
  classrooms: SwitcherClassroom[];
  activeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function label(c: SwitcherClassroom) {
    return c.role === "assistant" ? `${c.name} (부담임)` : c.name;
  }

  // 담당 반이 없거나 1개면 정적 라벨
  if (classrooms.length <= 1) {
    const only = classrooms[0];
    if (!only) return null;
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
        <School className="h-4 w-4 text-slate-400" />
        {label(only)}
      </span>
    );
  }

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set("classroom", e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="relative">
      <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        value={activeId}
        onChange={onChange}
        aria-label="담당 반 선택"
        className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 focus:border-emerald-400 focus:outline-none"
      >
        {classrooms.map((c) => (
          <option key={c.id} value={c.id}>
            {label(c)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
