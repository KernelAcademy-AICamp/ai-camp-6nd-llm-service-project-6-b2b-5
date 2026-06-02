"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container mx-auto py-10">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <h2 className="text-lg font-semibold text-destructive">
          한줄기록을(를) 불러오지 못했습니다
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {error.message || "잠시 후 다시 시도해 주세요."}
        </p>
        <Button variant="outline" onClick={reset} className="mt-4">
          다시 시도
        </Button>
      </div>
    </main>
  );
}
