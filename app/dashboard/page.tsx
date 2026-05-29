import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChildRow, ClassroomRow } from "@/types";

export const dynamic = "force-dynamic";

function statusBadge(status: ChildRow["status"]) {
  if (status === "active") return <Badge variant="success">재원중</Badge>;
  if (status === "inactive") return <Badge variant="warning">퇴소</Badge>;
  return <Badge variant="secondary">졸업</Badge>;
}

function ageFromBirth(birth: string) {
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export default async function DashboardPage() {
  const supabase = createAdminClient();

  const [
    { data: kinder },
    { data: classrooms },
    { data: children },
    { count: profileCount },
    { count: staffCount },
  ] = await Promise.all([
    supabase.from("kindergartens").select("*").limit(1).single(),
    supabase.from("classrooms").select("*").order("age_group", { ascending: false }),
    supabase.from("children").select("*").order("name"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("staff_classrooms").select("*", { count: "exact", head: true }),
  ]);

  const activeCount = (children ?? []).filter((c: ChildRow) => c.status === "active").length;
  const childrenByClass = new Map<string, ChildRow[]>();
  (children ?? []).forEach((c: ChildRow) => {
    const arr = childrenByClass.get(c.classroom_id) ?? [];
    arr.push(c);
    childrenByClass.set(c.classroom_id, arr);
  });

  return (
    <main className="container mx-auto py-10 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {kinder?.name ?? "유치원"} 대시보드
          </h1>
          <p className="text-muted-foreground mt-1">
            {kinder?.director_name && `원장: ${kinder.director_name} · `}
            {kinder?.address}
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">홈으로</Button>
        </Link>
      </div>

      {/* 통계 카드 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="전체 원아" value={children?.length ?? 0} />
        <StatCard label="재원중" value={activeCount} accent />
        <StatCard label="반" value={classrooms?.length ?? 0} />
        <StatCard label="교직원 배정" value={staffCount ?? 0} suffix="건" />
      </section>

      {/* 사용자 수 정보 */}
      <p className="text-sm text-muted-foreground">
        등록된 사용자: <span className="font-semibold text-foreground">{profileCount ?? 0}명</span>
        <span className="ml-3">(원장 / 교사 / 학부모 / 관리자 포함)</span>
      </p>

      {/* 반별 원아 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">반별 원아 명단</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(classrooms ?? []).map((cls: ClassroomRow) => {
            const list = childrenByClass.get(cls.id) ?? [];
            return (
              <Card key={cls.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{cls.name}</CardTitle>
                    <Badge variant="outline">
                      {cls.age_group != null ? `만 ${cls.age_group}세` : "연령 미지정"}
                    </Badge>
                  </div>
                  <CardDescription>
                    정원 {cls.capacity ?? "-"}명 · 현재 {list.length}명
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">등록된 원아 없음</p>
                  ) : (
                    <ul className="divide-y">
                      {list.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground text-xs">
                              {ageFromBirth(c.birth_date)}세
                              {c.gender === "M" && " · 남"}
                              {c.gender === "F" && " · 여"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.privacy_agreed_at === null && (
                              <Badge variant="destructive">개인정보 미동의</Badge>
                            )}
                            {statusBadge(c.status)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  suffix = "명",
  accent = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${accent ? "text-emerald-600" : ""}`}>
          {value}
          <span className="text-base font-normal text-muted-foreground ml-1">{suffix}</span>
        </p>
      </CardContent>
    </Card>
  );
}
