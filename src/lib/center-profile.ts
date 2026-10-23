/**
 * محتوى «التعريف بالمركز والأهداف العامة» — منطق نقي بلا React ولا تخزين.
 *
 * الصفحة الرئيسية (`/`) صارت تحمل بطاقة تعريف بالمركز وأهدافه العامة،
 * يكتبها المستخدم ويحرّرها كما يشاء، ثم يضغط «تثبيت المحتوى» فيُحفظ
 * ويُقفل التحرير حتى يضغط «تحرير» مرة أخرى.
 *
 * كل التطبيع (إزالة الفراغات، حذف الأهداف الفارغة والمكرّرة، الحدود
 * القصوى) هنا — لتُختبر وحدها في Node (`npm run test:offline`)
 * ويبقى المكوّن مسؤولاً عن العرض فقط.
 */

/** الحد الأقصى لطول نص التعريف (حرفاً). */
export const CENTER_INTRO_MAX_LENGTH = 6000;

/** الحد الأقصى لطول الهدف الواحد (حرفاً). */
export const CENTER_OBJECTIVE_MAX_LENGTH = 420;

/** الحد الأقصى لعدد الأهداف العامة. */
export const CENTER_OBJECTIVES_MAX_COUNT = 15;

/** المحتوى المثبَّت كما يُحفظ في إعدادات قاعدة الجهاز. */
export type CenterProfile = {
  /** التعريف بالمركز — نص حرّ متعدد الفقرات. */
  intro: string;
  /** الأهداف العامة بالترتيب الذي كتبه المستخدم. */
  objectives: string[];
  /** وقت آخر تثبيت (ISO) — `null` قبل أول تثبيت. */
  pinned_at: string | null;
};

/** مسودة تحرير غير مثبّتة — تُحفظ تلقائياً حتى لا يضيع المكتوب. */
export type CenterProfileInput = Pick<CenterProfile, "intro" | "objectives">;

export type CenterProfileDraft = CenterProfileInput & {
  /** وقت آخر حفظ تلقائي (ISO). */
  saved_at: string;
};

/** محتوى فارغ (قبل أن يكتب المستخدم أي شيء). */
export const emptyCenterProfile = (): CenterProfile => ({
  intro: "",
  objectives: [],
  pinned_at: null,
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** نص منظّف: توحيد أسطر جديدة، قصّ الأطراف، وتقييد الطول. */
const normalizeText = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
};

/** قائمة أهداف منظّفة: بلا فراغات ولا تكرار، وبالحد الأقصى المسموح. */
export const normalizeObjectives = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const objectives: string[] = [];
  for (const item of value) {
    const text = normalizeText(item, CENTER_OBJECTIVE_MAX_LENGTH);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    objectives.push(text);
    if (objectives.length >= CENTER_OBJECTIVES_MAX_COUNT) break;
  }
  return objectives;
};

/** يحوّل أي قيمة قادمة من التخزين المحلي إلى محتوى صالح للعرض. */
export const normalizeCenterProfile = (value: unknown): CenterProfile => {
  const record = asRecord(value);
  if (!record) return emptyCenterProfile();

  const pinnedAt =
    typeof record.pinned_at === "string" && !Number.isNaN(Date.parse(record.pinned_at))
      ? record.pinned_at
      : null;

  return {
    intro: normalizeText(record.intro, CENTER_INTRO_MAX_LENGTH),
    objectives: normalizeObjectives(record.objectives),
    pinned_at: pinnedAt,
  };
};

/** يتحقق من مسودة محفوظة؛ يعيد `null` إن لم تكن مسودة صالحة. */
export const normalizeCenterProfileDraft = (value: unknown): CenterProfileDraft | null => {
  const record = asRecord(value);
  if (!record) return null;

  const intro = normalizeText(record.intro, CENTER_INTRO_MAX_LENGTH);
  const objectives = normalizeObjectives(record.objectives);
  if (!intro && objectives.length === 0) return null;

  const savedAt =
    typeof record.saved_at === "string" && !Number.isNaN(Date.parse(record.saved_at))
      ? record.saved_at
      : new Date().toISOString();

  return { intro, objectives, saved_at: savedAt };
};

/** هل يحتوي المحتوى شيئاً يستحق التثبيت؟ */
export const hasCenterProfileContent = (value: CenterProfileInput): boolean =>
  normalizeText(value.intro, CENTER_INTRO_MAX_LENGTH).length > 0 ||
  normalizeObjectives(value.objectives).length > 0;

/** مقارنة نصية/ترتيبية بين المسودة المحفوظة والمحتوى المثبَّت. */
export const draftDiffersFromProfile = (
  draft: CenterProfileInput,
  profile: CenterProfileInput,
): boolean => {
  const draftObjectives = normalizeObjectives(draft.objectives);
  const profileObjectives = normalizeObjectives(profile.objectives);
  if (normalizeText(draft.intro, CENTER_INTRO_MAX_LENGTH) !== profile.intro.trim()) return true;
  if (draftObjectives.length !== profileObjectives.length) return true;
  return draftObjectives.some((objective, index) => objective !== profileObjectives[index]);
};

/**
 * الأهداف كنص مرقّم جاهز للّصق في واتساب أو مستند أو بريد:
 *
 * ```
 * 1. الهدف الأول
 * 2. الهدف الثاني
 * ```
 *
 * الترقيم لاتيني (1، 2، 3) لأنه الأكثر توافقاً مع التطبيقات الخارجية،
 * والقائمة تمرّ على نفس التطبيع (بلا فراغات أو تكرار) قبل الصياغة.
 */
export const formatObjectivesList = (objectives: string[]): string =>
  normalizeObjectives(objectives)
    .map((objective, index) => `${index + 1}. ${objective}`)
    .join("\n");

/** نص البطاقة كاملاً (تعريف + أهداف) جاهزاً للنسخ. */
export const formatCenterProfileText = (profile: CenterProfileInput): string => {
  const intro = normalizeText(profile.intro, CENTER_INTRO_MAX_LENGTH);
  const objectives = formatObjectivesList(profile.objectives);
  return [intro, objectives].filter(Boolean).join("\n\n");
};

/** صياغة عربية قصيرة لوقت التثبيت أو حفظ المسودة. */
export const formatCenterProfileTime = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
