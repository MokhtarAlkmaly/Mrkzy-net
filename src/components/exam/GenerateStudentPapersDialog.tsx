import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileDown,
  Loader2,
  Printer,
  ReceiptText,
  Search,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { buildPrintDocument, printHtml } from "@/utils/report";
import { exportHtmlAsPdf } from "@/utils/nativePrint";
import { loadQuranData, type QuranData } from "@/utils/quranText";
import {
  ATTENDANCE_MARKS,
  BEHAVIOR_MARKS,
  HIFZ_TOTAL_MARKS,
  PAPER_TOTAL_MARKS,
  QUESTIONS_TOTAL_MARKS,
  RECITATION_TOTAL_MARKS,
  TEACHER_TOTAL_MARKS,
} from "@/lib/exam-marks";
import {
  HIFZ_CATEGORIES,
  MAX_MODELS,
  MIN_MODELS,
  describeJuzRange,
  maxFeasibleModels,
  resolveJuzRange,
  type HifzCategory,
  type RangeDirection,
} from "@/utils/examPaperGenerator";
import {
  DEFAULT_PAPER_MARGINS,
  suggestQuestionFontSize,
  buildPaperCss,
  buildPaperHtml,
  buildStudentAnswerKeyHtml,
  type PaperLayoutOptions,
  type PaperStudentContext,
} from "@/utils/examPaperPrint";
import {
  generateStudentPapers,
  resolveStudentCategory,
  toStudentPaperInput,
  type StudentPaper,
  type StudentPaperInput,
} from "@/utils/studentExamPapers";
import type { Student } from "@/types/student";
import { PaperLayoutControls } from "@/components/exam/PaperLayoutControls";
import { PaperPreviewFrame } from "@/components/exam/PaperPreviewFrame";
import { ParentResultDialog } from "@/components/exam/ParentResultDialog";
import { studentPaperCategoryFileName } from "@/lib/student-paper-file-name";

/**
 * حوار توليد نماذج الاختبار لطلاب المسابقة — ثلاث مراحل صريحة:
 *
 *  1. **الفلترة**: بالحفظ **التراكمي** فقط (السابق + الجديد)، لا بالحفظ الجديد
 *     ولا بالحالة أو التقدير؛ مع تحديد/استبعاد أسماء بعينها.
 *  2. **التوليد**: عدد النماذج واتجاه النطاق ومفتاح التصحيح.
 *  3. **المعاينة**: ضبط الهوامش وألوان الخطوط وحجم الخط وأعضاء لجنة التحكيم،
 *     معاينة حيّة بمقاس A4، ثم الطباعة أو التحميل أو طباعة نتيجة ولي الأمر.
 */

/** فئة موحّدة لكل الطلاب بدل الاشتقاق من حفظ كل طالب */
const AUTO_CATEGORY = "auto";
/** عدد النماذج «تلقائي»: موضع مستقل لكل طالب/ة حتى سقف الفئة */
const AUTO_MODELS = "auto";

/** كم ورقة نعاينها في الإطار (البقية تُطبع كاملة) */
const PREVIEW_LIMIT = 4;

const STEPS = [
  { id: 1, title: "فلترة الطلاب", hint: "بالحفظ التراكمي" },
  { id: 2, title: "توليد النماذج", hint: "للمفلترين فقط" },
  { id: 3, title: "المعاينة والطباعة", hint: "هوامش وألوان" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** الطلاب المشمولون بالتوليد: كل المفلترين أو طالب واحد من الصف */
  students: Student[];
  currentYear: string;
  competitionLabel?: string;
}

/** بيانات الطالب كما تُطبع في ورقة النموذج */
const toContext = (entry: StudentPaper): PaperStudentContext => ({
  name: entry.student.name,
  teacher: entry.student.teacher,
  gender: entry.student.gender,
  baseHifz: entry.student.baseHifz,
  parts: entry.student.parts,
  totalHifz: entry.student.totalHifz,
  categoryLabel: entry.category.label,
  orderInCategory: entry.orderInCategory,
  categoryTotal: entry.categoryTotal,
});

export const GenerateStudentPapersDialog = ({
  open,
  onOpenChange,
  students,
  currentYear,
  competitionLabel = "المسابقة الرمضانية",
}: Props) => {
  const { toast } = useToast();

  const [step, setStep] = useState<number>(1);
  const [categoryId, setCategoryId] = useState<string>(AUTO_CATEGORY);
  const [search, setSearch] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [direction, setDirection] = useState<RangeDirection>("end");
  const [models, setModels] = useState<number | typeof AUTO_MODELS>(AUTO_MODELS);
  const [withAnswerKey, setWithAnswerKey] = useState(false);
  const [options, setOptions] = useState<PaperLayoutOptions>({ competitionLabel });
  const [papers, setPapers] = useState<StudentPaper[] | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [skipReason, setSkipReason] = useState("");
  const [busy, setBusy] = useState<"" | "generate" | "print" | "pdf">("");
  const [parentOpen, setParentOpen] = useState(false);
  const [quranData, setQuranData] = useState<QuranData | null>(null);
  const [preloading, setPreloading] = useState(false);
  const [dataError, setDataError] = useState("");

  const isSingle = students.length === 1;

  // ---------- التحميل المسبق لنص المصحف ----------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreloading(true);
    void loadQuranData()
      .then((data) => {
        if (cancelled) return;
        setQuranData(data);
        setDataError("");
      })
      .catch((err: Error) => {
        if (!cancelled) setDataError(err.message || "تعذّر تحميل نص المصحف");
      })
      .finally(() => {
        if (!cancelled) setPreloading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ---------- تصفير الحالة عند كل فتح ----------
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSearch("");
    setExcluded(new Set());
    setPapers(null);
    setSkippedCount(0);
    setSkipReason("");
    setOptions((previous) => ({ ...previous, competitionLabel }));
  }, [open, competitionLabel]);

  const inputs = useMemo(() => students.map(toStudentPaperInput), [students]);

  /**
   * فلترة مجموعة التوليد: الحفظ **التراكمي** فقط.
   * عند اختيار فئة صريحة يُبقى من يطابقها تراكميًا؛ والحفظ الجديد لا يستبعد
   * أحدًا هنا (أثره في مبلغ التكريم فقط).
   */
  const eligibleInputs = useMemo(
    () =>
      categoryId === AUTO_CATEGORY
        ? inputs
        : inputs.filter(
            (input) => resolveStudentCategory(input.totalHifz, AUTO_CATEGORY)?.id === categoryId,
          ),
    [inputs, categoryId],
  );

  const visibleInputs = useMemo(() => {
    const term = search.trim();
    return term ? eligibleInputs.filter((input) => input.name.includes(term)) : eligibleInputs;
  }, [eligibleInputs, search]);

  const selectedInputs = useMemo(
    () => eligibleInputs.filter((input) => !excluded.has(input.id)),
    [eligibleInputs, excluded],
  );

  const selectedIds = useMemo(
    () => new Set(selectedInputs.map((input) => input.id)),
    [selectedInputs],
  );

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIds.has(student.id)),
    [students, selectedIds],
  );

  /** توزيع الطلاب المحددين على فئات الحفظ التراكمي قبل التوليد. */
  const distribution = useMemo(() => {
    const counts = new Map<string, { category: HifzCategory; count: number }>();
    let withoutHifz = 0;
    for (const input of selectedInputs) {
      const category = resolveStudentCategory(input.totalHifz, categoryId);
      if (!category) {
        withoutHifz += 1;
        continue;
      }
      const entry = counts.get(category.id);
      if (entry) entry.count += 1;
      else counts.set(category.id, { category, count: 1 });
    }
    const rows = [...counts.values()].sort(
      (a, b) =>
        a.category.juzCount - b.category.juzCount || a.category.id.localeCompare(b.category.id),
    );
    return { rows, withoutHifz, total: rows.reduce((sum, row) => sum + row.count, 0) };
  }, [selectedInputs, categoryId]);

  /** سقف المواضع المستقلة لكل فئة ظاهرة في المعاينة. */
  const caps = useMemo(() => {
    const map = new Map<string, number>();
    if (!quranData) return map;
    for (const row of distribution.rows) {
      map.set(row.category.id, maxFeasibleModels(quranData, row.category, direction));
    }
    return map;
  }, [quranData, direction, distribution.rows]);

  const css = useMemo(() => buildPaperCss(options), [options]);

  // ---------- التوليد ----------
  const build = async (): Promise<StudentPaper[]> => {
    const data = quranData ?? (await loadQuranData());
    const result = generateStudentPapers(data, selectedInputs, {
      categoryId,
      direction,
      models: models === AUTO_MODELS ? null : models,
      includeSupplements: true,
    });
    if (result.papers.length === 0) {
      throw new Error(result.skipped[0]?.reason || "لا يوجد طلاب يمكن توليد نماذج لهم");
    }
    setSkippedCount(result.skipped.length);
    setSkipReason(result.skipped[0]?.reason ?? "");
    return result.papers;
  };

  const handleGenerate = async () => {
    if (selectedInputs.length === 0) {
      toast({
        title: "لا أسماء محددة",
        description: "حدّد طالبًا واحدًا على الأقل من القائمة المفلترة.",
        variant: "destructive",
      });
      return;
    }
    setBusy("generate");
    try {
      const result = await build();
      setPapers(result);
      // اقتراح حجم خط يضمن بقاء كل الأسئلة والتوقيعات في صفحة A4 واحدة،
      // ما لم يكن المستخدم قد اختار حجمًا بنفسه.
      const maxQuestions = Math.max(
        ...result.map((entry) => entry.paper.questions.length + entry.paper.supplements.length),
      );
      setOptions((previous) =>
        previous.questionFontSize === undefined
          ? { ...previous, questionFontSize: suggestQuestionFontSize(maxQuestions) }
          : previous,
      );
      setStep(3);
    } catch (error) {
      toast({
        title: "تعذّر توليد النماذج",
        description: (error as Error).message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  // ---------- جسم المستند ----------
  const papersBody = (list: StudentPaper[], answerKey: boolean): string => {
    const sheets = list.map((entry) =>
      buildPaperHtml(entry.paper, currentYear, toContext(entry), options),
    );
    if (!answerKey) return sheets.join("");
    const key = buildStudentAnswerKeyHtml(
      list.map((entry) => ({ paper: entry.paper, student: toContext(entry) })),
      currentYear,
    );
    return sheets.join("") + key;
  };

  const previewBody = useMemo(() => {
    if (!papers) return "";
    return papers
      .slice(0, PREVIEW_LIMIT)
      .map((entry) => buildPaperHtml(entry.paper, currentYear, toContext(entry), options))
      .join("");
  }, [papers, currentYear, options]);

  const fileNameOf = (list: StudentPaper[]): string => {
    const categoryName = studentPaperCategoryFileName(list.map((entry) => entry.category.label));
    return isSingle
      ? `${list.length > 1 ? "نماذج" : "نموذج"}_${categoryName}_${list[0].student.name || "الطالب"}_${currentYear}`
      : `نماذج_طلاب_${categoryName}_${competitionLabel}_${currentYear}`;
  };

  const reportResult = (list: StudentPaper[]) => {
    toast({
      title: `تم تجهيز ${list.length} نموذجًا`,
      description: skippedCount
        ? `تم تخطي ${skippedCount} طالب/ة: ${skipReason || "لا يوجد حفظ كافٍ"}`
        : `الدرجة ${PAPER_TOTAL_MARKS} — الأسئلة ${QUESTIONS_TOTAL_MARKS} + تقييم المعلم ${TEACHER_TOTAL_MARKS}.`,
    });
  };

  const handlePrint = async () => {
    setBusy("print");
    try {
      const list = papers ?? (await build());
      await printHtml(fileNameOf(list), papersBody(list, withAnswerKey), css, "a4", "portrait");
      reportResult(list);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "تعذّر توليد النماذج",
        description: (err as Error).message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
    try {
      const list = papers ?? (await build());
      const fileName = fileNameOf(list);
      await exportHtmlAsPdf(
        buildPrintDocument(fileName, papersBody(list, withAnswerKey), css),
        fileName,
        "a4",
        "portrait",
      );
      reportResult(list);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "تعذّر تجهيز ملف PDF",
        description: (err as Error).message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  const toggleStudent = (id: number, checked: boolean) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = visibleInputs.every((input) => !excluded.has(input.id));

  const selectAllVisible = (checked: boolean) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      for (const input of visibleInputs) {
        if (checked) next.delete(input.id);
        else next.add(input.id);
      }
      return next;
    });
  };

  const nothingToGenerate = distribution.total === 0;
  const canGoPreview = Boolean(papers && papers.length > 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          dir="rtl"
          className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"
          // حوار «نتيجة ولي الأمر» يُفتح فوق هذا الحوار؛ لا نغلق هذا الأخير
          // عند النقر داخله.
          onInteractOutside={(event) => {
            if (parentOpen) event.preventDefault();
          }}
        >
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Wand2 className="h-5 w-5" />
              {isSingle ? `توليد نموذج اختبار — ${students[0]?.name || ""}` : "توليد نماذج اختبار"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              ثلاث مراحل: فلترة بالحفظ التراكمي ← توليد ← معاينة قابلة للتعديل قبل الطباعة أو
              التحميل.
            </DialogDescription>
          </DialogHeader>

          {/* ===== شريط المراحل ===== */}
          <ol className="flex items-center gap-1 rounded-2xl border border-border/60 bg-secondary/30 p-1.5">
            {STEPS.map((item, index) => {
              const active = step === item.id;
              const done = step > item.id;
              return (
                <li key={item.id} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.id < step) setStep(item.id);
                    }}
                    disabled={item.id > step}
                    className={`flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-right transition ${
                      active
                        ? "bg-emerald-800 text-white shadow-sm"
                        : done
                          ? "text-emerald-800 hover:bg-emerald-700/10"
                          : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ${
                        active
                          ? "bg-white/20 text-white"
                          : done
                            ? "bg-emerald-700 text-white"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-black">{item.title}</span>
                      <span
                        className={`block truncate text-[9px] ${active ? "text-white/75" : "text-muted-foreground"}`}
                      >
                        {item.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* ===================== المرحلة ١: الفلترة ===================== */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">
                    فئة الحفظ التراكمي
                  </Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="h-10 rounded-2xl bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_CATEGORY}>
                        كل الطلاب — كل فئة تُشتق من التراكمي
                      </SelectItem>
                      {HIFZ_CATEGORIES.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">بحث بالاسم</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="اكتب اسم الطالب/ة..."
                      className="h-10 rounded-2xl pr-9"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] font-semibold leading-6 text-primary">
                الفلترة هنا تعتمد على <b>الحفظ التراكمي</b> (السابق + الجديد) فقط. الحفظ الجديد لا
                يستبعد أحدًا — أثره في مبلغ التكريم وحده.
              </div>

              <div className="rounded-2xl border border-border/70 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-black text-foreground">
                    <Users className="h-4 w-4 text-emerald-700" />
                    الأسماء ({selectedInputs.length} / {eligibleInputs.length})
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                      <Checkbox
                        checked={allVisibleSelected && visibleInputs.length > 0}
                        onCheckedChange={(value) => selectAllVisible(value === true)}
                      />
                      تحديد الظاهر
                    </label>
                  </div>
                </div>

                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[620px] text-[11px]">
                    <thead className="sticky top-0 z-10 bg-muted/80 text-[10px] text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="w-8 p-1.5" />
                        <th className="p-1.5 text-right font-bold">اسم الطالب/ة</th>
                        <th className="p-1.5 font-bold">المعلمة</th>
                        <th className="p-1.5 font-bold">الحفظ السابق</th>
                        <th className="p-1.5 font-bold">الحفظ الجديد</th>
                        <th className="p-1.5 font-bold text-emerald-800">التراكمي</th>
                        <th className="p-1.5 font-bold">فئة النموذج</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInputs.map((input) => {
                        const category = resolveStudentCategory(input.totalHifz, AUTO_CATEGORY);
                        const checked = !excluded.has(input.id);
                        return (
                          <tr
                            key={input.id}
                            className={`border-t border-border/40 ${checked ? "" : "opacity-45"}`}
                          >
                            <td className="p-1.5 text-center">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleStudent(input.id, value === true)}
                                aria-label={`تحديد ${input.name}`}
                              />
                            </td>
                            <td className="max-w-[180px] truncate p-1.5 font-bold">{input.name}</td>
                            <td className="max-w-[120px] truncate p-1.5 text-muted-foreground">
                              {input.teacher || "—"}
                            </td>
                            <td className="p-1.5 text-center tabular-nums text-violet-700">
                              {input.baseHifz ?? 0}
                            </td>
                            <td className="p-1.5 text-center tabular-nums text-amber-700">
                              {input.parts ?? 0}
                            </td>
                            <td className="p-1.5 text-center font-black tabular-nums text-emerald-800">
                              {input.totalHifz}
                            </td>
                            <td className="p-1.5 text-center">
                              {category ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {category.label}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-amber-700">بلا حفظ</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {visibleInputs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            لا أسماء تطابق هذا الفلتر.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {distribution.rows.map((row) => {
                  const cap = caps.get(row.category.id);
                  const overflow = cap !== undefined && row.count > cap;
                  return (
                    <Badge
                      key={row.category.id}
                      variant="outline"
                      className={overflow ? "gap-1 border-amber-500/60 bg-amber-500/10" : "gap-1"}
                    >
                      {row.category.label}
                      <span className="text-muted-foreground">
                        {describeJuzRange(resolveJuzRange(row.category, direction))}
                      </span>
                      <span className="font-black text-primary">{row.count}</span>
                    </Badge>
                  );
                })}
                {distribution.withoutHifz > 0 && (
                  <Badge variant="outline" className="border-amber-500/60 bg-amber-500/10">
                    سيُتخطى {distribution.withoutHifz} بلا حفظ
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* ===================== المرحلة ٢: التوليد ===================== */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-secondary/25 px-3 py-2 text-[11px] font-semibold text-foreground">
                {models === AUTO_MODELS
                  ? `سيُولَّد نموذج مستقل واحد لكل طالب/ة من الأسماء المحددة (${selectedInputs.length}).`
                  : `سيُولَّد ${models} نماذج لكل طالب/ة من الأسماء المحددة (${selectedInputs.length}) — حتى ${models * selectedInputs.length} نموذجًا إذا كانت الأسماء مؤهلة.`}{" "}
                تُحدَّد فئة كل طالب/ة من حفظه التراكمي.
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">عدد النماذج لكل طالب/ة</Label>
                  <Select
                    value={models === AUTO_MODELS ? AUTO_MODELS : String(models)}
                    onValueChange={(value) =>
                      setModels(value === AUTO_MODELS ? AUTO_MODELS : Number(value))
                    }
                  >
                    <SelectTrigger className="h-10 rounded-2xl bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_MODELS}>تلقائي — نموذج واحد لكل طالب/ة</SelectItem>
                      {Array.from(
                        { length: MAX_MODELS - MIN_MODELS + 1 },
                        (_, index) => MIN_MODELS + index,
                      ).map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {count} نموذجًا
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">نطاق الأجزاء</Label>
                  <Select
                    value={direction}
                    onValueChange={(value) => setDirection(value as RangeDirection)}
                  >
                    <SelectTrigger className="h-10 rounded-2xl bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="end">من آخر المصحف</SelectItem>
                      <SelectItem value="start">من أول المصحف</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">عنوان المسابقة</Label>
                  <Input
                    value={options.competitionLabel ?? competitionLabel}
                    onChange={(event) =>
                      setOptions((previous) => ({
                        ...previous,
                        competitionLabel: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl"
                  />
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={withAnswerKey}
                      onCheckedChange={(value) => setWithAnswerKey(value === true)}
                    />
                    <span>إرفاق مفتاح التصحيح في نهاية المستند</span>
                  </label>
                </div>
              </div>

              <p className="rounded-xl border border-primary/20 bg-primary/5 p-2 text-[11px] font-semibold text-primary">
                الدرجات: {HIFZ_TOTAL_MARKS} للحفظ + {RECITATION_TOTAL_MARKS} للتلاوة والتجويد
                والمعاني = {QUESTIONS_TOTAL_MARKS}، ويضيف المعلم/ة المواظبة ({ATTENDANCE_MARKS})
                والسلوك ({BEHAVIOR_MARKS}) = {TEACHER_TOTAL_MARKS}. المجموع {PAPER_TOTAL_MARKS}.
              </p>

              {preloading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جارٍ تحميل نص المصحف للتوليد...
                </p>
              )}
              {dataError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  تعذّر تحميل نص المصحف: {dataError}
                </div>
              )}
            </div>
          )}

          {/* ===================== المرحلة ٣: المعاينة ===================== */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <PaperLayoutControls value={options} onChange={setOptions} />
                </div>
                <PaperPreviewFrame
                  title="معاينة نماذج الاختبار"
                  body={previewBody}
                  css={css}
                  height={560}
                  verticalMarginsMm={
                    (options.margins?.top ?? DEFAULT_PAPER_MARGINS.top) +
                    (options.margins?.bottom ?? DEFAULT_PAPER_MARGINS.bottom)
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <span className="rounded-full bg-emerald-700/10 px-2 py-1 font-black text-emerald-800">
                  {papers?.length ?? 0} نموذجًا
                </span>
                <span>· صفحة A4 لكل نموذج</span>
                {(papers?.length ?? 0) > PREVIEW_LIMIT && (
                  <span>· المعاينة تعرض أول {PREVIEW_LIMIT} نماذج، والطباعة تشمل الجميع</span>
                )}
                {withAnswerKey && <span>· مفتاح التصحيح مرفق في نهاية المستند</span>}
              </div>
            </div>
          )}

          {/* ===================== أزرار التنقل ===================== */}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
                إلغاء
              </Button>
              {step > 1 && (
                <Button
                  variant="outline"
                  className="gap-1 rounded-full"
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  السابق
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {step === 1 && (
                <Button
                  className="gap-1 rounded-full"
                  onClick={() => setStep(2)}
                  disabled={selectedInputs.length === 0}
                >
                  التالي: التوليد
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}

              {step === 2 && (
                <Button
                  className="gap-1 rounded-full"
                  onClick={() => void handleGenerate()}
                  disabled={busy !== "" || preloading || !!dataError || nothingToGenerate}
                >
                  {busy === "generate" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  توليد ومعاينة
                </Button>
              )}

              {step === 3 && (
                <>
                  <Button
                    className="gap-1 rounded-full"
                    onClick={() => void handlePrint()}
                    disabled={busy !== "" || !canGoPreview}
                  >
                    {busy === "print" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4" />
                    )}
                    طباعة النماذج
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1 rounded-full"
                    onClick={() => void handleDownloadPdf()}
                    disabled={busy !== "" || !canGoPreview}
                  >
                    {busy === "pdf" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    تنزيل PDF
                  </Button>
                  <Button
                    variant="secondary"
                    className="gap-1 rounded-full"
                    onClick={() => setParentOpen(true)}
                    disabled={selectedStudents.length === 0}
                    title="طباعة نتيجة لكل طالب/ة ترسل لولي الأمر"
                  >
                    <ReceiptText className="h-4 w-4" />
                    نتيجة ولي الأمر
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>

          {step === 1 && !isSingle && (
            <p className="text-[11px] text-muted-foreground">
              الفلترة الأساسية في كشف المسابقة تبقى كما هي (المعلمة والاسم)، أما فئة الحفظ فهي
              التراكمي دائمًا. لتقليل عدد الأسماء استخدم «فئة الحفظ التراكمي» أو البحث.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <ParentResultDialog
        open={parentOpen}
        onOpenChange={setParentOpen}
        students={selectedStudents}
        currentYear={currentYear}
        competitionLabel={competitionLabel}
        layout={options}
      />
    </>
  );
};

export default GenerateStudentPapersDialog;
