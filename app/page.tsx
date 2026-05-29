import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">
        안녕하세요, 5팀입니다
      </h1>
      <p className="text-muted-foreground">
        Next.js + TypeScript + Tailwind + shadcn/ui + Supabase
      </p>
      <div className="flex gap-2">
        <Link href="/dashboard">
          <Button>대시보드 보기</Button>
        </Link>
      </div>
    </main>
  );
}
