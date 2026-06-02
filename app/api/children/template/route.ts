import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "햇님 유치원";
    wb.created = new Date();

    // 1. 기본 정보 시트
    const basic = wb.addWorksheet("기본정보");
    basic.columns = [
      { header: "이름 *", key: "name", width: 14 },
      { header: "생년월일 (YYYY-MM-DD) *", key: "birth_date", width: 22 },
      { header: "성별 (M/F)", key: "gender", width: 10 },
      { header: "주소", key: "address", width: 32 },
      { header: "반 이름", key: "classroom", width: 14 },
      { header: "등원일 (YYYY-MM-DD)", key: "enrolled_at", width: 22 },
      { header: "학부모명", key: "guardian_name", width: 14 },
      { header: "학부모 전화번호", key: "guardian_phone", width: 20 },
      { header: "개인정보 동의 (Y/N)", key: "privacy", width: 20 },
      { header: "응급 메모", key: "emergency_memo", width: 32 },
    ];
    basic.getRow(1).font = { bold: true };
    basic.addRow({}); // 빈 입력행

    // 2. 알레르기 시트
    const allergies = wb.addWorksheet("알레르기");
    allergies.columns = [
      { header: "알레르기", key: "allergen", width: 18 },
      { header: "반응", key: "reaction", width: 24 },
      { header: "심각도 (mild/moderate/severe)", key: "severity", width: 28 },
      { header: "메모", key: "note", width: 32 },
    ];
    allergies.getRow(1).font = { bold: true };
    allergies.addRow({});

    // 3. 기저질환 시트
    const conditions = wb.addWorksheet("기저질환");
    conditions.columns = [
      { header: "질환명", key: "name", width: 20 },
      { header: "설명", key: "description", width: 32 },
      { header: "메모", key: "note", width: 32 },
    ];
    conditions.getRow(1).font = { bold: true };
    conditions.addRow({});

    // 4. 복용약 시트
    const meds = wb.addWorksheet("복용약");
    meds.columns = [
      { header: "약명", key: "name", width: 18 },
      { header: "용량", key: "dosage", width: 14 },
      { header: "복용 빈도", key: "frequency", width: 18 },
      { header: "시작일 (YYYY-MM-DD)", key: "start_date", width: 22 },
      { header: "종료일 (YYYY-MM-DD)", key: "end_date", width: 22 },
    ];
    meds.getRow(1).font = { bold: true };
    meds.addRow({});

    // 5. 예방접종 시트
    const vacc = wb.addWorksheet("예방접종");
    vacc.columns = [
      { header: "백신명", key: "vaccine_name", width: 22 },
      { header: "접종일 (YYYY-MM-DD)", key: "vaccinated_at", width: 22 },
      { header: "다음 접종 예정 (YYYY-MM-DD)", key: "next_due_at", width: 28 },
    ];
    vacc.getRow(1).font = { bold: true };
    vacc.addRow({});

    const buf = await wb.xlsx.writeBuffer();

    const fileName = "원아등록폼.xlsx";
    const encoded = encodeURIComponent(fileName);
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="children-template.xlsx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "엑셀 생성 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
