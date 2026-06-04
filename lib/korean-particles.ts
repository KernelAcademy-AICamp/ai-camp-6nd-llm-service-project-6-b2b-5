/**
 * 한글 마지막 음절의 종성(받침) 여부 판정.
 * 한글 음절 = 0xAC00 + (초성 × 588) + (중성 × 28) + 종성.
 * (codePoint - 0xAC00) % 28 !== 0 → 종성 있음.
 */
export function hasJongseong(name: string): boolean {
  const lastChar = name.trim().slice(-1);
  if (!lastChar) return false;
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false; // 한글 음절 범위 아님
  return (code - 0xac00) % 28 !== 0;
}

/**
 * AI가 반환한 텍스트의 `{이름}은(는)`, `{이름}이(가)`, `{이름}` 자리표시자를
 * 실제 이름 + 적절한 조사로 치환.
 *
 * 처리 순서: 긴 패턴(은/는 + 이/가) 먼저 → 단독 {이름} 마지막.
 */
export function applyChildName(text: string, name: string): string {
  if (!text || !name) return text;
  const trimmed = name.trim();
  const eunNeun = hasJongseong(trimmed) ? "은" : "는";
  const iGa = hasJongseong(trimmed) ? "이" : "가";
  return text
    .replaceAll("{이름}은(는)", `${trimmed}${eunNeun}`)
    .replaceAll("{이름}는(은)", `${trimmed}${eunNeun}`)
    .replaceAll("{이름}이(가)", `${trimmed}${iGa}`)
    .replaceAll("{이름}가(이)", `${trimmed}${iGa}`)
    .replaceAll("{이름}", trimmed);
}
