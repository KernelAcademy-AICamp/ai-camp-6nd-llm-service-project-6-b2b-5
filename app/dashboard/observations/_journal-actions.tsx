"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, X, Check } from "lucide-react";
import {
  deleteObservationAction,
  updateObservationMetaAction,
} from "./_actions";

type ChildOpt = { id: string; name: string };

export function JournalActions({
  id,
  date,
  childId,
  children,
}: {
  id: string;
  date: string;
  childId: string;
  children: ChildOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "menu" | "edit" | "delete">(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editChild, setEditChild] = useState(childId);
  const [editDate, setEditDate] = useState(date);

  function close() {
    setOpen(null);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateObservationMetaAction({
        id,
        childId: editChild,
        date: editDate,
      });
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteObservationAction({ id });
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="relative"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(open === "menu" ? null : "menu");
        }}
        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="더보기"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open === "menu" && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(null)}
            aria-hidden
          />
          <div className="absolute right-0 top-9 z-40 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => setOpen("edit")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              편집
            </button>
            <button
              type="button"
              onClick={() => setOpen("delete")}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          </div>
        </>
      )}

      {open === "edit" && (
        <Modal title="관찰기록 편집" onClose={close}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                원아
              </label>
              <select
                value={editChild}
                onChange={(e) => setEditChild(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none"
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                날짜
              </label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none"
              />
            </div>
            {error && (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-300"
              >
                <Check className="h-3.5 w-3.5" />
                저장
              </button>
            </div>
          </div>
        </Modal>
      )}

      {open === "delete" && (
        <Modal title="관찰기록 삭제" onClose={close}>
          <p className="text-sm text-slate-700">
            이 관찰기록을 삭제할까요? <strong className="text-rose-600">되돌릴 수 없습니다.</strong>
          </p>
          {error && (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700 disabled:bg-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
