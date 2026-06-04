"use client";

import Link from "next/link";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return (
    <main className="container mx-auto max-w-2xl pt-16 text-center">
      <p className="text-sm font-semibold text-slate-700">알림장을 불러오지 못했어요.</p>
      <p className="mt-1 text-xs text-slate-500">{error.message}</p>
      <Link
        href="/dashboard/notes"
        className="mt-6 inline-block rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
      >
        목록으로
      </Link>
    </main>
  );
}
