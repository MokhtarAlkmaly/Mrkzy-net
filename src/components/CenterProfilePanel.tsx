/**
 * بطاقة «التعريف بالمركز والأهداف العامة» — المحتوى التحريري للصفحة الرئيسية.
 *
 * التصميم من ثلاث حالات:
 *  1. قراءة: تنسيق نهائي أنيق للتعريف والأهداف بعد التثبيت.
 *  2. تحرير: حقول مفتوحة (تعريف + أهداف قابلة للإضافة والترتيب والحذف).
 *  3. مسودة: كل ما يُكتب يُحفظ تلقائياً كمسودة محلية حتى يضغط المستخدم
 *     «تثبيت المحتوى»؛ عندها فقط يُعتمد المحتوى ويُقفل التحرير.
 *
 * المحتوى نفسه يُخزَّن عبر `storage.ts` داخل قاعدة الجهاز المحلية،
 * والمنطق النقي في `lib/center-profile.ts`.
 */

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Copy,
  FileText,
  Landmark,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Quote,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  CENTER_INTRO_MAX_LENGTH,
  CENTER_OBJECTIVES_MAX_COUNT,
  CENTER_OBJECTIVE_MAX_LENGTH,
  draftDiffersFromProfile,
  emptyCenterProfile,
  formatCenterProfileText,
  formatCenterProfileTime,
  formatObjectivesList,
  hasCenterProfileContent,
  type CenterProfile,
  type CenterProfileDraft,
} from "@/lib/center-profile";
import {
  clearCenterProfileDraft,
  loadCenterProfile,
  loadCenterProfileDraft,
  saveCenterProfile,
  saveCenterProfileDraft,
} from "@/utils/storage";
import { cn } from "@/lib/utils";

/** عدّ عربي سليم لعدد الأهداف. */
const objectivesLabel = (count: number) => {
  if (count === 1) return "هدف واحد";
  if (count === 2) return "هدفان";
  if (count >= 3 && count <= 10) return `${count} أهداف`;
  return `${count} هدفاً`;
};

/**
 * نسخ نص إلى الحافظة. `navigator.clipboard` يحتاج سياقاً آمناً وصلاحية،
 * وإلا نرجع إلى حقل مؤقت + `execCommand` كما تفعل المكتبات الشائعة.
 */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // المتصفح رفض الطلب — نجرّب الطريقة اليدوية أدناه.
    }
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("clipboard-unavailable");
  } finally {
    document.body.removeChild(field);
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "حدث خطأ غير متوقع — حاول مرة أخرى.";

/**
 * حقل نصّي يكبر مع الكتابة. الأهداف قد تطول، والقائمة ثابتة الارتفاع
 * تجعل التحرير على الجوال متعباً.
 */
function AutoGrowTextarea({
  value,
  className,
  ...props
}: ComponentProps<typeof Textarea> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return <Textarea ref={ref} value={value} className={className} {...props} />;
}

export function CenterProfilePanel() {
  const { toast } = useToast();
  const { viewAs } = useAuth();
  const readOnly = Boolean(viewAs);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CenterProfile>(emptyCenterProfile);
  const [draft, setDraft] = useState<CenterProfileDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ intro: "", objectives: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasContent = hasCenterProfileContent(profile);
  const canPin = hasCenterProfileContent(form);
  const objectiveCount = useMemo(
    () => form.objectives.filter((objective) => objective.trim()).length,
    [form.objectives],
  );

  // عدّاد التعريف: الشريط يمتنع عند الحد الأقصى، والتنبيه يظهر في آخر 10%.
  const introLength = form.intro.length;
  const introRemaining = Math.max(0, CENTER_INTRO_MAX_LENGTH - introLength);
  const introPercent = Math.min(100, Math.round((introLength / CENTER_INTRO_MAX_LENGTH) * 100));
  const introNearLimit = introLength >= CENTER_INTRO_MAX_LENGTH * 0.9;

  // ---------- التحميل ----------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [loadedProfile, loadedDraft] = await Promise.all([
          loadCenterProfile(),
          loadCenterProfileDraft().catch(() => null),
        ]);
        if (cancelled) return;

        setProfile(loadedProfile);
        setDraft(
          loadedDraft && draftDiffersFromProfile(loadedDraft, loadedProfile) ? loadedDraft : null,
        );
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "تعذّر تحميل التعريف بالمركز",
          description: errorMessage(error),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  // ---------- نسخ المحتوى ----------
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async (kind: "intro" | "objectives" | "all") => {
    const text =
      kind === "intro"
        ? profile.intro
        : kind === "objectives"
          ? formatObjectivesList(profile.objectives)
          : formatCenterProfileText(profile);

    if (!text.trim()) return;

    try {
      await copyToClipboard(text);
      setCopied(true);
      toast({
        title:
          kind === "intro"
            ? "تم نسخ التعريف"
            : kind === "objectives"
              ? "تم نسخ الأهداف"
              : "تم نسخ التعريف والأهداف",
        description: "النص جاهز للّصق في واتساب أو مستند أو بريد.",
      });
    } catch {
      toast({
        title: "تعذّر النسخ",
        description: "حدّد النص يدوياً من البطاقة وانسخه.",
        variant: "destructive",
      });
    }
  };

  // ---------- حفظ المسودة تلقائياً ----------
  useEffect(() => {
    if (!editing) return;

    const timer = window.setTimeout(() => {
      const input = { intro: form.intro, objectives: form.objectives };
      const shouldKeepDraft =
        hasCenterProfileContent(input) && draftDiffersFromProfile(input, profile);

      if (!shouldKeepDraft) {
        // لا مسودة مفيدة: إما أن الحقول فارغة أو أن المكتوب مطابق للمثبَّت.
        void clearCenterProfileDraft().catch(() => undefined);
        setDraftSavedAt(null);
        return;
      }

      const savedAt = new Date().toISOString();
      void saveCenterProfileDraft({ ...input, saved_at: savedAt })
        .then(() => setDraftSavedAt(savedAt))
        .catch(() => undefined);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [editing, form, profile]);

  // ---------- الانتقال إلى التحرير ----------
  const startEditing = (fromStoredDraft = true) => {
    if (readOnly) return;
    const source = fromStoredDraft && draft ? draft : profile;
    setForm({
      intro: source.intro,
      objectives: source.objectives.length > 0 ? [...source.objectives] : [""],
    });
    setDraftSavedAt(fromStoredDraft && draft ? draft.saved_at : null);
    setCancelConfirm(false);
    setEditing(true);
  };

  const discardDraft = () => {
    setDraft(null);
    setDraftSavedAt(null);
    void clearCenterProfileDraft().catch(() => undefined);
  };

  // ---------- تحرير الأهداف ----------
  const updateObjective = (index: number, value: string) => {
    setForm((previous) => ({
      ...previous,
      objectives: previous.objectives.map((objective, itemIndex) =>
        itemIndex === index ? value : objective,
      ),
    }));
  };

  const addObjective = () => {
    if (form.objectives.length >= CENTER_OBJECTIVES_MAX_COUNT) {
      toast({
        title: "بلغت الحد الأقصى للأهداف",
        description: `يمكن كتابة ${CENTER_OBJECTIVES_MAX_COUNT} هدفاً عاماً كحد أقصى.`,
        variant: "destructive",
      });
      return;
    }
    setForm((previous) => ({ ...previous, objectives: [...previous.objectives, ""] }));
  };

  const removeObjective = (index: number) => {
    setForm((previous) => ({
      ...previous,
      objectives: previous.objectives.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const moveObjective = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    setForm((previous) => {
      if (target < 0 || target >= previous.objectives.length) return previous;
      const objectives = [...previous.objectives];
      [objectives[index], objectives[target]] = [objectives[target], objectives[index]];
      return { ...previous, objectives };
    });
  };

  // ---------- الإلغاء ----------
  const hasUnsavedChanges = draftDiffersFromProfile(form, profile);

  const requestCancel = () => {
    if (!hasUnsavedChanges) {
      void discardChanges();
      return;
    }
    setCancelConfirm(true);
  };

  const discardChanges = async () => {
    setEditing(false);
    setCancelConfirm(false);
    setDraftSavedAt(null);
    setDraft(null);
    await clearCenterProfileDraft().catch(() => undefined);
  };

  // ---------- التثبيت ----------
  const handlePin = async () => {
    if (readOnly || saving) return;

    if (!hasCenterProfileContent(form)) {
      toast({
        title: "لا يوجد محتوى لتثبيته",
        description: "اكتب التعريف بالمركز أو هدفاً واحداً على الأقل، ثم أعد المحاولة.",
        variant: "destructive",
      });
      return;
    }

    const cleanedObjectives = form.objectives.map((objective) => objective.trim()).filter(Boolean);
    if (new Set(cleanedObjectives).size !== cleanedObjectives.length) {
      toast({
        title: "هناك أهداف مكررة",
        description: "احذف الأهداف المكررة قبل التثبيت حتى تظهر القائمة بلا تكرار.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const result = await saveCenterProfile({ intro: form.intro, objectives: form.objectives });
      setProfile(result.profile);
      setDraft(null);
      setDraftSavedAt(null);
      setEditing(false);
      setCancelConfirm(false);
      await clearCenterProfileDraft().catch(() => undefined);

      toast({
        title: "تم تثبيت التعريف والأهداف",
        description: "حُفظ المحتوى داخل MrkzyDatabase على هذا الجهاز.",
      });
    } catch (error) {
      toast({
        title: "تعذّر تثبيت المحتوى",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section
        aria-busy="true"
        aria-label="جارٍ تحميل التعريف بالمركز"
        className="rounded-[1.75rem] border border-white/70 bg-card/90 p-4 shadow-lg shadow-emerald-950/5 sm:p-5"
      >
        <div className="flex animate-pulse items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-muted" />
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-5 w-56 rounded bg-muted" />
          </div>
        </div>
        <div className="mt-5 animate-pulse space-y-2.5">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-11/12 rounded bg-muted" />
          <div className="h-4 w-4/5 rounded bg-muted" />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="center-profile-title">
      <article className="relative rounded-[1.75rem] border border-white/70 bg-card/95 shadow-xl shadow-emerald-950/5 backdrop-blur">
        {/* شريط علوي زمردي/ذهبي يعطي البطاقة طابع «الوثيقة الرسمية» */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1.5 rounded-t-[1.75rem] bg-gradient-to-l from-emerald-800 via-emerald-500 to-amber-400"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-[1.75rem] border-b border-emerald-900/10 bg-gradient-to-l from-emerald-950/[0.04] via-transparent to-amber-100/30 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-950 text-amber-300 shadow-lg shadow-emerald-950/20 ring-1 ring-white/20">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                بطاقة المركز
              </p>
              <h2
                id="center-profile-title"
                className="truncate text-base font-black tracking-tight text-foreground sm:text-xl"
              >
                التعريف بالمركز والأهداف العامة
              </h2>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto sm:gap-2">
            {!editing && hasContent && (
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-700/10 dark:text-emerald-100 dark:hover:bg-emerald-700/25"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    نسخ
                    <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {profile.intro && (
                    <DropdownMenuItem
                      onSelect={() => void handleCopy("intro")}
                      className="gap-2 text-xs font-bold"
                    >
                      <Quote className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                      نسخ التعريف
                    </DropdownMenuItem>
                  )}
                  {profile.objectives.length > 0 && (
                    <DropdownMenuItem
                      onSelect={() => void handleCopy("objectives")}
                      className="gap-2 text-xs font-bold"
                    >
                      <Target className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                      نسخ الأهداف
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => void handleCopy("all")}
                    className="gap-2 text-xs font-bold"
                  >
                    <FileText className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                    نسخ التعريف والأهداف
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {editing ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-300">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                وضع التحرير
              </span>
            ) : readOnly ? (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-muted-foreground ring-1 ring-border">
                قراءة فقط
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => startEditing()}
                className="rounded-full border-emerald-700/25 bg-white/80 font-black text-emerald-900 shadow-sm hover:bg-emerald-700 hover:text-white dark:bg-transparent dark:text-emerald-100 dark:hover:bg-emerald-700"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                {hasContent ? "تحرير" : "كتابة التعريف"}
              </Button>
            )}
          </div>
        </div>

        {/* مسودة محفوظة من جلسة سابقة */}
        {!editing && !readOnly && draft && (
          <div className="mx-4 mt-4 flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-50 px-3.5 py-2.5 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-500/10 dark:text-amber-100">
            <p className="flex items-start gap-2 text-xs font-semibold leading-6">
              <FileText className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              لديك مسودة غير مثبتة حُفظت {formatCenterProfileTime(draft.saved_at)}. تابع الكتابة أو
              تجاهلها.
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startEditing(true)}
                className="h-7 rounded-full border-amber-500/40 bg-white/80 px-3 text-[11px] font-black text-amber-900 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20"
              >
                متابعة التحرير
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={discardDraft}
                className="h-7 rounded-full px-2 text-[11px] font-bold text-amber-900/70 hover:bg-amber-100 hover:text-amber-950 dark:text-amber-200/80 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
              >
                تجاهل
              </Button>
            </div>
          </div>
        )}

        {editing ? (
          /* ==================== وضع التحرير ==================== */
          <div className="px-4 py-5 sm:px-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label
                  htmlFor="center-profile-intro"
                  className="text-sm font-black text-foreground"
                >
                  التعريف بالمركز
                </label>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-1 w-14 overflow-hidden rounded-full bg-emerald-900/10 dark:bg-white/10"
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full transition-[width] duration-300",
                        introNearLimit ? "bg-amber-500" : "bg-emerald-600",
                      )}
                      style={{ width: `${introPercent}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      introNearLimit
                        ? "font-bold text-amber-700 dark:text-amber-300"
                        : "text-muted-foreground",
                    )}
                  >
                    {form.intro.length.toLocaleString("ar-EG")} /{" "}
                    {CENTER_INTRO_MAX_LENGTH.toLocaleString("ar-EG")} حرف
                  </span>
                  {introNearLimit && (
                    <span className="text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">
                      · المتبقي {introRemaining.toLocaleString("ar-EG")} حرف
                    </span>
                  )}
                </div>
              </div>
              <AutoGrowTextarea
                id="center-profile-intro"
                value={form.intro}
                maxLength={CENTER_INTRO_MAX_LENGTH}
                rows={6}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, intro: event.target.value }))
                }
                placeholder="اكتب هنا التعريف بالمركز: النشأة، الرسالة، مجالات العمل، والفئات المستفيدة…"
                className="max-h-[55vh] min-h-[150px] overflow-y-auto rounded-2xl border-emerald-900/15 bg-[#fffdf7] px-4 py-3 text-[15px] leading-8 shadow-sm placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-emerald-700/30 dark:bg-emerald-950/25"
              />
              <p className="text-[11px] leading-6 text-muted-foreground">
                يمكنك الكتابة على عدة أسطر؛ تظهر الفواصل كما كتبتها في العرض النهائي.
              </p>
            </div>

            <div className="mt-6 space-y-3 border-t border-dashed border-emerald-900/15 pt-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-foreground">الأهداف العامة للمركز</h3>
                  <p className="text-[11px] leading-6 text-muted-foreground">
                    اكتب كل هدف في حقل مستقل، ويمكنك إعادة ترتيبها بالأسهم.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addObjective}
                  disabled={form.objectives.length >= CENTER_OBJECTIVES_MAX_COUNT}
                  className="h-8 rounded-full border-emerald-700/25 font-bold text-emerald-900 hover:bg-emerald-700 hover:text-white dark:text-emerald-100 dark:hover:bg-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  إضافة هدف
                </Button>
              </div>

              {form.objectives.length === 0 ? (
                <button
                  type="button"
                  onClick={addObjective}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-emerald-700/25 bg-emerald-50/40 px-4 py-6 text-xs font-bold text-emerald-800 transition hover:border-emerald-700/40 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-emerald-950/20 dark:text-emerald-200"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  أضف الهدف الأول
                </button>
              ) : (
                <ul className="space-y-2">
                  {form.objectives.map((objective, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 rounded-2xl border border-emerald-900/10 bg-white/75 p-2 shadow-sm transition focus-within:border-emerald-700/30 focus-within:ring-2 focus-within:ring-emerald-700/10 dark:bg-emerald-950/25"
                    >
                      <span className="mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-emerald-800 text-[11px] font-black text-amber-200">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <AutoGrowTextarea
                          value={objective}
                          maxLength={CENTER_OBJECTIVE_MAX_LENGTH}
                          rows={1}
                          aria-label={`الهدف ${index + 1}`}
                          placeholder={`اكتب الهدف ${index + 1}…`}
                          onChange={(event) => updateObjective(index, event.target.value)}
                          className="min-h-[44px] w-full resize-none rounded-xl border-transparent bg-transparent px-2 py-2 text-sm leading-7 shadow-none focus-visible:ring-1 focus-visible:ring-emerald-700/25"
                        />
                        {objective.length >= CENTER_OBJECTIVE_MAX_LENGTH * 0.85 && (
                          <p className="px-2 pb-1.5 text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">
                            {objective.length.toLocaleString("ar-EG")} /{" "}
                            {CENTER_OBJECTIVE_MAX_LENGTH.toLocaleString("ar-EG")} حرف
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveObjective(index, -1)}
                          disabled={index === 0}
                          aria-label="نقل الهدف للأعلى"
                          className="h-7 w-7 rounded-md text-muted-foreground hover:text-emerald-800"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveObjective(index, 1)}
                          disabled={index === form.objectives.length - 1}
                          aria-label="نقل الهدف للأسفل"
                          className="h-7 w-7 rounded-md text-muted-foreground hover:text-emerald-800"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeObjective(index)}
                          aria-label="حذف الهدف"
                          className="h-7 w-7 rounded-md text-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/15"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {objectiveCount > 0 ? objectivesLabel(objectiveCount) : "لا أهداف مكتوبة بعد"} ·{" "}
                الحد الأقصى {CENTER_OBJECTIVES_MAX_COUNT.toLocaleString("ar-EG")} هدفاً
              </p>
            </div>

            <div className="mt-5 rounded-2xl bg-secondary/45 p-3 text-[11px] leading-6 text-muted-foreground ring-1 ring-border/60">
              <p className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                تُحفظ كتابتك تلقائياً كمسودة على هذا الجهاز حتى تضغط «تثبيت المحتوى»؛ عندها يُعتمد
                المحتوى ويُقفل التحرير، ويمكنك فتحه مجدداً بزر «تحرير».
              </p>
            </div>

            {/* شريط الإجراءات: تثبيت المحتوى أو إلغاء التحرير */}
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-900/15 bg-white/95 p-3 shadow-xl shadow-emerald-950/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:bg-emerald-950/90">
              <p
                aria-live="polite"
                className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                {draftSavedAt ? (
                  <>
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                    <span className="truncate">
                      حُفظت المسودة {formatCenterProfileTime(draftSavedAt)}
                    </span>
                  </>
                ) : (
                  <>
                    <Clock
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">تُحفظ المسودة تلقائياً أثناء الكتابة</span>
                  </>
                )}
              </p>

              {cancelConfirm ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span className="text-[11px] font-bold text-rose-700">
                    تجاهل كل التعديلات غير المثبتة؟
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void discardChanges()}
                    className="h-8 rounded-full px-3 text-[11px] font-black"
                  >
                    تجاهل التعديلات
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelConfirm(false)}
                    className="h-8 rounded-full px-2 text-[11px]"
                  >
                    متابعة التحرير
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={requestCancel}
                    disabled={saving}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handlePin()}
                    disabled={saving || !canPin}
                    className="h-9 rounded-full bg-gradient-to-l from-emerald-800 to-teal-700 px-4 text-xs font-black text-white shadow-lg shadow-emerald-900/25 hover:from-emerald-700 hover:to-teal-600"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Pin className="h-4 w-4" aria-hidden="true" />
                    )}
                    {saving ? "جارٍ التثبيت…" : "تثبيت المحتوى"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : hasContent ? (
          /* ==================== وضع القراءة ==================== */
          <>
            <div className="px-4 py-5 sm:px-6">
              {profile.intro && (
                <div className="relative overflow-hidden rounded-2xl border border-emerald-900/10 bg-[linear-gradient(135deg,#fffdf8_0%,#f4f9f5_100%)] p-5 sm:p-6 dark:bg-none dark:bg-emerald-950/20">
                  <Quote
                    aria-hidden="true"
                    className="absolute -left-1 -top-1 h-14 w-14 -scale-x-100 text-amber-400/20"
                  />
                  <p className="relative whitespace-pre-line text-[15px] leading-9 text-foreground/90 sm:text-base sm:leading-10">
                    {profile.intro}
                  </p>
                </div>
              )}

              {profile.objectives.length > 0 && (
                <div className={cn(profile.intro && "mt-6")}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-gradient-to-l from-emerald-900/20 to-transparent" />
                    <h3 className="inline-flex shrink-0 items-center gap-1.5 text-sm font-black text-emerald-900 dark:text-emerald-200">
                      <Target className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      الأهداف العامة للمركز
                    </h3>
                    <span className="h-px flex-1 bg-gradient-to-r from-emerald-900/20 to-transparent" />
                  </div>

                  <ol className="grid gap-2.5 sm:grid-cols-2">
                    {profile.objectives.map((objective, index) => (
                      <li
                        key={objective}
                        className="flex items-start gap-3 rounded-2xl border border-emerald-900/10 bg-white/70 p-3.5 shadow-sm dark:bg-emerald-950/25"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-800 to-teal-900 text-[11px] font-black text-amber-200 shadow-sm ring-1 ring-white/20">
                          {index + 1}
                        </span>
                        <p className="whitespace-pre-line text-sm leading-7 text-foreground/85">
                          {objective}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 rounded-b-[1.75rem] border-t border-emerald-900/10 bg-secondary/30 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
              <span className="inline-flex items-center gap-1.5">
                <Pin className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                المحتوى مثبّت
                {profile.pinned_at
                  ? ` · آخر تثبيت ${formatCenterProfileTime(profile.pinned_at)}`
                  : ""}
              </span>
              {profile.objectives.length > 0 && (
                <span>{objectivesLabel(profile.objectives.length)}</span>
              )}
            </footer>
          </>
        ) : (
          /* ==================== لا محتوى بعد ==================== */
          <div className="px-4 py-5 sm:px-6">
            <div className="rounded-3xl border border-dashed border-emerald-700/25 bg-emerald-50/50 px-5 py-10 text-center dark:bg-emerald-950/20">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-900/10 dark:bg-emerald-950 dark:text-amber-300">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-3 text-base font-black text-foreground">
                لم يُكتب التعريف بالمركز بعد
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-muted-foreground">
                {readOnly
                  ? "لم يضف صاحب البيانات تعريفاً بالمركز وأهدافه العامة بعد."
                  : "اكتب التعريف بالمركز والأهداف العامة، وستُحفظ كتابتك كمسودة حتى تضغط «تثبيت المحتوى» ليظهر النص بهذا التنسيق النهائي."}
              </p>
              {!readOnly && (
                <Button
                  type="button"
                  onClick={() => startEditing()}
                  className="mt-4 rounded-full bg-gradient-to-l from-emerald-800 to-teal-700 px-4 text-xs font-black text-white shadow-lg shadow-emerald-900/20 hover:from-emerald-700 hover:to-teal-600"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  ابدأ الكتابة
                </Button>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
