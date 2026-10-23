import { HifzHistory } from "@/types/student";

// حساب الحفظ السابق: مجموع جميع الأعوام السابقة
export const calculateBaseHifz = (history: HifzHistory, currentYear: number): number => {
  let total = 0;

  // نجمع كل الأعوام التي تسبق العام الحالي
  for (let year = 1441; year < currentYear; year++) {
    const key = `h${year}`;
    const value = parseFloat(history[key]) || 0;
    total += value;
  }

  // الحد الأقصى 30 جزء
  return Math.min(total, 30);
};

// الحفظ السابق للعام المختار = الإجمالي التراكمي للعام السابق.
// نأخذ الأكبر بين مجموع أجزاء الأعوام السابقة والقيمة المستوردة/المحفوظة
// حتى لا تُفقد بيانات الأعوام التي لم تُستورد تفصيلاً.
export const resolveBaseHifz = (
  history: HifzHistory,
  currentYear: number,
  storedBaseHifz?: string | number | null,
): number => {
  const derived = calculateBaseHifz(history || {}, currentYear);
  const stored = parseFloat(String(storedBaseHifz ?? "")) || 0;
  return Math.min(Math.max(derived, stored), 30);
};

/**
 * الحفظ السابق في العام التالي هو إجمالي العام السابق، لا مجموع «الحفظ
 * الجديد» وحده. تُستخدم هذه الدالة في طبقة التخزين والاختبارات حتى لا تختلف
 * نتيجة الترحيل بين صفحات التطبيق.
 */
export const carryTotalHifz = (
  previousTotalHifz: string | number | null | undefined,
  fallbackBaseHifz: string | number | null | undefined = 0,
): number => {
  const previous = parseFloat(String(previousTotalHifz ?? ""));
  const fallback = parseFloat(String(fallbackBaseHifz ?? ""));
  const carried = Number.isFinite(previous) && previous > 0 ? previous : fallback || 0;
  return Math.min(Math.max(carried, 0), 30);
};

/** إجمالي حفظ عام واحد، بحد أقصى 30 جزءاً. */
export const calculateTotalHifz = (
  baseHifz: string | number | null | undefined,
  parts: string | number | null | undefined,
): number => {
  const base = parseFloat(String(baseHifz ?? "")) || 0;
  const newParts = parseFloat(String(parts ?? "")) || 0;
  return Math.min(Math.max(base + newParts, 0), 30);
};

/**
 * يعيد حساب سلسلة أعوام مرتبة زمنياً بعد تغيّر إجمالي العام السابق لها.
 * يحافظ على بقية حقول كل صف ولا ينشئ أعواماً جديدة.
 */
export const propagateTotalHifz = <
  T extends {
    base_hifz: string;
    total_hifz: string;
    parts: string | number | null | undefined;
  },
>(
  rows: T[],
  initialTotalHifz: string | number | null | undefined,
): T[] => {
  let carried = carryTotalHifz(initialTotalHifz, 0);
  return rows.map((row) => {
    const total = calculateTotalHifz(carried, row.parts);
    const next = {
      ...row,
      base_hifz: carried.toString(),
      total_hifz: total.toString(),
    };
    carried = total;
    return next;
  });
};

export const calculateGrade = (totalScore: number): { grade: string; pricePerPart: number } => {
  if (totalScore >= 90) return { grade: "ممتاز", pricePerPart: 2000 };
  if (totalScore >= 80) return { grade: "جيد جداً", pricePerPart: 1500 };
  if (totalScore >= 70) return { grade: "جيد", pricePerPart: 1000 };
  if (totalScore >= 60) return { grade: "مقبول", pricePerPart: 500 };
  if (totalScore > 0) return { grade: "ضعيف", pricePerPart: 0 };
  return { grade: "", pricePerPart: 0 };
};

export const calculatePrize = (parts: number, pricePerPart: number): number => {
  return parts >= 1 ? parts * pricePerPart : 0;
};
