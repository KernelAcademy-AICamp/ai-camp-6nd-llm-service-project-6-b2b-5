"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Upload,
  Check,
  X,
  Sparkles,
  Loader2,
  Tag,
  Users,
  ArrowRight,
  ArrowLeft,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  analyzePhotosAction,
  generateChildSummariesAction,
  saveActivityRecordAction,
  loadSavedChildPhotosAction,
  autoClassifyByProfileAction,
  type PhotoAnalysis,
} from "./actions";
import {
  DEMO_UPLOAD_DOGS,
  getDemoDogProfile,
  getDemoUploadsForBreeds,
} from "@/lib/demo-dogs";
import {
  loadHandoff,
  saveHandoff,
  clearHandoff,
  type DailyActivityHandoff,
} from "@/lib/activity-handoff";

export type ChildOption = {
  id: string;
  name: string;
  gender: "M" | "F" | null;
  privacy_agreed_at: string | null;
  status: "active" | "inactive" | "graduated";
};

type UploadedImage = {
  id: string;
  dataUrl: string;
  name: string;
};

export type StepNumber = 1 | 2;

const STEP_META: Record<StepNumber, { label: string; sub: string }> = {
  1: { label: "매일 활동 기록", sub: "사진 업로드 + AI 분석 + 사진 분류" },
  2: { label: "원아 활동 기록", sub: "원아별 한 줄 메모" },
};

const MAX_IMAGE_DIM = 1280;
const IMAGE_QUALITY = 0.82;
/** 한 번에 업로드 가능한 최대 사진 수 */
const MAX_PHOTOS = 100;

/** 업로드 허용 이미지 MIME 타입 (jpg/jpeg/png/webp) */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** 사용자 안내용 허용 형식 라벨 */
const ALLOWED_EXT_LABEL = "JPG, JPEG, PNG, WEBP";

/** 파일이 허용된 이미지 형식인지 확인 */
function isAllowedImage(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.includes(file.type);
}

/** DB 저장 타임아웃 (ms) — 명세 T3-3 */
const SAVE_TIMEOUT_MS = 10_000;

/** Promise 에 타임아웃 적용. 초과 시 "TIMEOUT" 에러로 거부 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(
          MAX_IMAGE_DIM / img.width,
          MAX_IMAGE_DIM / img.height,
          1,
        );
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 컨텍스트 실패"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      img.onerror = () => reject(new Error("이미지 로드 실패"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

/** 같은 출처(/public) 이미지 URL → 압축 jpeg dataUrl (데모 강아지 로드용) */
async function urlToCompressedDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(
        MAX_IMAGE_DIM / img.width,
        MAX_IMAGE_DIM / img.height,
        1,
      );
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 컨텍스트 실패"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
    };
    img.onerror = () => reject(new Error("이미지 로드 실패: " + url));
    img.src = url;
  });
}

/**
 * 활동 기록 작성 폼 (1단계 매일 활동 기록 + 2단계 원아 활동 기록)
 * @param childOptions 담당 반 원아 목록
 * @param classroomName 현재 반 이름
 * @param classroomId 현재 반 id (DB 저장용)
 * @param teacherId 작성 교사 id (DB 저장용)
 * @param todayMemoHref 한줄기록(오늘 메모) 링크
 * @param initialStep 진입 시 시작 단계 (1 | 2)
 */
export function ActivityRecordForm({
  childOptions: children,
  classroomName,
  classroomId,
  teacherId,
  attendanceCount,
  todayMemoHref,
  initialStep,
  nextStepHref,
}: {
  childOptions: ChildOption[];
  classroomName: string;
  classroomId: string;
  teacherId: string;
  attendanceCount: number; // 오늘 출석 인원 수 (퇴소·미출석 제외)
  todayMemoHref: string;
  initialStep: StepNumber;
  nextStepHref?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacingIdRef = useRef<string | null>(null);
  const [step, setStep] = useState<StepNumber>(initialStep);

  // step 1 — 사진 + AI 분석
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // photoId -> childId (원아별 사진 배정). 3-pane 팝업에서 관리.
  const [photoAssignments, setPhotoAssignments] = useState<
    Record<string, string>
  >({});
  // photoId -> 활동 태그 (사진별)
  const [photoActivityTags, setPhotoActivityTags] = useState<
    Record<string, string>
  >({});
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const [showClusterModal, setShowClusterModal] = useState(false);
  // 분류 팝업 좌측에서 선택된 원아
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  // 분류 팝업 작업본(draft) — 분류완료 시에만 확정본(photoAssignments/Tags)에 커밋
  const [draftAssignments, setDraftAssignments] = useState<
    Record<string, string>
  >({});
  const [draftTags, setDraftTags] = useState<Record<string, string>>({});
  // DB 저장 상태
  const [saving, setSaving] = useState(false);
  // 저장/다음단계 게이팅: 변경 있음(dirty) / 한 번이라도 저장됨(savedOnce)
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  // 페이지 이탈 경고 (미저장 변경 시)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  // 분류 팝업 중앙 드롭존 하이라이트
  const [centerDropActive, setCenterDropActive] = useState(false);
  // 데모 강아지 자동분류 디폴트 (캐시) + 진행 상태
  const [defaultAssignments, setDefaultAssignments] = useState<
    Record<string, string>
  >({});
  const [autoClassifying, setAutoClassifying] = useState(false);
  const defaultComputedRef = useRef(false);
  // 저장 검증 — DB에서 다시 불러온 원아별 사진(서명 URL)
  const [savedPhotosByChild, setSavedPhotosByChild] = useState<
    Record<string, string[]>
  >({});
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedLoaded, setSavedLoaded] = useState(false);

  // step 3 — 원아별 한 줄 메모 (전체 리스트 인라인 편집)
  const [savedMemos, setSavedMemos] = useState<Record<string, string>>({});
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // 공용
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hydratedRef = useRef(false);

  // 마운트 시 핸드오프 복원 (새로고침/단계 직접 진입 시 유용)
  // sessionStorage 우선, 없으면 localStorage 백업에서 복원
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const handoff = loadHandoff();
    if (!handoff) return;
    // 다른 반의 작업이면 복원하지 않음 (반 전환 시 이전 작업 노출 방지)
    if (handoff.classroomName && handoff.classroomName !== classroomName) return;
    const restoredImages: UploadedImage[] = [];
    const restoredAssignments: Record<string, string> = {};
    const restoredTags: Record<string, string> = {};
    for (const cluster of handoff.clusters) {
      for (const photo of cluster.photos) {
        restoredImages.push({
          id: photo.id,
          dataUrl: photo.dataUrl,
          name: photo.id,
        });
        if (cluster.childId) restoredAssignments[photo.id] = cluster.childId;
        if (photo.activity) restoredTags[photo.id] = photo.activity;
      }
    }
    const uniqueImages = Array.from(
      new Map(restoredImages.map((p) => [p.id, p])).values(),
    );
    if (uniqueImages.length > 0) {
      setImages(uniqueImages);
      setSelectedPhotoIds(new Set(uniqueImages.map((p) => p.id)));
    }
    if (Object.keys(restoredAssignments).length > 0)
      setPhotoAssignments(restoredAssignments);
    if (Object.keys(restoredTags).length > 0) setPhotoActivityTags(restoredTags);
    if (handoff.analysis) setAnalysis(handoff.analysis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 진행 중인 모든 작업 상태 초기화 (반/교사 전환 시) */
  function resetAllWork() {
    setStep(1);
    setImages([]);
    setAnalysis(null);
    setEditingAnalysis(false);
    setSelectedPhotoIds(new Set());
    setPhotoAssignments({});
    setPhotoActivityTags({});
    setDraftAssignments({});
    setDraftTags({});
    setSelectedChildId("");
    setSavedMemos({});
    setDirty(false);
    setSavedOnce(false);
    setDefaultAssignments({});
    defaultComputedRef.current = false;
    setSavedPhotosByChild({});
    setSavedLoaded(false);
    setShowClusterModal(false);
    setShowLeaveDialog(false);
    setError(null);
    clearHandoff();
  }

  // 반/교사(스코프) 전환 시 진행 작업 초기화 — 이전 컨텍스트 작업 노출 방지
  const scopeRef = useRef(`${classroomId}|${teacherId}`);
  useEffect(() => {
    const scope = `${classroomId}|${teacherId}`;
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    resetAllWork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, teacherId]);

  // 분류 팝업 열림 중 ESC 키로 닫기 (작업본 폐기)
  useEffect(() => {
    if (!showClusterModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowClusterModal(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showClusterModal]);

  // 미저장 변경: 업로드한 사진이 있고, 아직 저장 안 했거나 저장 후 변경됨
  const hasUnsavedWork = images.length > 0 && (dirty || !savedOnce);

  // 미저장 시 이탈 경고 — 새로고침·탭 종료(하드) + 앱 내 다른 메뉴 이동(링크 클릭)
  const pendingHrefRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasUnsavedWork) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    function onDocClickCapture(e: MouseEvent) {
      if (showLeaveDialog) return;
      const el = e.target as HTMLElement | null;
      const a = el?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank") return;
      // 현재 페이지와 동일 URL이면 무시
      if (href === window.location.pathname + window.location.search) return;
      // 다른 메뉴 등으로 이동 시도 → 경고 후 보류
      e.preventDefault();
      e.stopPropagation();
      pendingHrefRef.current = href;
      setShowLeaveDialog(true);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocClickCapture, true);
    };
  }, [hasUnsavedWork, showLeaveDialog]);

  function confirmLeave() {
    setShowLeaveDialog(false);
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    if (href) router.push(href);
  }

  // 2단계 진입 시 DB 저장된 원아별 사진을 한 번 자동 조회
  useEffect(() => {
    if (step === 2 && !savedLoaded && classroomId) {
      refreshSavedPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const today = new Date();
  const dateLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  function runAnalysis(allImages: UploadedImage[]) {
    // 최소 1장 이상이어야 AI 활동 분석 수행
    if (allImages.length === 0) return;
    setError(null);
    const dataUrls = allImages.map((p) => p.dataUrl);
    startTransition(async () => {
      // 외형 그룹핑(clusterPhotosAction)은 UI에서 제거되어 호출하지 않음(토큰 절약)
      const analysisResult = await analyzePhotosAction({ imageDataUrls: dataUrls });
      if (analysisResult.ok) {
        setAnalysis(analysisResult.analysis);
        markDirty();
      } else {
        setError(analysisResult.error);
      }
    });
  }

  /** 여러 사진 업로드 — 허용 형식만 추가하고, 미지원 형식은 안내 메시지로 알림 */
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    const rejected: string[] = [];
    let limitHit = false;
    try {
      const remaining = MAX_PHOTOS - images.length;
      if (remaining <= 0) {
        setError(`사진은 최대 ${MAX_PHOTOS}장까지 업로드할 수 있어요.`);
        return;
      }
      const uploads: UploadedImage[] = [];
      for (let i = 0; i < fileList.length; i++) {
        if (uploads.length >= remaining) {
          limitHit = true;
          break;
        }
        const file = fileList.item(i);
        if (!file) continue;
        if (!isAllowedImage(file)) {
          rejected.push(file.name);
          continue;
        }
        const dataUrl = await fileToCompressedDataUrl(file);
        uploads.push({
          id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          name: file.name,
        });
      }
      const next = [...images, ...uploads];
      setImages(next);
      // 새로 업로드된 사진은 자동으로 선택 상태
      if (uploads.length > 0) {
        setSelectedPhotoIds((prev) => {
          const out = new Set(prev);
          for (const u of uploads) out.add(u.id);
          return out;
        });
        invalidateDefault();
        runAnalysis(next);
      }
      if (rejected.length > 0) {
        setError(
          `지원하지 않는 형식이에요 (${ALLOWED_EXT_LABEL}만 가능): ${rejected.join(", ")}`,
        );
      } else if (limitHit) {
        setError(`사진은 최대 ${MAX_PHOTOS}장까지 업로드할 수 있어요. 초과분은 제외했어요.`);
      }
    } catch (e) {
      console.error("[활동기록] 사진 업로드 실패", e);
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** 특정 사진 1장을 새 사진으로 교체 (id 유지 → 분류·매칭 보존) */
  async function handleReplaceFile(fileList: FileList | null) {
    const targetId = replacingIdRef.current;
    const file = fileList?.item(0) ?? null;
    replacingIdRef.current = null;
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    if (!targetId || !file) return;
    if (!isAllowedImage(file)) {
      setError(`지원하지 않는 형식이에요 (${ALLOWED_EXT_LABEL}만 가능): ${file.name}`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const next = images.map((p) =>
        p.id === targetId ? { ...p, dataUrl, name: file.name } : p,
      );
      setImages(next);
      runAnalysis(next);
    } catch (e) {
      console.error("[활동기록] 사진 재업로드 실패", e);
      setError(e instanceof Error ? e.message : "재업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  /** 사진별 재업로드 버튼 → 단일 선택 input 열기 */
  function startReplace(id: string) {
    replacingIdRef.current = id;
    replaceInputRef.current?.click();
  }

  /** 드래그 앤 드롭으로 사진 업로드 */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((p) => p.id !== id));
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // 확정본 + 작업본 모두에서 제거 (데이터 오염 방지)
    const drop = (m: Record<string, string>) => {
      const next = { ...m };
      delete next[id];
      return next;
    };
    setPhotoAssignments(drop);
    setPhotoActivityTags(drop);
    setDraftAssignments(drop);
    setDraftTags(drop);
    invalidateDefault();
    markDirty();
  }

  /** 사진 구성이 바뀌면 자동분류 디폴트 캐시를 무효화 */
  function invalidateDefault() {
    defaultComputedRef.current = false;
    setDefaultAssignments({});
  }

  /** 업로드한 사진 전체 삭제 (분석·분류 포함 초기화) */
  function clearAllPhotos() {
    setImages([]);
    setSelectedPhotoIds(new Set());
    setPhotoAssignments({});
    setPhotoActivityTags({});
    setDraftAssignments({});
    setDraftTags({});
    setAnalysis(null);
    invalidateDefault();
    markDirty();
  }

  /** 데모 강아지 사진 10장을 업로드 영역에 불러오기 */
  async function loadDemoDogs() {
    setUploading(true);
    setError(null);
    try {
      const remaining = MAX_PHOTOS - images.length;
      // 활성 반 원아들의 견종에 맞춰 로드(모두 매칭됨). 프로필 없는 반이면 기본 10장.
      const classBreeds = children
        .map((c) => getDemoDogProfile(c.name)?.breed)
        .filter((b): b is string => !!b);
      const source =
        classBreeds.length > 0
          ? getDemoUploadsForBreeds(classBreeds)
          : DEMO_UPLOAD_DOGS;
      const urls = source.slice(0, Math.max(0, remaining));
      const loaded: UploadedImage[] = [];
      for (let i = 0; i < urls.length; i++) {
        const dataUrl = await urlToCompressedDataUrl(urls[i]);
        loaded.push({
          id: `dog-${Date.now()}-${i}`,
          dataUrl,
          name: urls[i].split("/").pop() ?? "dog.jpg",
        });
      }
      if (loaded.length === 0) return;
      const next = [...images, ...loaded];
      setImages(next);
      setSelectedPhotoIds((prev) => {
        const s = new Set(prev);
        loaded.forEach((l) => s.add(l.id));
        return s;
      });
      invalidateDefault();
      runAnalysis(next);
    } catch (e) {
      console.error("[활동기록] 데모 강아지 로드 실패", e);
      setError(e instanceof Error ? e.message : "데모 사진 로드 실패");
    } finally {
      setUploading(false);
    }
  }

  /** 강아지 프로필 매칭으로 원아별 디폴트 배정 계산 (photoId -> childId) */
  async function computeDefaultClassification(): Promise<
    Record<string, string>
  > {
    const profChildren = children.filter((c) => getDemoDogProfile(c.name));
    if (profChildren.length === 0 || images.length === 0) return {};
    const profiles: { childId: string; dataUrl: string; label?: string }[] = [];
    for (const c of profChildren) {
      const prof = getDemoDogProfile(c.name);
      if (!prof) continue;
      profiles.push({
        childId: c.id,
        dataUrl: await urlToCompressedDataUrl(prof.url),
        label: prof.breed,
      });
    }
    const uploads = images.map((p) => ({ photoId: p.id, dataUrl: p.dataUrl }));
    const res = await autoClassifyByProfileAction({ profiles, uploads });
    return res.ok ? res.assignments : {};
  }

  function togglePhotoSelection(id: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** (draft) 사진을 특정 원아에게 배정/해제 (같은 원아 재클릭 시 해제) */
  function togglePhotoForChild(photoId: string, childId: string) {
    if (!childId) return;
    setDraftAssignments((prev) => {
      const next = { ...prev };
      if (next[photoId] === childId) delete next[photoId];
      else next[photoId] = childId;
      return next;
    });
  }

  /** (draft) 드래그앤드롭으로 선택 원아에게 사진 배정 (해제 아님) */
  function handleCenterDrop(e: React.DragEvent) {
    e.preventDefault();
    setCenterDropActive(false);
    const photoId = e.dataTransfer.getData("text/plain");
    if (!photoId || !selectedChild) return;
    setDraftAssignments((prev) => ({ ...prev, [photoId]: selectedChild.id }));
  }

  /** 분류 팝업 작업본 사진별 활동 태그 설정 (draft) */
  function setActivityTag(photoId: string, tag: string) {
    setDraftTags((prev) => {
      const next = { ...prev };
      if (tag.trim()) next[photoId] = tag;
      else delete next[photoId];
      return next;
    });
  }

  /** 편집·분류 등 변경 발생 표시 → 저장 버튼 재활성 / 다음단계 비활성 */
  function markDirty() {
    setDirty(true);
  }

  /** 특정 원아에게 배정된 사진 목록 */
  const photosForChild = (childId: string) =>
    images.filter((p) => photoAssignments[p.id] === childId);

  // 사진이 1장 이상 배정된 원아 집합
  const matchedChildIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cid of Object.values(photoAssignments)) {
      if (cid) ids.add(cid);
    }
    return ids;
  }, [photoAssignments]);
  const matchedCount = matchedChildIds.size;
  const assignedPhotoCount = Object.keys(photoAssignments).length;

  // 핸드오프 자동 저장 (sessionStorage 주 + localStorage 백업)
  // 원아별로 사진을 묶어 clusters 형태로 저장 → 2단계·한줄기록·알림장·관찰일지가 읽음
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!analysis && Object.keys(photoAssignments).length === 0) {
      clearHandoff();
      return;
    }
    const now = new Date();
    const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const byChild = new Map<string, UploadedImage[]>();
    for (const img of images) {
      const cid = photoAssignments[img.id];
      if (!cid) continue;
      const arr = byChild.get(cid) ?? [];
      arr.push(img);
      byChild.set(cid, arr);
    }
    const childNameById = new Map(children.map((c) => [c.id, c.name]));
    const payload: DailyActivityHandoff = {
      classroomName,
      date: isoDate,
      savedAt: Date.now(),
      analysis,
      clusters: Array.from(byChild.entries()).map(([childId, photos]) => ({
        description: childNameById.get(childId) ?? "원아",
        childId,
        photos: photos.map((p) => ({
          id: p.id,
          dataUrl: p.dataUrl,
          activity: photoActivityTags[p.id] ?? null,
        })),
      })),
    };
    saveHandoff(payload);
  }, [
    analysis,
    photoAssignments,
    photoActivityTags,
    classroomName,
    images,
    children,
  ]);

  function generateAllSummaries() {
    if (!analysis) {
      setError("1단계에서 AI 활동 분석이 먼저 완료되어야 해요.");
      return;
    }
    if (children.length === 0) return;
    setError(null);
    const childPayload = children.map((c) => {
      const photos = photosForChild(c.id);
      const tags = Array.from(
        new Set(
          photos
            .map((p) => photoActivityTags[p.id]?.trim())
            .filter((t): t is string => !!t),
        ),
      );
      return {
        name: c.name,
        photoCount: photos.length,
        clusterDescription: tags.length ? tags.join(", ") : null,
      };
    });
    startTransition(async () => {
      const result = await generateChildSummariesAction({
        classroomName,
        activityTitle: analysis.activity_title,
        activityDescription: analysis.activity_description,
        keywords: analysis.keywords,
        children: childPayload,
      });
      if (result.ok) {
        setSavedMemos((prev) => {
          const next = { ...prev };
          children.forEach((c, i) => {
            const s = result.summaries[i];
            if (s) next[c.id] = s.trim();
          });
          return next;
        });
        const ok = result.summaries.filter((s) => s && s.trim()).length;
        setSaveToast(`${ok}명 원아 한 줄 메모 일괄 생성 완료`);
        window.setTimeout(() => setSaveToast(null), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  function isoToday(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  /** 원아별 분류 사진을 Supabase 에 저장 (성공 여부 반환) */
  async function saveToDb(): Promise<boolean> {
    if (!classroomId) {
      setError("담당 반 정보가 없어 저장할 수 없어요.");
      return false;
    }
    // 원아별 분류는 선택사항 — 배정이 없어도 세션(활동 제목)은 저장
    const groups = children
      .map((c) => ({
        childId: c.id,
        photos: photosForChild(c.id).map((p) => ({
          dataUrl: p.dataUrl,
          activity: photoActivityTags[p.id] ?? null,
        })),
      }))
      .filter((g) => g.photos.length > 0);

    setSaving(true);
    setError(null);
    try {
      const res = await withTimeout(
        saveActivityRecordAction({
          classroomId,
          teacherId,
          date: isoToday(),
          activityTitle: analysis?.activity_title ?? null,
          children: groups,
        }),
        SAVE_TIMEOUT_MS,
      );
      if (!res.ok) {
        setError(`저장 실패: ${res.error}`);
        return false;
      }
      setSavedOnce(true);
      setDirty(false);
      setSaveToast("매일 활동 기록이 저장됐습니다.");
      window.setTimeout(() => setSaveToast(null), 2500);
      return true;
    } catch (e) {
      console.error("[활동기록] 저장 호출 실패", e);
      if (e instanceof Error && e.message === "TIMEOUT") {
        setError(
          "저장 응답이 10초를 넘어 취소했어요. 네트워크를 확인 후 다시 시도해주세요.",
        );
      } else {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** DB에 저장된 원아별 사진 다시 불러오기 (저장 검증용) */
  function refreshSavedPhotos() {
    if (!classroomId) return;
    setLoadingSaved(true);
    startTransition(async () => {
      const res = await loadSavedChildPhotosAction({
        classroomId,
        date: isoToday(),
      });
      setLoadingSaved(false);
      if (res.ok) {
        setSavedPhotosByChild(res.byChild);
        setSavedLoaded(true);
      } else {
        setError(`저장 사진 조회 실패: ${res.error}`);
      }
    });
  }

  function tryGoStep(target: StepNumber) {
    setError(null);
    // 저장은 별도 '저장하기' 버튼에서만 수행 (자동저장 제거)
    setStep(target);
  }

  /** 분류 팝업 열기 — 첫 원아 자동 선택 */
  /**
   * 분류 팝업 열기.
   * - 확정본이 있으면 그걸 작업본으로 복제
   * - 없으면 강아지 프로필 매칭으로 자동분류 디폴트를 계산(캐시)해 작업본에 채움
   */
  async function openClassifyModal() {
    // 팝업 열 때 항상 1번(첫) 원아를 기본 선택
    if (children.length > 0) {
      setSelectedChildId(children[0].id);
    }
    setShowClusterModal(true);
    setDraftTags({ ...photoActivityTags });

    const hasCommitted = Object.keys(photoAssignments).length > 0;
    if (hasCommitted) {
      setDraftAssignments({ ...photoAssignments });
      return;
    }
    // 디폴트 자동분류 (이미 계산했으면 재사용)
    if (defaultComputedRef.current) {
      setDraftAssignments({ ...defaultAssignments });
      return;
    }
    setAutoClassifying(true);
    try {
      const def = await computeDefaultClassification();
      setDefaultAssignments(def);
      defaultComputedRef.current = true;
      setDraftAssignments(def);
    } catch (e) {
      console.error("[활동기록] 자동분류 디폴트 실패", e);
    } finally {
      setAutoClassifying(false);
    }
  }

  /** 분류 완료 — 작업본을 확정본에 커밋하고 팝업 닫기 */
  function commitClassification() {
    setPhotoAssignments({ ...draftAssignments });
    setPhotoActivityTags({ ...draftTags });
    markDirty();
    setShowClusterModal(false);
  }

  /** 작업 초기화 — 현재 작업본을 자동분류 디폴트로 되돌림 */
  function resetClassification() {
    setDraftAssignments({ ...defaultAssignments });
    setDraftTags({});
  }

  /** 그냥 닫기(X·바깥·ESC) — 작업본 폐기, 확정본 유지 */
  function discardClassification() {
    setShowClusterModal(false);
  }

  // 분류 팝업용 파생값 (draft 기반)
  const selectedChild =
    children.find((c) => c.id === selectedChildId) ?? children[0] ?? null;
  const selectedIdx = selectedChild
    ? children.findIndex((c) => c.id === selectedChild.id)
    : -1;
  const ACTIVITY_DATALIST_ID = "activity-tag-suggestions";
  /** (draft) 특정 원아에게 배정된 사진 */
  const draftPhotosForChild = (childId: string) =>
    images.filter((p) => draftAssignments[p.id] === childId);
  const draftAssignedCount = Object.keys(draftAssignments).length;
  const draftMatchedCount = new Set(Object.values(draftAssignments)).size;

  return (
    <div className="space-y-6">
      {/* 헤더 (뒤로가기 버튼 제거 — 이탈 경고는 메뉴 이동/새로고침 시 유지) */}
      <section>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          매일 활동 기록 · {step}단계 — {STEP_META[step].label}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {dateLabel} · {classroomName} · {STEP_META[step].sub}
        </p>
      </section>

      {/* 스테퍼 */}
      <section>
        <ol className="flex items-center gap-1.5">
          {([1, 2] as StepNumber[]).map((n, idx) => {
            const isActive = n === step;
            const isDone =
              (n === 1 && !!analysis) ||
              (n === 2 && Object.keys(savedMemos).length > 0);
            const isReachable = true;
            return (
              <li key={n} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => tryGoStep(n)}
                  disabled={!isReachable}
                  title={STEP_META[n].sub}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : isReachable
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-slate-50 text-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                      isActive
                        ? "bg-white/25 text-white"
                        : isDone
                          ? "bg-emerald-500 text-white"
                          : "bg-white text-slate-500 ring-1 ring-slate-200",
                    )}
                  >
                    {isDone && !isActive ? (
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    ) : (
                      n
                    )}
                  </span>
                  {STEP_META[n].label}
                </button>
                {idx < 1 && (
                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      {/* STEP 1 — 매일 활동 기록 */}
      {step === 1 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-900">
              사진 업로드 + AI 활동 분석
            </p>
            {isPending && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI 분석 중…
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleReplaceFile(e.target.files)}
          />
          {/* 데모: 강아지 사진 불러오기 (원아 프로필 강아지와 외형 매칭 자동분류 시연) */}
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={loadDemoDogs}
              disabled={uploading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="무료 강아지 사진 10장을 불러와 자동분류를 시연합니다"
            >
              🐶 데모 강아지 사진 불러오기
            </button>
          </div>
          {images.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              disabled={uploading}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
                dragOver
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-slate-200 bg-slate-50/50 hover:border-emerald-300 hover:bg-emerald-50/50",
              )}
            >
              {uploading ? (
                <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
              ) : (
                <Upload className="h-7 w-7 text-slate-400" />
              )}
              <p className="text-sm text-slate-600">
                {uploading
                  ? "이미지 변환 중…"
                  : dragOver
                    ? "여기에 놓으면 업로드됩니다"
                    : `사진을 클릭하거나 끌어다 놓아 업로드 (최대 ${MAX_PHOTOS}장)`}
              </p>
              <p className="text-[11px] text-slate-400">{ALLOWED_EXT_LABEL} 형식</p>
            </button>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-xl border-2 border-dashed p-3 transition-colors",
                dragOver
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-slate-200 bg-slate-50/50",
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-slate-500">
                  총 {images.length}장 /{" "}
                  <span className="text-emerald-700">
                    선택된 {selectedPhotoIds.size}장
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  {uploading && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      추가 중…
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPhotoIds.size === images.length) {
                        setSelectedPhotoIds(new Set());
                      } else {
                        setSelectedPhotoIds(new Set(images.map((p) => p.id)));
                      }
                    }}
                    className="text-[11px] font-medium text-slate-600 underline hover:text-slate-800"
                  >
                    {selectedPhotoIds.size === images.length
                      ? "전체 해제"
                      : "전체 선택"}
                  </button>
                  <button
                    type="button"
                    onClick={clearAllPhotos}
                    className="text-[11px] font-medium text-rose-600 underline hover:text-rose-700"
                  >
                    전체 삭제
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {images.map((p) => {
                  const selected = selectedPhotoIds.has(p.id);
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => togglePhotoSelection(p.id)}
                        className={cn(
                          "block aspect-square w-full overflow-hidden rounded-lg ring-1 transition-all",
                          selected
                            ? "ring-2 ring-emerald-500 ring-offset-1"
                            : "opacity-60 ring-slate-200 hover:opacity-100",
                        )}
                        aria-pressed={selected}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.dataUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      {selected && (
                        <span className="pointer-events-none absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white shadow">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(p.id)}
                        className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-slate-500 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                        aria-label="삭제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startReplace(p.id)}
                        className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-slate-500 opacity-0 transition-opacity hover:text-emerald-600 group-hover:opacity-100"
                        aria-label="재업로드"
                        title="이 사진 교체"
                      >
                        <RotateCw className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="grid aspect-square w-full place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-500"
                  aria-label="사진 추가"
                >
                  <Upload className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* 사진 분류하기 — 3-pane 팝업 열기 */}
          {images.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <p className="text-xs text-slate-600">
                업로드한 사진을{" "}
                <strong className="text-slate-900">원아별로 분류</strong>해
                보세요.
                {assignedPhotoCount > 0 && (
                  <span className="ml-1 text-emerald-700">
                    (배정 {assignedPhotoCount}장 · 원아 {matchedCount}명)
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={openClassifyModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Users className="h-3.5 w-3.5" />
                사진 분류하기
              </button>
            </div>
          )}

          {/* AI 활동 분석 — 사진 업로드 전에는 표시하지 않음 */}
          {images.length > 0 && (
          <div className="mt-5">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                  <Sparkles className="h-4 w-4" />
                  AI 활동 분석
                </p>
                {analysis && (
                  <button
                    type="button"
                    onClick={() => setEditingAnalysis((v) => !v)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-medium",
                      editingAnalysis
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {editingAnalysis ? "보기" : "편집"}
                  </button>
                )}
              </div>

              {!analysis ? (
                <div className="grid place-items-center py-6 text-center">
                  <div className="text-slate-400">
                    {isPending ? (
                      <>
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-500" />
                        <p className="mt-2 text-xs">사진을 분석하고 있어요…</p>
                      </>
                    ) : (
                      <>
                        <Sparkles className="mx-auto h-6 w-6 text-emerald-200" />
                        <p className="mt-2 text-xs">
                          사진을 업로드하면 자동으로 활동 내역을 분석해드려요.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-medium text-emerald-700/80">
                      활동 제목
                    </p>
                    {editingAnalysis ? (
                      <input
                        value={analysis.activity_title}
                        onChange={(e) =>
                          setAnalysis({
                            ...analysis,
                            activity_title: e.target.value,
                          })
                        }
                        className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 focus:border-emerald-400 focus:outline-none"
                      />
                    ) : (
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {analysis.activity_title}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-medium text-emerald-700/80">
                      활동 내역
                    </p>
                    {editingAnalysis ? (
                      <textarea
                        value={analysis.activity_description}
                        onChange={(e) =>
                          setAnalysis({
                            ...analysis,
                            activity_description: e.target.value,
                          })
                        }
                        rows={5}
                        className="mt-1 w-full resize-none rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                      />
                    ) : (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                        {analysis.activity_description}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-700/80">
                      <Tag className="h-2.5 w-2.5" />
                      활동 키워드
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {analysis.keywords.map((k) => (
                        <span
                          key={k}
                          className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Users className="h-3 w-3 text-slate-400" />
                    추정 참여 원아 수{" "}
                    <strong className="text-slate-900">
                      {Math.min(analysis.estimated_children, attendanceCount)}
                    </strong>
                    <span className="text-slate-400"> / </span>
                    <span>오늘 출석 {attendanceCount}</span>
                    <span className="text-slate-400">(명)</span>
                  </div>

                  <div className="rounded-lg bg-white p-2 ring-1 ring-emerald-100">
                    <p className="text-[10px] font-medium text-emerald-700/80">
                      💡 활용 추천
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      {analysis.suggestion}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </section>
      )}

      {/* 사진 분류 — 3-pane 팝업 (좌:원아목록 / 중앙:선택아이 사진+태그 / 우:전체사진) */}
      {showClusterModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-2 sm:items-center sm:p-6"
          onClick={discardClassification}
        >
          {/* 활동 태그 추천 (AI 키워드) */}
          <datalist id={ACTIVITY_DATALIST_ID}>
            {(analysis?.keywords ?? []).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>

          <div
            className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  사진 분류
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  원아를 고르고, 오른쪽 사진을 눌러 그 원아에게 배정하세요. 사진별 활동 태그도 달 수 있어요. 변경은 “분류 완료”를 눌러야 반영됩니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {autoClassifying && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    자동 분류 중…
                  </span>
                )}
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  배정 {draftAssignedCount}/{images.length}장 · 원아 {draftMatchedCount}명
                </span>
                <button
                  type="button"
                  onClick={discardClassification}
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 본문 3구역 */}
            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)_180px]">
              {/* 좌측: 원아 목록 */}
              <div className="min-h-0 overflow-y-auto border-b border-slate-100 p-2 sm:border-b-0 sm:border-r">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">
                  원아 {children.length}명
                </p>
                <ul className="space-y-0.5">
                  {children.map((c) => {
                    const count = draftPhotosForChild(c.id).length;
                    const active = selectedChild?.id === c.id;
                    const dogProfile = getDemoDogProfile(c.name);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedChildId(c.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors",
                            active
                              ? "bg-emerald-600 text-white"
                              : "text-slate-700 hover:bg-slate-100",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {dogProfile ? (
                              // 등록된 프로필 강아지(매칭 기준) 썸네일
                              <span
                                className="h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/40"
                                title={`프로필: ${dogProfile.breed}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={dogProfile.url}
                                  alt={`${c.name} 프로필`}
                                  className="h-full w-full object-cover"
                                />
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                                  active
                                    ? "bg-white/25 text-white"
                                    : c.gender === "F"
                                      ? "bg-rose-100 text-rose-600"
                                      : "bg-emerald-100 text-emerald-700",
                                )}
                              >
                                {c.name.charAt(0)}
                              </span>
                            )}
                            <span className="truncate font-medium">{c.name}</span>
                          </span>
                          {count > 0 && (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 text-[10px] font-bold",
                                active
                                  ? "bg-white/25 text-white"
                                  : "bg-emerald-100 text-emerald-700",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 중앙: 선택 원아의 사진 + 사진별 활동 태그 */}
              <div className="flex min-h-0 flex-col">
                {/* 원아 전환 네비게이션 */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    disabled={selectedIdx <= 0}
                    onClick={() =>
                      selectedIdx > 0 &&
                      setSelectedChildId(children[selectedIdx - 1].id)
                    }
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 enabled:hover:bg-slate-100 disabled:text-slate-300"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    이전 원아
                  </button>
                  <p className="truncate text-sm font-bold text-slate-900">
                    {selectedChild?.name ?? "원아 없음"}
                  </p>
                  <button
                    type="button"
                    disabled={selectedIdx < 0 || selectedIdx >= children.length - 1}
                    onClick={() =>
                      selectedIdx < children.length - 1 &&
                      setSelectedChildId(children[selectedIdx + 1].id)
                    }
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 enabled:hover:bg-slate-100 disabled:text-slate-300"
                  >
                    다음 원아
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto p-3 transition-colors",
                    centerDropActive && "bg-emerald-50 ring-2 ring-inset ring-emerald-300",
                  )}
                  onDragOver={(e) => {
                    if (!selectedChild) return;
                    e.preventDefault();
                    setCenterDropActive(true);
                  }}
                  onDragLeave={() => setCenterDropActive(false)}
                  onDrop={handleCenterDrop}
                >
                  {!selectedChild ? (
                    <p className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-400">
                      등록된 원아가 없어요.
                    </p>
                  ) : draftPhotosForChild(selectedChild.id).length === 0 ? (
                    <p className="rounded-xl bg-slate-50 py-10 text-center text-xs text-slate-400">
                      오른쪽 “전체 사진”에서 사진을 끌어다 놓거나 눌러
                      <br />
                      <strong className="text-slate-600">
                        {selectedChild.name}
                      </strong>{" "}
                      에게 배정하세요.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-3">
                      {draftPhotosForChild(selectedChild.id).map((p) => (
                        <li
                          key={p.id}
                          className="overflow-hidden rounded-xl ring-1 ring-slate-200"
                        >
                          <div className="relative aspect-square w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.dataUrl}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                togglePhotoForChild(p.id, selectedChild.id)
                              }
                              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-500 shadow hover:text-rose-500"
                              aria-label="배정 해제"
                              title="이 원아에서 제외"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1 p-1.5">
                            <Tag className="h-3 w-3 shrink-0 text-slate-400" />
                            <input
                              list={ACTIVITY_DATALIST_ID}
                              value={draftTags[p.id] ?? ""}
                              onChange={(e) =>
                                setActivityTag(p.id, e.target.value)
                              }
                              placeholder="활동 태그"
                              className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-800 focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* 우측: 오늘 올린 전체 사진 (클릭 시 선택 원아에게 배정) */}
              <div className="min-h-0 overflow-y-auto border-t border-slate-100 p-2 sm:border-l sm:border-t-0">
                <p className="px-1 py-1 text-[11px] font-semibold text-slate-500">
                  전체 사진 {images.length}장
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {images.map((p) => (
                    <RightPaneThumb
                      key={p.id}
                      photo={p}
                      assignedChildId={draftAssignments[p.id]}
                      selectedChildId={selectedChild?.id ?? ""}
                      childName={
                        draftAssignments[p.id]
                          ? children.find((c) => c.id === draftAssignments[p.id])
                              ?.name ?? null
                          : null
                      }
                      onClick={() =>
                        selectedChild &&
                        togglePhotoForChild(p.id, selectedChild.id)
                      }
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 하단 네비게이션 — 작업 초기화(좌) / 분류 완료(우) */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3">
              <button
                type="button"
                onClick={resetClassification}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
                title="현재 작업한 분류를 모두 비웁니다"
              >
                작업 초기화
              </button>
              <button
                type="button"
                onClick={commitClassification}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
                분류 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — 원아 활동 기록 */}
      {step === 2 && (
        <>
          {/* 활동 요약 (1단계에서 가져옴) */}
          {analysis && (
            <section className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-200">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-emerald-700/80">
                    오늘의 활동
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {analysis.activity_title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {analysis.keywords.map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                      >
                        {k}
                      </span>
                    ))}
                    <span className="ml-1 text-[11px] text-emerald-700/80">
                      매칭 원아 {matchedChildIds.size}명
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 원아별 한 줄 메모 리스트 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  원아별 활동 한 줄 메모
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  전체 원아의 활동 메모를 한 번에 검토·수정하세요. 빈 칸은 AI 일괄 생성으로 한 번에 채울 수 있어요.
                </p>
              </div>
              <button
                type="button"
                onClick={generateAllSummaries}
                disabled={isPending || !analysis || children.length === 0}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  isPending || !analysis || children.length === 0
                    ? "bg-slate-100 text-slate-400"
                    : "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    일괄 생성 중…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    전체 AI 일괄 생성
                  </>
                )}
              </button>
            </div>

            <p className="mb-3 text-[11px] text-slate-500">
              작성 완료{" "}
              <strong className="text-slate-900">
                {
                  Object.values(savedMemos).filter((v) => v.trim().length > 0)
                    .length
                }
              </strong>{" "}
              / 전체 {children.length}
            </p>

            {children.length === 0 ? (
              <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
                등록된 원아가 없어요.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                {children.map((c) => {
                  const photos = photosForChild(c.id);
                  const value = savedMemos[c.id] ?? "";
                  const filled = value.trim().length > 0;
                  return (
                    <li key={c.id} className="flex gap-3 bg-white px-3 py-3">
                      <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                        <div
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-full text-xs font-bold",
                            c.gender === "F"
                              ? "bg-rose-100 text-rose-600"
                              : "bg-emerald-100 text-emerald-700",
                          )}
                        >
                          {c.name.charAt(0)}
                        </div>
                        <p className="truncate text-[11px] font-semibold text-slate-800">
                          {c.name}
                        </p>
                        {c.privacy_agreed_at === null && (
                          <span
                            className="rounded-sm bg-rose-100 px-1 py-px text-[9px] font-medium text-rose-700"
                            title="개인정보 미동의 — 사진·기록 외부 공유 시 주의"
                          >
                            미동의
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {photos.length > 0 && (
                          <div className="mb-1.5 flex flex-wrap gap-1">
                            {photos.slice(0, 6).map((p) => (
                              <div
                                key={p.id}
                                className="h-9 w-9 overflow-hidden rounded ring-1 ring-slate-200"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.dataUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ))}
                            {photos.length > 6 && (
                              <span className="grid h-9 place-items-center rounded bg-slate-100 px-2 text-[10px] font-medium text-slate-500">
                                +{photos.length - 6}
                              </span>
                            )}
                          </div>
                        )}
                        <textarea
                          value={value}
                          onChange={(e) =>
                            setSavedMemos((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          rows={2}
                          placeholder={
                            photos.length > 0
                              ? `${c.name} 한 줄 메모…`
                              : "수동으로 한 줄 메모 작성"
                          }
                          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                        />
                      </div>
                      <div className="flex w-5 shrink-0 items-start pt-1">
                        {filled && (
                          <Check
                            className="h-4 w-4 text-emerald-600"
                            strokeWidth={3}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* DB 저장 확인 — 원아별로 저장된 사진 다시 불러오기 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  DB 저장 확인
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  오늘 이 반에 저장된 원아별 사진을 DB에서 다시 불러옵니다. (저장이 실제로 됐는지 검증)
                </p>
              </div>
              <button
                type="button"
                onClick={refreshSavedPhotos}
                disabled={loadingSaved || !classroomId}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  loadingSaved || !classroomId
                    ? "bg-slate-100 text-slate-400"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {loadingSaved ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    불러오는 중…
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3.5 w-3.5" />
                    새로고침
                  </>
                )}
              </button>
            </div>

            {!savedLoaded ? (
              <p className="rounded-xl bg-slate-50 py-8 text-center text-xs text-slate-400">
                아직 불러오지 않았어요. 새로고침을 눌러주세요.
              </p>
            ) : Object.keys(savedPhotosByChild).length === 0 ? (
              <p className="rounded-xl bg-slate-50 py-8 text-center text-xs text-slate-400">
                저장된 원아별 사진이 없어요. 1단계에서 사진을 분류·배정한 뒤 “다음 단계”로 저장해 주세요.
              </p>
            ) : (
              <ul className="space-y-3">
                {children
                  .filter((c) => (savedPhotosByChild[c.id]?.length ?? 0) > 0)
                  .map((c) => {
                    const urls = savedPhotosByChild[c.id] ?? [];
                    return (
                      <li key={c.id} className="flex gap-3">
                        <div className="w-16 shrink-0">
                          <p className="truncate text-[11px] font-semibold text-slate-800">
                            {c.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {urls.length}장
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {urls.map((url, i) => (
                            <div
                              key={`${c.id}-${i}`}
                              className="h-12 w-12 overflow-hidden rounded ring-1 ring-emerald-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`${c.name} 저장 사진 ${i + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 단계 네비게이션 */}
      <section className="flex items-center justify-between gap-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => tryGoStep((step - 1) as StepNumber)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            이전 단계
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <div className="flex items-center gap-2">
            {/* 저장하기 — 분석 완료 시 활성, 변경(dirty) 있을 때만 */}
            <button
              type="button"
              onClick={() => void saveToDb()}
              disabled={!analysis || saving || (savedOnce && !dirty)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" strokeWidth={3} />
                  저장하기
                </>
              )}
            </button>
            {/* 다음 단계 — 저장 완료(변경 없음) 후에만 활성. nextStepHref 있으면 별도 라우트로 이동 */}
            <button
              type="button"
              onClick={() => {
                if (nextStepHref) {
                  router.push(nextStepHref);
                  return;
                }
                tryGoStep((step + 1) as StepNumber);
              }}
              disabled={!savedOnce || dirty || saving}
              title={
                !savedOnce || dirty
                  ? "먼저 ‘저장하기’를 눌러 저장해주세요"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
            >
              다음 단계 — {STEP_META[(step + 1) as StepNumber].label}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">마지막 단계</span>
        )}
      </section>

      {/* 하단 안내 */}
      <section className="text-xs text-slate-500">
        <p>
          저장된 원아별 메모는{" "}
          <Link
            href={todayMemoHref}
            className="font-medium text-emerald-600 underline"
          >
            한줄기록
          </Link>
          과 알림장·관찰일지 작성에 자동으로 활용돼요.
        </p>
      </section>

      {/* 페이지 이탈 경고 — 아니오(머무르기, 좌) / 네(나가기, 우·위험) */}
      {showLeaveDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setShowLeaveDialog(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-slate-900">페이지를 나갈까요?</p>
            <p className="mt-1.5 text-xs text-slate-600">
              현재 진행 사항이 초기화될 수 있습니다. 나가겠습니까?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setShowLeaveDialog(false)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 — 하단 중앙 (Adobe/Figma 기본, 푸터 버튼 비가림) */}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {saveToast}
        </div>
      )}
    </div>
  );
}

/**
 * 분류 팝업 우측 "전체 사진" 썸네일.
 * 클릭하면 현재 선택된 원아에게 배정/해제. 배정된 사진은 표시(누구에게).
 */
function RightPaneThumb({
  photo,
  assignedChildId,
  selectedChildId,
  childName,
  onClick,
}: {
  photo: UploadedImage;
  assignedChildId: string | undefined;
  selectedChildId: string;
  childName: string | null;
  onClick: () => void;
}) {
  const assignedToSelected =
    !!assignedChildId && assignedChildId === selectedChildId;
  const assignedToOther =
    !!assignedChildId && assignedChildId !== selectedChildId;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", photo.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onClick}
      title={
        childName
          ? `${childName}에게 배정됨`
          : "끌어다 놓거나 클릭하면 선택한 원아에게 배정"
      }
      className={cn(
        "relative block aspect-square w-full overflow-hidden rounded-lg ring-1 transition-all",
        assignedToSelected
          ? "ring-2 ring-emerald-500 ring-offset-1"
          : assignedToOther
            ? "opacity-60 ring-slate-300"
            : "ring-slate-200 hover:ring-emerald-300",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.dataUrl}
        alt={photo.name}
        className="h-full w-full object-cover"
      />
      {assignedToSelected && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-600 text-white shadow">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      {assignedToOther && childName && (
        <span className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-slate-900/60 px-1 text-[8px] text-white">
          {childName}
        </span>
      )}
    </button>
  );
}
