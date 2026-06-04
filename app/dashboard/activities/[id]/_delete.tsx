"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteActivityAction } from "../new/actions";

export function DeleteActivityButton({
  sessionId,
  childId,
  backHref,
  label,
}: {
  sessionId: string;
  childId?: string | null;
  backHref: string;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteActivityAction({ sessionId, childId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(backHref);
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        삭제
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <span className="text-xs text-muted-foreground">{label} 삭제할까요?</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        취소
      </Button>
      <Button
        size="sm"
        onClick={onDelete}
        disabled={pending}
        className="bg-rose-600 text-white hover:bg-rose-700"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "삭제"}
      </Button>
    </div>
  );
}
