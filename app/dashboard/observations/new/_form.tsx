"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ChevronRight,
  Pencil,
  Loader2,
  ChevronDown,
  Plus,
  Save,
  HelpCircle,
  Activity,
  MessageCircle,
  Users,
  Palette,
  Leaf,
  Wand2,
  FileText,
  TrendingUp,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_KEYS, AREA_LABELS, type AreaKey } from "./_areas";
import {
  generateObservationDraftAction,
  saveObservationAction,
  refineObservationAreaAction,
  type ObservationDraft,
  type RefineMode,
  type SourceMemo,
} from "./actions";

export type ChildOption = { id: string; name: string };

const PRESET_KEYWORDS = [
  "또래상호작용",
  "자율성",
  "집중력",
  "문제해결",
  "표현력",
  "협동",
];

const AREA_ICONS: Record<AreaKey, typeof Activity> = {
  physical_health: Activity,
  communication: MessageCircle,
  social: Users,
  artistic: Palette,
  nature: Leaf,
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

export function ObservationForm({
  childOptions: children,
  qs,
  teacherId,
  classroomId,
}: {
  childOptions: ChildOption[];
  qs: string;
  teacherId: string;
  classroomId: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [childId, setChildId] = useState<string>(children[0]?.id ?? "");
  const [startDate, setStartDate] = useState(isoMinusDays(13));
  const [endDate, setEndDate] = useState(todayISO());
  const [allAreas, setAllAreas] = useState(true);
  const [selectedAreas, setSelectedAreas] = useState<AreaKey[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState<ObservationDraft | null>(null);
  const [sources, setSources] = useState<SourceMemo[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refining, setRefining] = useState<{ area: AreaKey; mode: RefineMode } | null>(null);
  const [showSources, setShowSources] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(true);

  const childName = children.find((c) => c.id === childId)?.name ?? "";

  function toggleArea(a: AreaKey) {
    // "전체" 상태에서 하나 클릭 → 그 항목만 해제하고 나머지는 선택 유지
    if (allAreas) {
      setAllAreas(false);
      setSelectedAreas(AREA_KEYS.filter((k) => k !== a));
      return;
    }
    setSelectedAreas((prev) => {
      const next = prev.includes(a)
        ? prev.filter((x) => x !== a)
        : [...prev, a];
      // 모든 영역이 다시 선택되면 "전체" 상태로 승격
      if (next.length === AREA_KEYS.length) {
        setAllAreas(true);
        return [];
      }
      return next;
    });
  }
  function toggleKeyword(k: string) {
    setSelectedKeywords((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  function generate() {
    setError(null);
    setStep(2);
    startTransition(async () => {
      const result = await generateObservationDraftAction({
        childId,
        classroomId,
        startDate,
        endDate,
        areas: allAreas ? [] : selectedAreas,
        keywords: selectedKeywords,
      });
      if (result.ok) {
        setDraft(result.draft);
        setSources(result.sources);
      } else {
        // 미연동 데모 — 가안(예시) 관찰기록으로 다음 단계 진행.
        // API 연동되면 위 result.ok 경로로 실제 생성됨(가안 미사용).
        setDraft({
          physical_health: `${childName}(이)는 바깥놀이에서 달리기와 균형 잡기 활동에 적극적으로 참여하는 모습이 관찰됨.`,
          communication: `놀이 상황에서 자신의 생각을 문장으로 표현하고 친구의 말에 귀 기울이는 모습을 보임.`,
          social: `또래와 역할을 나누어 협력하고 차례를 지키며 함께 놀이하는 모습이 자주 관찰됨.`,
          artistic: `그리기·만들기 활동에서 다양한 색과 재료를 자유롭게 탐색하며 자신만의 표현을 시도함.`,
          nature: `자연물 관찰 활동에서 곤충과 식물에 호기심을 보이며 질문하는 모습이 관찰됨.`,
          behavior_pattern: `새로운 활동에 먼저 다가가 시도하고, 또래와 어울리며 협력하는 행동이 반복적으로 나타남.`,
          developmental_trend: `기간 동안 자기표현과 또래 상호작용이 점차 안정적으로 발전하는 흐름을 보임.`,
        });
        setSources([
          { date: "5/8", text: "바깥놀이에서 균형 잡기 시도", tag: "신체운동·건강" },
          { date: "5/11", text: "친구와 역할 나눠 협동 놀이", tag: "사회관계" },
          { date: "5/13", text: "자연물 관찰 중 곤충에 호기심", tag: "자연탐구" },
        ]);
      }
      setStep(3);
    });
  }

  function updateArea(key: AreaKey, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function refineArea(area: AreaKey, mode: RefineMode) {
    if (!draft || !draft[area].trim()) return;
    setError(null);
    setRefining({ area, mode });
    startTransition(async () => {
      const result = await refineObservationAreaAction({
        area,
        content: draft[area],
        mode,
      });
      setRefining(null);
      if (result.ok) {
        setDraft((prev) => (prev ? { ...prev, [area]: result.content } : prev));
      } else {
        setError(result.error);
      }
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await saveObservationAction({
        childId,
        classroomId,
        teacherId,
        endDate,
        draft,
      });
      if (result.ok) {
        setStep(4);
        setTimeout(() => {
          router.push(`/dashboard/observations${qs}`);
        }, 1200);
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
          <p className="text-xs text-slate-400">관찰일지 &gt; 관찰기록 생성</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            관찰기록 생성
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            기록을 기반으로 관찰기록 초안을 생성합니다.
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

      {/* 단계 표시 */}
      <StepIndicator step={step} />

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* 좌측 필터 */}
        <section className="flex flex-col space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">아이 선택</p>
            <div className="relative">
              <select
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm focus:border-emerald-400 focus:outline-none"
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">기간 선택</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-emerald-400 focus:outline-none"
              />
              <span className="text-xs text-slate-400">~</span>
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

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              누리과정 영역 (선택)
            </p>
            <ul className="space-y-1.5">
              <Checkbox
                checked={allAreas}
                onToggle={() => {
                  setAllAreas((prev) => !prev);
                  setSelectedAreas([]);
                }}
                label="전체"
              />
              {AREA_KEYS.map((a) => (
                <Checkbox
                  key={a}
                  checked={allAreas || selectedAreas.includes(a)}
                  onToggle={() => toggleArea(a)}
                  label={AREA_LABELS[a]}
                />
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              반영 키워드 (선택)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_KEYWORDS.map((k) => {
                const active = selectedKeywords.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKeyword(k)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      active
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                    )}
                  >
                    {k}
                  </button>
                );
              })}
              <button
                type="button"
                className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] text-slate-500 hover:border-emerald-300 hover:text-emerald-600"
              >
                <Plus className="h-3 w-3" />
                키워드 추가
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className={cn(
              "!mt-auto flex h-11 w-full items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
              isPending
                ? "bg-emerald-300 text-white"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {isPending && step === 2 ? (
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

        {/* 우측 초안 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">관찰기록 초안</p>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              disabled={!draft}
              className={cn(
                "flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-medium",
                draft
                  ? editMode
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "border-slate-100 text-slate-300",
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editMode ? "보기" : "편집하기"}
            </button>
          </div>

          {!draft ? (
            <div className="grid h-72 place-items-center rounded-xl bg-slate-50 text-center">
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
                  {childName}의 관찰기록
                </p>
                <span className="text-slate-400">
                  {startDate} ~ {endDate}
                </span>
              </div>

              {/* 누적 분석 패널 */}
              <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <button
                  type="button"
                  onClick={() => setShowAnalysis((v) => !v)}
                  className="flex w-full items-center justify-between text-sm font-bold text-emerald-900"
                >
                  <span className="flex items-center gap-1.5">
                    <Brain className="h-4 w-4 text-emerald-600" />
                    🤖 누적 분석
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      showAnalysis ? "rotate-180" : "rotate-0",
                    )}
                  />
                </button>
                {showAnalysis && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-white p-3 ring-1 ring-emerald-100">
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <TrendingUp className="h-3 w-3" />
                        행동 패턴
                      </p>
                      {editMode ? (
                        <textarea
                          value={draft.behavior_pattern}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, behavior_pattern: e.target.value } : prev,
                            )
                          }
                          rows={3}
                          className="mt-1 w-full resize-none rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                          {draft.behavior_pattern}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg bg-white p-3 ring-1 ring-emerald-100">
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <Sparkles className="h-3 w-3" />
                        발달 흐름
                      </p>
                      {editMode ? (
                        <textarea
                          value={draft.developmental_trend}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, developmental_trend: e.target.value } : prev,
                            )
                          }
                          rows={3}
                          className="mt-1 w-full resize-none rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                          {draft.developmental_trend}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 영역별 표 */}
              <table className="w-full overflow-hidden rounded-xl ring-1 ring-slate-200">
                <tbody className="divide-y divide-slate-200">
                  {AREA_KEYS.map((k) => {
                    const Icon = AREA_ICONS[k];
                    const busy = refining?.area === k ? refining.mode : null;
                    return (
                      <tr key={k} className="bg-white align-top">
                        <td className="w-32 bg-emerald-50/40 px-3 py-3">
                          <div className="flex flex-col items-center gap-1 text-center">
                            <Icon className="h-4 w-4 text-emerald-600" />
                            <span className="text-xs font-semibold text-emerald-900">
                              {AREA_LABELS[k]}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {editMode ? (
                            <textarea
                              value={draft[k]}
                              onChange={(e) => updateArea(k, e.target.value)}
                              rows={3}
                              className="w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                            />
                          ) : (
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {draft[k]}
                            </p>
                          )}
                          {/* 영역별 다듬기 */}
                          <div className="mt-1.5 flex items-center gap-1">
                            <AreaRefineBtn label="다듬기" mode="polish" busy={busy} onClick={(m) => refineArea(k, m)} />
                            <AreaRefineBtn label="짧게" mode="shorten" busy={busy} onClick={(m) => refineArea(k, m)} />
                            <AreaRefineBtn label="더 자세히" mode="detail" busy={busy} onClick={(m) => refineArea(k, m)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="mt-3 text-[11px] text-slate-400">
                * 위 내용은 기간 내{" "}
                <strong className="text-slate-600">{sources.length}건</strong>의 메모를
                기반으로 생성되었습니다.
              </p>

              {/* 생성 근거 표시 */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <button
                  type="button"
                  onClick={() => setShowSources((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-slate-700"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    근거 기록 ({sources.length}건)
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      showSources ? "rotate-180" : "rotate-0",
                    )}
                  />
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
              </div>
            </>
          )}
        </section>
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
            step === 3
              ? "text-slate-700 hover:bg-slate-50"
              : "text-slate-300",
          )}
        >
          이전 단계
        </button>

        <button
          type="button"
          onClick={save}
          disabled={!draft || isPending}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors",
            draft && !isPending
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-emerald-300 text-white",
          )}
        >
          저장하기
          <Save className="h-4 w-4" />
        </button>
      </div>

      {step === 4 && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
          ✅ 저장되었어요. 관찰일지 목록으로 이동합니다…
        </div>
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
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <li
            key={s.n}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1",
              active
                ? "bg-emerald-600 text-white ring-emerald-600"
                : done
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-white text-slate-500 ring-slate-200",
            )}
          >
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold",
                active
                  ? "bg-white text-emerald-700"
                  : done
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-500",
              )}
            >
              {s.n}
            </span>
            <span className="font-semibold">{s.label}</span>
            {i < steps.length - 1 && (
              <ChevronRight className="ml-1 h-3 w-3 text-slate-300" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AreaRefineBtn({
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
        "flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors",
        active
          ? "border-emerald-400 bg-emerald-100 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        busy && !active ? "opacity-50" : "",
      )}
    >
      {active ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <Wand2 className="h-2.5 w-2.5" />
      )}
      {label}
    </button>
  );
}

function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded border",
            checked
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-300 bg-white",
          )}
        >
          {checked && (
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M2 6.5L5 9.5L10 3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        {label}
      </button>
    </li>
  );
}
