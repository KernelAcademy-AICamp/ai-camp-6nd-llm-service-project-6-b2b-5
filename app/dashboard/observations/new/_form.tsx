"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ChevronRight,
  ChevronDown,
  Pencil,
  Check,
  Loader2,
  Plus,
  Save,
  Send,
  Search,
  Image as ImageIcon,
  BookOpen,
  FileText,
  HelpCircle,
  HeartPulse,
  Activity,
  MessageCircle,
  Users,
  Palette,
  Leaf,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AREA_KEYS,
  AREA_LABELS,
  KIND_OPTIONS,
  type AreaKey,
  type KindOption,
} from "./_areas";

const AREA_ICONS: Record<AreaKey, typeof Activity> = {
  physical_health: Activity,
  communication: MessageCircle,
  social: Users,
  artistic: Palette,
  nature: Leaf,
};
import {
  generateAreaObservationAction,
  refineSimpleTextAction,
  saveAreaObservationAction,
  type AreaObservationDraft,
  type RefineMode,
  type SourceMemo,
} from "./actions";

export type ChildOption = { id: string; name: string };

export type ActivityOption = { id: string; date: string; title: string };

export type PullItem = {
  id: string;
  kind: "journal" | "memo";
  childId: string;
  date: string;
  summary: string;
  body: string;
};

function isoMinusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Step = 1 | 2 | 3 | 4;
type Target = "observation" | "evaluation";

export function ObservationForm({
  childOptions: children,
  qs,
  teacherId,
  classroomId,
  pullItems,
  activities,
}: {
  childOptions: ChildOption[];
  qs: string;
  teacherId: string;
  classroomId: string;
  pullItems: PullItem[];
  activities: ActivityOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [childId, setChildId] = useState<string>(children[0]?.id ?? "");
  const [startDate, setStartDate] = useState(isoMinusDays(13));
  const [endDate, setEndDate] = useState(todayISO());
  const [kind, setKind] = useState<KindOption | null>(null);
  const [areas, setAreas] = useState<AreaKey[]>([...AREA_KEYS]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);

  const periodActivities = useMemo(() => {
    return activities.filter((a) => a.date >= startDate && a.date <= endDate);
  }, [activities, startDate, endDate]);

  const [areaContent, setAreaContent] = useState<AreaObservationDraft>(
    Object.fromEntries(AREA_KEYS.map((k) => [k, ""])) as AreaObservationDraft,
  );
  const [sources, setSources] = useState<SourceMemo[]>([]);
  const [showSources, setShowSources] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const [genPending, startGen] = useTransition();
  const [refining, setRefining] = useState<{ area: AreaKey; mode: RefineMode } | null>(
    null,
  );
  const [savePending, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const childName = children.find((c) => c.id === childId)?.name ?? "";
  const hasDraft = AREA_KEYS.some((k) => areaContent[k].trim().length > 0);

  function toggleArea(k: AreaKey) {
    setAreas((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  function generate() {
    if (!childId) return setError("원아를 선택해주세요.");
    if (areas.length === 0)
      return setError("누리과정 영역을 1개 이상 선택해주세요.");
    setError(null);
    setStep(2);
    startGen(async () => {
      const activityTitles = periodActivities
        .filter((a) => selectedActivities.includes(a.id))
        .map((a) => a.title);
      const result = await generateAreaObservationAction({
        childId,
        classroomId,
        startDate,
        endDate,
        kind,
        keywords: [],
        activities: activityTitles,
        focusAreas: areas,
      });
      if (result.ok) {
        setAreaContent(result.draft);
        setSources(result.sources);
      } else {
        setError(result.error);
      }
      setStep(3);
    });
  }

  function refineArea(area: AreaKey, mode: RefineMode) {
    const content = areaContent[area];
    if (!content.trim()) return;
    setError(null);
    setRefining({ area, mode });
    startGen(async () => {
      const result = await refineSimpleTextAction({ content, mode });
      setRefining(null);
      if (result.ok) {
        setAreaContent((prev) => ({ ...prev, [area]: result.text }));
      } else {
        setError(result.error);
      }
    });
  }

  function insertIntoArea(text: string, area: AreaKey) {
    setAreaContent((prev) => ({
      ...prev,
      [area]: prev[area] ? `${prev[area]}\n\n${text}` : text,
    }));
  }

  function save(status: "draft" | "published") {
    if (!childId) return setError("원아를 선택해주세요.");
    if (!hasDraft) return setError("내용이 입력된 영역이 없어요.");
    setError(null);
    startSave(async () => {
      const result = await saveAreaObservationAction({
        childId,
        classroomId,
        teacherId,
        date: endDate,
        kind,
        draft: areaContent,
      });
      if (result.ok) {
        setStep(4);
        setTimeout(
          () => router.push(`/dashboard/observations${qs}`),
          1000,
        );
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <section className="flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400">관찰일지 &gt; 관찰일지 작성</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            관찰일지 작성
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            기록을 기반으로 관찰일지 초안을 생성합니다.
          </p>
        </div>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          이용 가이드
        </button>
      </section>

      <StepIndicator step={step} />

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      {/* 본문: 좌 필터 / 중 초안 / 우 추가하기 (3칼럼) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_220px]">
        {/* ① 좌측 필터 */}
        <section className="flex flex-col space-y-5 self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">아이 선택</p>
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none"
            >
              {children.length === 0 ? (
                <option value="">반에 원아가 없어요</option>
              ) : (
                children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">기간 선택</p>
            <div className="space-y-1">
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-emerald-400 focus:outline-none"
              />
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayISO()}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <ActivityDropdown
            activities={periodActivities}
            selected={selectedActivities}
            onChange={setSelectedActivities}
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">누리과정 영역</p>
              <button
                type="button"
                onClick={() =>
                  setAreas((prev) =>
                    prev.length === AREA_KEYS.length ? [] : [...AREA_KEYS],
                  )
                }
                className="text-[11px] font-medium text-emerald-700 hover:underline"
              >
                {areas.length === AREA_KEYS.length ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AREA_KEYS.map((k) => {
                const active = areas.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleArea(k)}
                    className={cn(
                      "h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                      active
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {AREA_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">구분 (선택)</p>
            <div className="grid auto-cols-fr grid-flow-col overflow-hidden rounded-lg border border-slate-200 bg-white">
              {KIND_OPTIONS.map((k, i) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(active ? null : k)}
                    className={cn(
                      "h-8 text-xs font-medium transition-colors",
                      i > 0 && "border-l border-slate-200",
                      active
                        ? "bg-emerald-500 text-white"
                        : "text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={genPending || !childId}
            className={cn(
              "!mt-[80px] flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors",
              genPending || !childId
                ? "bg-emerald-300 text-white"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {genPending && step === 2 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                초안 생성 중…
              </>
            ) : (
              <>
                초안 생성하기
                <Sparkles className="h-4 w-4" />
              </>
            )}
          </button>
        </section>

        {/* ② 초안 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">관찰일지 초안</p>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              disabled={!hasDraft}
              className={cn(
                "flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-medium",
                hasDraft
                  ? editMode
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "border-slate-100 text-slate-300",
              )}
            >
              {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {editMode ? "편집 저장" : "편집하기"}
            </button>
          </div>

          {!hasDraft ? (
            <div className="grid h-48 place-items-center rounded-xl bg-slate-50 text-center">
              <div className="text-slate-400">
                <Sparkles className="mx-auto h-8 w-8 text-emerald-200" />
                <p className="mt-2 text-sm">
                  좌측 필터 선택 후 <strong>초안 생성하기</strong>를 눌러주세요.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs">
                <p className="font-semibold text-slate-800">
                  {childName}의 관찰일지
                </p>
                <span className="text-slate-400">
                  {startDate} ~ {endDate}
                </span>
              </div>

              {/* 영역별 본문 — 세로 stack */}
              <div className="space-y-4">
                {AREA_KEYS.map((k) => {
                  const Icon = AREA_ICONS[k];
                  const busy = refining?.area === k ? refining.mode : null;
                  return (
                    <div key={k} className="rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/40 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-900">
                            {AREA_LABELS[k]}
                          </span>
                        </div>
                        {areaContent[k].trim() && (
                          <div className="flex items-center gap-1">
                            <RefineBtn label="다듬기" mode="polish" busy={busy} onClick={(m) => refineArea(k, m)} />
                            <RefineBtn label="짧게" mode="shorten" busy={busy} onClick={(m) => refineArea(k, m)} />
                            <RefineBtn label="자세히" mode="detail" busy={busy} onClick={(m) => refineArea(k, m)} />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        {editMode ? (
                          <textarea
                            value={areaContent[k]}
                            onChange={(e) =>
                              setAreaContent((prev) => ({
                                ...prev,
                                [k]: e.target.value,
                              }))
                            }
                            placeholder="이 영역에서 관찰된 모습을 기록해 주세요."
                            rows={5}
                            className="w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                          />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {areaContent[k] || (
                              <span className="text-slate-400">해당 누리과정 영역에 대한 내용이 없어 생성되지 않았습니다.</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 근거 기록 */}
              <div className="mt-[30px] rounded-xl bg-slate-50 p-3">
                <button
                  type="button"
                  onClick={() => setShowSources((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-slate-700"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    근거 기록 ({sources.length}건)
                  </span>
                </button>
                {showSources &&
                  (sources.length === 0 ? (
                    <p className="mt-2 text-[11px] text-slate-400">
                      기간 내 한 줄 메모가 없어요.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {sources.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-slate-400">
                            {s.date}
                          </span>
                          <span className="flex-1 text-slate-700">{s.text}</span>
                          {s.tag && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              {s.tag}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ))}
                {showSources && (
                  <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-400">
                    * 위 내용은 기간 내{" "}
                    <strong className="text-slate-600">{sources.length}건</strong>의
                    메모를 기반으로 생성되었습니다.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        {/* ③ 우측 추가하기 */}
        <PullPanel
          items={pullItems}
          children={children}
          currentChildId={childId}
          onInsert={insertIntoArea}
        />
      </div>

      {/* 하단 액션 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (step === 3) setStep(1);
          }}
          disabled={step !== 3}
          className={cn(
            "h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium",
            step === 3 ? "text-slate-700 hover:bg-slate-50" : "text-slate-300",
          )}
        >
          이전 단계
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={!hasDraft || savePending}
            className={cn(
              "h-10 rounded-lg border px-4 text-sm font-medium",
              hasDraft && !savePending
                ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                : "border-slate-100 text-slate-300",
            )}
          >
            임시저장
          </button>
          <button
            type="button"
            onClick={() => save("published")}
            disabled={!hasDraft || savePending}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors",
              hasDraft && !savePending
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-emerald-300 text-white",
            )}
          >
            완료
            <Save className="h-4 w-4" />
          </button>
        </div>
      </div>

      {step === 4 && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
          ✅ 저장되었습니다. 관찰일지 목록으로 이동합니다…
        </div>
      )}
    </div>
  );
}

// ───────── helpers ─────────

function ActivityDropdown({
  activities,
  selected,
  onChange,
}: {
  activities: ActivityOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const disabled = activities.length === 0;
  const allSelected = activities.length > 0 && selected.length === activities.length;
  const label =
    activities.length === 0
      ? "기간 내 활동 없음"
      : selected.length === 0
        ? "전체 활동"
        : `${selected.length}개 선택`;

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="relative">
      <p className="mb-1 text-[11px] font-medium text-slate-600">활동 선택</p>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 text-xs",
          disabled ? "text-slate-400" : "text-slate-700 hover:bg-slate-50",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5">
              <span className="text-[10px] text-slate-500">
                {selected.length}/{activities.length} 선택
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(allSelected ? [] : activities.map((a) => a.id))
                }
                className="text-[10px] font-medium text-emerald-700 hover:underline"
              >
                {allSelected ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <ul className="max-h-48 overflow-y-auto p-1">
              {activities.map((a) => {
                const checked = selected.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition-colors",
                        checked
                          ? "bg-emerald-50 text-emerald-800"
                          : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
                          checked
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 bg-white",
                        )}
                      >
                        {checked && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="w-12 shrink-0 text-[10px] text-slate-400">
                        {a.date.slice(5)}
                      </span>
                      <span className="flex-1 truncate">{a.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "정보 선택" },
    { n: 2, label: "초안 생성" },
    { n: 3, label: "검수 및 수정" },
    { n: 4, label: "저장" },
  ];
  return (
    <div className="rounded-xl bg-white px-3 py-1.5">
      <ol className="flex items-center justify-between gap-1 text-sm">
        {steps.map((s, i) => {
          const active = step === s.n;
          return (
            <Fragment key={s.n}>
              <li
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors",
                  active ? "text-slate-900" : "text-slate-400",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold",
                    active
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 text-slate-400",
                  )}
                >
                  {s.n}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap",
                    active ? "font-bold" : "font-medium",
                  )}
                >
                  {s.label}
                </span>
              </li>
              {i < steps.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function SectionBlock({
  label,
  value,
  editMode,
  onChange,
  refineBusy,
  onRefine,
  minHeightView,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  editMode: boolean;
  onChange: (v: string) => void;
  refineBusy: RefineMode | null;
  onRefine: (mode: RefineMode) => void;
  minHeightView: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700">
          {label}
          {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
        </p>
        {value.trim() && (
          <div className="flex items-center gap-1">
            <RefineBtn label="다듬기" mode="polish" busy={refineBusy} onClick={onRefine} />
            <RefineBtn label="짧게" mode="shorten" busy={refineBusy} onClick={onRefine} />
            <RefineBtn label="자세히" mode="detail" busy={refineBusy} onClick={onRefine} />
          </div>
        )}
      </div>
      {editMode ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "block w-full resize-none overflow-y-auto rounded-xl border border-emerald-200 bg-white p-4 text-sm leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none",
            minHeightView,
          )}
        />
      ) : (
        <div
          className={cn(
            "block whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800",
            minHeightView,
          )}
        >
          {value || (
            <span className="text-slate-300">{placeholder || "내용이 없습니다"}</span>
          )}
        </div>
      )}
    </div>
  );
}

function AreaBlock({
  label,
  value,
  editMode,
  onChange,
  refineBusy,
  onRefine,
}: {
  label: string;
  value: string;
  editMode: boolean;
  onChange: (v: string) => void;
  refineBusy: RefineMode | null;
  onRefine: (mode: RefineMode) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center justify-between bg-emerald-50/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
            {label.slice(0, 1)}
          </span>
          <p className="text-xs font-bold text-emerald-900">{label}</p>
        </div>
        {value.trim() && (
          <div className="flex items-center gap-1">
            <RefineBtn label="다듬기" mode="polish" busy={refineBusy} onClick={onRefine} />
            <RefineBtn label="짧게" mode="shorten" busy={refineBusy} onClick={onRefine} />
            <RefineBtn label="자세히" mode="detail" busy={refineBusy} onClick={onRefine} />
          </div>
        )}
      </div>
      {editMode ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label} 영역에서 관찰된 모습을 기록해 주세요.`}
          rows={3}
          className="block w-full resize-none border-t border-emerald-100 bg-white p-3 text-xs leading-relaxed text-slate-800 focus:outline-none"
        />
      ) : (
        <div className="whitespace-pre-wrap border-t border-emerald-100 bg-white p-3 text-xs leading-relaxed text-slate-800">
          {value || <span className="text-slate-400">해당 누리과정 영역에 대한 내용이 없어 생성되지 않았습니다.</span>}
        </div>
      )}
    </div>
  );
}

function RefineBtn({
  label,
  mode,
  busy,
  onClick,
}: {
  label: string;
  mode: RefineMode;
  busy: RefineMode | null;
  onClick: (m: RefineMode) => void;
}) {
  const active = busy === mode;
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      disabled={!!busy}
      className={cn(
        "flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
        active
          ? "border-emerald-400 bg-emerald-100 text-emerald-800"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        busy && !active ? "opacity-50" : "",
      )}
    >
      {active && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}

function PullPanel({
  items,
  children,
  currentChildId,
  onInsert,
}: {
  items: PullItem[];
  children: ChildOption[];
  currentChildId: string;
  onInsert: (text: string, area: AreaKey) => void;
}) {
  const [tab, setTab] = useState<"memo" | "journal">("memo");
  const [q, setQ] = useState("");
  const [filterMine, setFilterMine] = useState(true);
  const [insertArea, setInsertArea] = useState<AreaKey>("physical_health");

  const filtered = useMemo(() => {
    return items
      .filter((it) => it.kind === tab)
      .filter((it) => (filterMine ? it.childId === currentChildId : true))
      .filter((it) =>
        q.trim() ? it.summary.toLowerCase().includes(q.trim().toLowerCase()) : true,
      )
      .slice(0, 40);
  }, [items, tab, filterMine, currentChildId, q]);

  return (
    <aside className="flex max-h-[calc(100vh-3rem)] flex-col space-y-2.5 self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6">
      <div className="flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-bold text-slate-900">추가하기</h2>
      </div>
      <p className="text-[11px] text-slate-500">
        기존 활동 메모·알림장을 본문에 인용할 수 있어요.
      </p>

      <div className="inline-flex w-full overflow-hidden rounded-lg border border-slate-200 text-xs">
        {(
          [
            { k: "memo", label: "활동 메모" },
            { k: "journal", label: "관찰일지" },
          ] as const
        ).map((t, i) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-medium",
              i > 0 && "border-l border-slate-200",
              tab === t.k
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="내용 검색"
          className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-[11px] focus:border-emerald-400 focus:outline-none"
        />
      </div>

      <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <input
          type="checkbox"
          checked={filterMine}
          onChange={(e) => setFilterMine(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        현재 원아만 보기
      </label>

      <div className="rounded-lg bg-slate-50 p-2">
        <p className="mb-1.5 text-[10px] font-medium text-slate-500">삽입 영역</p>
        <div className="grid grid-cols-2 gap-1">
          {AREA_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setInsertArea(k)}
              className={cn(
                "h-7 rounded text-[10px] font-medium",
                insertArea === k
                  ? "bg-white text-slate-900 ring-1 ring-slate-200"
                  : "text-slate-500 hover:bg-white",
              )}
            >
              {AREA_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <li className="rounded-lg bg-slate-50 py-8 text-center text-[11px] text-slate-400">
            인용할 수 있는 항목이 없어요
          </li>
        ) : (
          filtered.map((it) => {
            const childName =
              children.find((c) => c.id === it.childId)?.name ?? "";
            return (
              <li key={`${it.kind}-${it.id}`}>
                <button
                  type="button"
                  onClick={() => onInsert(it.body, insertArea)}
                  className="group w-full rounded-lg border border-slate-100 bg-white p-2.5 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                      {it.kind === "journal" ? (
                        <BookOpen className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <ImageIcon className="h-3 w-3 text-amber-500" />
                      )}
                      <span className="text-slate-600">
                        {it.kind === "journal" ? "관찰일지" : "활동 메모"}
                      </span>
                    </span>
                    <span className="text-[10px] text-slate-400">{it.date}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-700">
                    {it.summary}
                  </p>
                  {childName && (
                    <p className="mt-1 text-[10px] text-slate-400">{childName}</p>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
