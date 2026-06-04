"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ChevronRight,
  Pencil,
  Check,
  Send,
  Loader2,
  ChevronDown,
  Plus,
  X,
  HelpCircle,
  FileText,
  Search,
  Image as ImageIcon,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateNoteDraftAction,
  saveNoteAction,
  refineNoteAction,
  type RefineMode,
  type SourceMemo,
} from "./actions";

export type ChildOption = { id: string; name: string };
export type ActivityOption = { id: string; date: string; title: string };
export type InitialDraft = {
  id: string;
  childId: string;
  endDate: string;
  content: string;
};
export type PullItem = {
  id: string;
  kind: "note" | "memo";
  childId: string;
  date: string;
  summary: string;
  body: string;
};

const PRESET_KEYWORDS = [
  "또래상호작용",
  "자율성",
  "도전",
  "진전",
  "표현력",
  "협동",
];

function isoMinusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Step = 1 | 2 | 3 | 4;

function parseSavedContent(raw: string): {
  body: string;
  life: Record<string, string>;
  detail: Record<string, string[]>;
  tempAm: string;
  tempPm: string;
} {
  const lifeIdx = raw.indexOf("\n\n[생활기록]");
  const detailIdx = raw.indexOf("\n\n[상세입력]");
  const cutAt = [lifeIdx, detailIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const body = cutAt !== undefined ? raw.slice(0, cutAt).trim() : raw.trim();

  function blockLines(label: string): string[] {
    const idx = raw.indexOf(`[${label}]`);
    if (idx < 0) return [];
    const after = raw.slice(idx + label.length + 2);
    const end = after.search(/\n\[[^\]]+\]/);
    const block = end >= 0 ? after.slice(0, end) : after;
    return block.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("•"));
  }

  const life: Record<string, string> = {};
  for (const line of blockLines("생활기록")) {
    const m = line.match(/^•\s*([^:]+):\s*(.+)$/);
    if (m) life[m[1].trim()] = m[2].trim();
  }

  const detail: Record<string, string[]> = {};
  let tempAm = "";
  let tempPm = "";
  for (const line of blockLines("상세입력")) {
    const m = line.match(/^•\s*([^:]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key === "체온체크") {
      const am = value.match(/오전\s*([\d.]+)/);
      const pm = value.match(/오후\s*([\d.]+)/);
      if (am) tempAm = am[1];
      if (pm) tempPm = pm[1];
    } else {
      detail[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return { body, life, detail, tempAm, tempPm };
}

export function NoteForm({
  childOptions: children,
  qs,
  teacherId,
  classroomId,
  activities,
  initialDraft,
}: {
  childOptions: ChildOption[];
  qs: string;
  teacherId: string;
  classroomId: string;
  activities: ActivityOption[];
  initialDraft?: InitialDraft | null;
}) {
  const router = useRouter();
  const parsedInitial = useMemo(
    () => (initialDraft ? parseSavedContent(initialDraft.content) : null),
    [initialDraft],
  );
  const [step, setStep] = useState<Step>(initialDraft ? 3 : 1);
  const [childId, setChildId] = useState<string>(
    initialDraft?.childId ?? children[0]?.id ?? "",
  );
  const [startDate, setStartDate] = useState(isoMinusDays(13));
  const [endDate, setEndDate] = useState(initialDraft?.endDate ?? todayISO());
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);

  const periodActivities = useMemo(
    () => activities.filter((a) => a.date >= startDate && a.date <= endDate),
    [activities, startDate, endDate],
  );
  const [draft, setDraft] = useState(parsedInitial?.body ?? "");
  // 문단별 근거 라벨 (인라인 배지). draft 문단 순서와 1:1 대응, 없으면 null
  const [paragraphSources, setParagraphSources] = useState<(string | null)[]>([]);
  const [sources, setSources] = useState<SourceMemo[]>([]);
  const [showSources, setShowSources] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [refining, setRefining] = useState<RefineMode | null>(null);

  // 생활기록 (선택사항 — 입력한 항목만 본문 끝에 요약으로 덧붙여 저장)
  const [lifeMood, setLifeMood] = useState<string | null>(parsedInitial?.life["기분"] ?? null);
  const [lifeHealth, setLifeHealth] = useState<string | null>(parsedInitial?.life["건강"] ?? null);
  const [lifeTemp, setLifeTemp] = useState<string | null>(parsedInitial?.life["체온체크"] ?? null);
  const [lifeMeal, setLifeMeal] = useState<string | null>(parsedInitial?.life["식사여부"] ?? null);
  const [lifeSleep, setLifeSleep] = useState<string | null>(parsedInitial?.life["수면시간"] ?? null);
  const [lifeBowel, setLifeBowel] = useState<string | null>(parsedInitial?.life["배변상태"] ?? null);

  // 상세입력 (자유 텍스트 항목 + 체온)
  const [detailSnack, setDetailSnack] = useState<string[]>(parsedInitial?.detail["이유식/간식"] ?? []);
  const [detailFeed, setDetailFeed] = useState<string[]>(parsedInitial?.detail["수유여부"] ?? []);
  const [detailSleep, setDetailSleep] = useState<string[]>(parsedInitial?.detail["수면시간"] ?? []);
  const [detailBowel, setDetailBowel] = useState<string[]>(parsedInitial?.detail["배변상태"] ?? []);
  const [tempAm, setTempAm] = useState(parsedInitial?.tempAm ?? "");
  const [tempPm, setTempPm] = useState(parsedInitial?.tempPm ?? "");

  const childName = children.find((c) => c.id === childId)?.name ?? "";

  function toggleKeyword(k: string) {
    setSelectedKeywords((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  function generate() {
    setError(null);
    setStep(2);
    startTransition(async () => {
      const activityTitles = periodActivities
        .filter((a) => selectedActivities.includes(a.id))
        .map((a) => a.title);
      const result = await generateNoteDraftAction({
        childId,
        classroomId,
        startDate,
        endDate,
        activities: activityTitles,
        keywords: selectedKeywords,
      });
      if (result.ok) {
        setDraft(result.draft);
        setSources(result.sources);
        // 문단 순서대로 근거 라벨 매핑 (best-effort)
        const paras = result.draft.split(/\n\s*\n/);
        setParagraphSources(
          paras.map(
            (_, i) => result.sources[i]?.tag ?? result.sources[i]?.date ?? null,
          ),
        );
      } else {
        // 미연동 데모 — 문단별 근거(가안) 예시로 표시
        const demo: {
          text: string;
          memo: SourceMemo | null;
        }[] = [
          {
            text: `${childName}(이)는 친구들과 어울려 놀이하며 서로의 생각을 나누고 협력하는 모습이 자주 보였어요.`,
            memo: { date: "5/2", text: "친구와 어울려 생각을 나누며 놀이", tag: "또래놀이" },
          },
          {
            text: `블록 놀이 시간에는 친구에게 블록을 양보하고 함께 멋진 구조물을 만들며 성취감을 느꼈습니다.`,
            memo: { date: "5/7", text: "블록을 양보하고 함께 구조물 완성", tag: "블록놀이" },
          },
          {
            text: `식사 시간에는 스스로 먹으려고 노력하며 다양한 음식을 골고루 경험하는 모습이 인상적이었어요.`,
            memo: { date: "5/9", text: "다양한 음식을 골고루 시도", tag: "식사" },
          },
          {
            text: `가정에서도 ${childName}(이)가 스스로 해보려는 경험을 따뜻하게 격려해 주세요.`,
            memo: null,
          },
        ];
        setDraft(demo.map((d) => d.text).join("\n\n"));
        setParagraphSources(
          demo.map((d) => (d.memo ? `${d.memo.date} ${d.memo.tag}` : null)),
        );
        setSources(demo.map((d) => d.memo).filter((m): m is SourceMemo => m !== null));
      }
      setStep(3);
    });
  }

  function refine(mode: RefineMode) {
    if (!draft.trim()) return;
    setError(null);
    setRefining(mode);
    startTransition(async () => {
      const result = await refineNoteAction({ content: draft, mode });
      setRefining(null);
      if (result.ok) setDraft(result.draft);
      else setError(result.error);
    });
  }

  function save(status: "draft" | "published") {
    setError(null);
    const lifeEntries: [string, string | null][] = [
      ["기분", lifeMood],
      ["건강", lifeHealth],
      ["체온체크", lifeTemp],
      ["식사여부", lifeMeal],
      ["수면시간", lifeSleep],
      ["배변상태", lifeBowel],
    ];
    const lifeLines = lifeEntries
      .filter(([, v]) => v)
      .map(([k, v]) => `• ${k}: ${v}`);

    const detailEntries: [string, string[]][] = [
      ["이유식/간식", detailSnack.filter(Boolean)],
      ["수유여부", detailFeed.filter(Boolean)],
      ["수면시간", detailSleep.filter(Boolean)],
      ["배변상태", detailBowel.filter(Boolean)],
    ];
    const detailLines = detailEntries
      .filter(([, arr]) => arr.length)
      .map(([k, arr]) => `• ${k}: ${arr.join(", ")}`);
    const tempLine =
      tempAm || tempPm
        ? `• 체온체크: ${tempAm ? `오전 ${tempAm}°C` : ""}${tempAm && tempPm ? " / " : ""}${tempPm ? `오후 ${tempPm}°C` : ""}`
        : "";
    if (tempLine) detailLines.push(tempLine);

    const blocks = [draft];
    if (lifeLines.length) blocks.push(`[생활기록]\n${lifeLines.join("\n")}`);
    if (detailLines.length) blocks.push(`[상세입력]\n${detailLines.join("\n")}`);
    const contentWithLife = blocks.join("\n\n");
    startTransition(async () => {
      const result = await saveNoteAction({
        childId,
        classroomId,
        teacherId,
        endDate,
        content: contentWithLife,
        status,
        draftId: initialDraft?.id ?? null,
      });
      if (result.ok) {
        setStep(4);
        // 저장 후 알림장 목록 또는 임시보관함으로 보내기
        setTimeout(() => {
          router.push(status === "draft" ? `/dashboard/notes/drafts${qs}` : `/dashboard/notes${qs}`);
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
          <p className="text-xs text-slate-400">알림장 &gt; 알림장 생성</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            알림장 생성
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            기록을 기반으로 알림장 초안을 생성합니다.
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
        <section className="flex flex-col space-y-5 self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {/* 아이 선택 */}
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

          {/* 기간 선택 */}
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

          {/* 활동 선택 */}
          <ActivityDropdown
            activities={periodActivities}
            selected={selectedActivities}
            onChange={setSelectedActivities}
          />

          {/* 반영 키워드 */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-xs font-medium text-slate-600">
                반영 키워드 (선택)
              </p>
              <button
                type="button"
                onClick={() =>
                  setSelectedKeywords((prev) =>
                    prev.length === PRESET_KEYWORDS.length ? [] : [...PRESET_KEYWORDS],
                  )
                }
                className="text-[10px] font-medium text-emerald-700 hover:underline"
              >
                {selectedKeywords.length === PRESET_KEYWORDS.length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_KEYWORDS.map((k) => {
                const active = selectedKeywords.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKeyword(k)}
                    className={cn(
                      "h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                      active
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {k}
                  </button>
                );
              })}
              <button
                type="button"
                className="flex h-7 items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2.5 text-[11px] text-slate-500 hover:border-emerald-300 hover:text-emerald-600"
              >
                <Plus className="h-3 w-3" />
                키워드 추가
              </button>
            </div>
          </div>

          {/* 초안 생성 버튼 */}
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className={cn(
              "!mt-[80px] flex h-11 w-full items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
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
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">알림장 초안</p>
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
              {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {editMode ? "편집 저장" : "편집하기"}
            </button>
          </div>

          {!draft ? (
            <div className="grid h-72 place-items-center rounded-xl bg-slate-50 text-center">
              <div className="text-slate-400">
                <Sparkles className="mx-auto h-8 w-8 text-emerald-200" />
                <p className="mt-2 text-sm">
                  좌측에서 필터를 선택하고 <strong>초안 생성하기</strong>를 눌러주세요.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs">
                <p className="font-semibold text-slate-800">
                  {childName}의 알림장
                </p>
                <span className="text-slate-400">
                  {startDate} ~ {endDate}
                </span>
              </div>

              {editMode ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="block min-h-[22rem] w-full resize-none overflow-y-auto rounded-xl border border-emerald-200 bg-white p-4 text-sm leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                />
              ) : (
                <div className="block min-h-[22rem] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
                  {draft.split(/\n\s*\n/).map((para, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {para}
                      {paragraphSources[i] && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 align-middle text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                          {paragraphSources[i]}
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {/* 표현 수정 + 추가/삭제 */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <p className="mr-1 text-[11px] font-medium text-slate-500">
                  표현 수정
                </p>
                <RefineBtn label="다듬기" mode="polish" busy={refining} onClick={refine} />
                <RefineBtn label="짧게" mode="shorten" busy={refining} onClick={refine} />
                <RefineBtn label="따뜻하게" mode="warmer" busy={refining} onClick={refine} />
                <RefineBtn label="공식적으로" mode="formal" busy={refining} onClick={refine} />
              </div>

              {/* 생성 근거 표시 */}
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
                      기간 내 활동 기록·메모가 없어요.
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
                    * 각 문단 옆의{" "}
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                      근거 배지
                    </span>
                    는 해당 내용의 출처 기록입니다. 활동 기록·메모가 있으면 실제 기록으로, 없으면 예시(가안)로 표시됩니다.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* 생활기록 + 상세입력 (2칼럼) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 생활기록 */}
        <section className="space-y-2.5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-semibold text-slate-700">생활기록</h3>
            <span className="text-[10px] text-slate-400">입력한 항목만 전송됩니다.</span>
          </div>
          <LifeField label="기분" options={["좋음", "보통", "나쁨"]} value={lifeMood} onChange={setLifeMood} />
          <LifeField label="건강" options={["좋음", "보통", "나쁨"]} value={lifeHealth} onChange={setLifeHealth} />
          <LifeField label="체온체크" options={["정상", "미열", "고열"]} value={lifeTemp} onChange={setLifeTemp} />
          <LifeField label="식사여부" options={["정량", "많이", "적게", "안했음"]} value={lifeMeal} onChange={setLifeMeal} />
          <LifeField
            label="수면시간"
            options={["안 잤어요", "1시간 미만", "1~1시간30분", "1시간30분~2시간", "2시간 이상"]}
            value={lifeSleep}
            onChange={setLifeSleep}
          />
          <LifeField
            label="배변상태"
            options={["보통", "딱딱함", "묽음", "설사", "안했음"]}
            value={lifeBowel}
            onChange={setLifeBowel}
          />
        </section>

        {/* 상세입력 */}
        <section className="space-y-2.5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-semibold text-slate-700">상세입력</h3>
            <span className="text-[10px] text-slate-400">입력한 항목만 전송됩니다.</span>
          </div>
          <DetailListField label="이유식/간식" items={detailSnack} onChange={setDetailSnack} placeholder="예: 사과 한 조각" />
          <DetailListField label="수유여부" items={detailFeed} onChange={setDetailFeed} placeholder="예: 분유 120ml" />
          <DetailListField label="수면시간" items={detailSleep} onChange={setDetailSleep} placeholder="예: 13:00~14:30" />
          <DetailListField label="배변상태" items={detailBowel} onChange={setDetailBowel} placeholder="예: 10:00 보통" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            <p className="text-[11px] font-medium text-slate-500">체온체크</p>
            <TempInput label="오전" value={tempAm} onChange={setTempAm} />
            <TempInput label="오후" value={tempPm} onChange={setTempPm} />
          </div>
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

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={!draft || isPending}
            className={cn(
              "h-10 rounded-lg border px-4 text-sm font-medium",
              draft && !isPending
                ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                : "border-slate-100 text-slate-300",
            )}
          >
            임시저장
          </button>
          <button
            type="button"
            onClick={() => save("published")}
            disabled={!draft || isPending}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors",
              draft && !isPending
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-emerald-300 text-white",
            )}
          >
            발송
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {step === 4 && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
          ✅ 저장되었어요. 알림장 목록으로 이동합니다…
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
    { n: 4, label: "저장 및 발송" },
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

function DetailListField({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
      <p className="mt-1.5 w-16 shrink-0 text-[11px] font-medium text-slate-500">{label}</p>
      <div className="min-w-0 flex-1 space-y-1">
        {items.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={v}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="h-7 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:border-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label="삭제"
              className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex h-6 items-center gap-0.5 rounded text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
        >
          <Plus className="h-3 w-3" />
          항목추가
        </button>
      </div>
    </div>
  );
}

function TempInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="relative">
        <input
          type="number"
          step="0.1"
          value={value}
          placeholder="36.5"
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-20 rounded-md border border-slate-200 bg-white pl-2 pr-7 text-[11px] text-slate-700 focus:border-emerald-400 focus:outline-none"
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
          °C
        </span>
      </div>
    </div>
  );
}

function LifeField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <p className="w-14 shrink-0 text-[11px] font-medium text-slate-500">{label}</p>
      <div className="grid flex-1 auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-slate-200 bg-white">
        {options.map((opt, i) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active ? null : opt)}
              className={cn(
                "h-8 text-xs font-medium transition-colors",
                i > 0 && "border-l border-slate-200",
                active
                  ? "bg-emerald-500 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
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
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  }

  return (
    <div className="relative">
      <p className="mb-1.5 text-xs font-medium text-slate-600">활동 선택 (선택)</p>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-xs",
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

function PullPanel({
  items,
  children,
  currentChildId,
  onInsert,
}: {
  items: PullItem[];
  children: ChildOption[];
  currentChildId: string;
  onInsert: (text: string) => void;
}) {
  const [tab, setTab] = useState<"all" | "note" | "memo">("all");
  const [q, setQ] = useState("");
  const [filterMine, setFilterMine] = useState(true);

  const filtered = useMemo(() => {
    return items
      .filter((it) => (tab === "all" ? true : it.kind === tab))
      .filter((it) => (filterMine ? it.childId === currentChildId : true))
      .filter((it) =>
        q.trim() ? it.summary.toLowerCase().includes(q.trim().toLowerCase()) : true,
      )
      .slice(0, 40);
  }, [items, tab, filterMine, currentChildId, q]);

  return (
    <aside className="space-y-2.5 self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6">
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
            { k: "all", label: "전체" },
            { k: "note", label: "알림장" },
            { k: "memo", label: "활동 메모" },
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

      <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
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
                  onClick={() => onInsert(it.body)}
                  className="group w-full rounded-lg border border-slate-100 bg-white p-2.5 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                      {it.kind === "note" ? (
                        <MessageSquare className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <ImageIcon className="h-3 w-3 text-amber-500" />
                      )}
                      <span className="text-slate-600">
                        {it.kind === "note" ? "알림장" : "활동 메모"}
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
