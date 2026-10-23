import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Printer, ReceiptText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { buildPrintDocument, printHtml } from "@/utils/report";
import { exportHtmlAsPdf } from "@/utils/nativePrint";
import {
  PAPER_TOTAL_MARKS,
  HIFZ_TOTAL_MARKS,
  RECITATION_TOTAL_MARKS,
  TEACHER_TOTAL_MARKS,
} from "@/lib/exam-marks";
import { calculateGrade } from "@/utils/calculations";
import {
  DEFAULT_PAPER_MARGINS,
  buildPaperCss,
  buildParentResultsHtml,
  summarizeParentResult,
  type PaperLayoutOptions,
  type ParentResultInput,
} from "@/utils/examPaperPrint";
import { categoryForHifz, toStudentPaperInput } from "@/utils/studentExamPapers";
import type { Student } from "@/types/student";
import { PaperPreviewFrame } from "@/components/exam/PaperPreviewFrame";
import { PaperLayoutControls } from "@/components/exam/PaperLayoutControls";

/**
 * حوار «نتيجة ولي الأمر»: يطبع لكل طالب ورقة نتيجة أنيقة تحمل درجاته
 * (الحفظ · التلاوة والتجويد والمعاني · المواظبة والسلوك · المجموع)،
 * والتقدير، ومبلغ التكريم حسب التقدير، ومبلغ التكريم حسب الحالة، والتوقيعات.
 *
 * القيم الافتراضية تُستدعى من كشف المسابقة (حفظ سابق/جديد/تراكمي، الدرجات،
 * التكريم)، ويمكن تعديل الدرجات والمبالغ هنا قبل الطباعة.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  currentYear: string;
  competitionLabel?: string;
  /** خيارات التنسيق المتفق عليها في معاينة النماذج (هوامش وألوان). */
  layout?: PaperLayoutOptions;
}

type EditableRow = {
  id: number;
  name: string;
  teacher: string;
  gender?: string;
  baseHifz: number;
  parts: number;
  totalHifz: number;
  categoryLabel: string;
  memorization: string;
  recitation: string;
  conduct: string;
  prize: string;
  statusPrize: string;
};

const num = (value: string | undefined): number => {
  const parsed = parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

/** مبلغ التكريم الافتراضي: الحفظ الجديد × سعر الجزء حسب التقدير. */
const defaultPrize = (parts: number, total: number): number => {
  const { pricePerPart } = calculateGrade(total);
  return Math.round(parts * pricePerPart);
};

const toRow = (student: Student): EditableRow => {
  const input = toStudentPaperInput(student);
  const category = categoryForHifz(input.totalHifz);
  const memorization = num(student.yearData?.memorization);
  const recitation = num(student.yearData?.recitation);
  const conduct = num(student.yearData?.annual);
  const total = Math.min(
    PAPER_TOTAL_MARKS,
    Math.round((memorization + recitation + conduct) * 100) / 100,
  );
  const storedPrize = num(student.yearData?.prize);
  return {
    id: student.id,
    name: student.name,
    teacher: student.teacher || student.yearData?.teacher || "",
    gender: student.gender,
    baseHifz: input.baseHifz ?? 0,
    parts: input.parts ?? 0,
    totalHifz: input.totalHifz,
    categoryLabel: category?.label ?? "",
    memorization: String(memorization || ""),
    recitation: String(recitation || ""),
    conduct: String(conduct || ""),
    // التكريم المحسوب من التقدير هو الافتراضي؛ والقيمة المحفوظة في الكشف
    // تُعتمد إن وُجدت حتى لا يتغيّر ما صُرف فعلاً.
    prize: String(storedPrize > 0 ? storedPrize : defaultPrize(input.parts ?? 0, total)),
    statusPrize: String(num(student.yearData?.statusPrize) || ""),
  };
};

const toInput = (row: EditableRow): ParentResultInput => ({
  student: {
    name: row.name,
    teacher: row.teacher,
    gender: row.gender,
    baseHifz: row.baseHifz,
    parts: row.parts,
    totalHifz: row.totalHifz,
    categoryLabel: row.categoryLabel,
  },
  memorization: num(row.memorization),
  recitation: num(row.recitation),
  conduct: num(row.conduct),
  prize: num(row.prize),
  statusPrize: num(row.statusPrize),
});

/** كم ورقة نعاينها في الإطار (البقية تُطبع كاملة). */
const PREVIEW_LIMIT = 3;

export const ParentResultDialog = ({
  open,
  onOpenChange,
  students,
  currentYear,
  competitionLabel = "المسابقة الرمضانية",
  layout,
}: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [note, setNote] = useState("");
  const [options, setOptions] = useState<PaperLayoutOptions>({
    competitionLabel,
    ...layout,
  });
  const [busy, setBusy] = useState<"" | "print" | "pdf">("");

  // إعادة بناء الصفوف كلما فُتح الحوار أو تغيّر الطلاب
  useEffect(() => {
    if (!open) return;
    setRows(students.map(toRow));
    // نورّث هوامش وألوان معاينة النماذج، مع إبقاء أي تعديل داخل هذا الحوار.
    setOptions((previous) => ({ ...previous, ...layout, competitionLabel }));
    // layout يتغيّر مع كل تعديل في الحوار الأب؛ لا نريده أن يمسح تعديلات المستخدم
    // هنا، لذلك نزامنه عند الفتح فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, students, competitionLabel]);

  const css = useMemo(() => buildPaperCss(options), [options]);

  const inputs = useMemo(() => rows.map(toInput), [rows]);

  const body = useMemo(
    () =>
      buildParentResultsHtml(
        inputs.slice(0, PREVIEW_LIMIT).map((input) => ({ ...input, note })),
        currentYear,
        options,
      ),
    [inputs, note, currentYear, options],
  );

  const updateRow = (id: number, patch: Partial<EditableRow>) =>
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  /** إعادة الأرقام إلى ما في كشف المسابقة. */
  const resetRows = () => {
    setRows(students.map(toRow));
    toast({ title: "أُعيدت القيم من كشف المسابقة" });
  };

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const summary = summarizeParentResult(toInput(row));
        acc.prize += summary.prize;
        acc.statusPrize += summary.statusPrize;
        acc.grand += summary.grandTotal;
        return acc;
      },
      { prize: 0, statusPrize: 0, grand: 0 },
    );
  }, [rows]);

  const buildBody = () => {
    const all = inputs.map((input) => ({ ...input, note }));
    return buildParentResultsHtml(all, currentYear, options);
  };

  const fileName = `نتيجة_ولي_الأمر_${currentYear}`;

  const handlePrint = async () => {
    setBusy("print");
    try {
      await printHtml(fileName, buildBody(), css, "a4", "portrait");
      toast({
        title: "جارٍ تجهيز نتيجة ولي الأمر",
        description: `${rows.length} نتيجة — صفحة A4 لكل طالب/ة.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "تعذّرت الطباعة",
        description: (error as Error).message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
    try {
      await exportHtmlAsPdf(
        buildPrintDocument(fileName, buildBody(), css),
        fileName,
        "a4",
        "portrait",
      );
      toast({ title: "تم تجهيز ملف PDF", description: `${rows.length} نتيجة جاهزة للتحميل.` });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "تعذّر تجهيز ملف PDF",
        description: (error as Error).message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ReceiptText className="h-5 w-5" />
            نتيجة ولي الأمر — {rows.length} طالب/ة
          </DialogTitle>
          <DialogDescription className="text-sm">
            تُطبع لكل طالب ورقة A4: الدرجات والتقدير، ومبلغ التكريم حسب التقدير (الحفظ الجديد × سعر
            الجزء)، ومبلغ التكريم حسب الحالة، مع التوقيعات.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-border/70 bg-secondary/25 p-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[11px] font-bold text-foreground">
              الدرجات والمبالغ — القيم من كشف المسابقة وقابلة للتعديل
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-[11px]"
              onClick={resetRows}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              إعادة من الكشف
            </Button>
          </div>
          <div className="max-h-64 overflow-auto rounded-xl bg-card">
            <table className="w-full min-w-[900px] text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted/80 text-[10px] text-muted-foreground backdrop-blur">
                <tr>
                  <th className="p-1.5 text-right font-bold">اسم الطالب/ة</th>
                  <th className="p-1.5 font-bold">السابق</th>
                  <th className="p-1.5 font-bold">الجديد</th>
                  <th className="p-1.5 font-bold">التراكمي</th>
                  <th className="p-1.5 font-bold">الحفظ /{HIFZ_TOTAL_MARKS}</th>
                  <th className="p-1.5 font-bold">التلاوة /{RECITATION_TOTAL_MARKS}</th>
                  <th className="p-1.5 font-bold">المواظبة /{TEACHER_TOTAL_MARKS}</th>
                  <th className="p-1.5 font-bold">المجموع</th>
                  <th className="p-1.5 font-bold">التقدير</th>
                  <th className="p-1.5 font-bold">تكريم التقدير</th>
                  <th className="p-1.5 font-bold">تكريم الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const summary = summarizeParentResult(toInput(row));
                  return (
                    <tr key={row.id} className="border-t border-border/50">
                      <td className="max-w-[160px] truncate p-1.5 font-bold">{row.name}</td>
                      <td className="p-1 text-center tabular-nums">{row.baseHifz}</td>
                      <td className="p-1 text-center tabular-nums">{row.parts}</td>
                      <td className="p-1 text-center font-black tabular-nums text-emerald-800">
                        {row.totalHifz}
                      </td>
                      {(
                        [
                          ["memorization", HIFZ_TOTAL_MARKS],
                          ["recitation", RECITATION_TOTAL_MARKS],
                          ["conduct", TEACHER_TOTAL_MARKS],
                        ] as const
                      ).map(([key, max]) => (
                        <td key={key} className="p-1 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={max}
                            step="0.25"
                            value={row[key]}
                            onChange={(event) => updateRow(row.id, { [key]: event.target.value })}
                            aria-label={`${key} — ${row.name}`}
                            className="mx-auto h-7 w-16 rounded-lg px-1 text-center text-[11px] tabular-nums"
                          />
                        </td>
                      ))}
                      <td className="p-1 text-center font-black tabular-nums">{summary.total}</td>
                      <td className="p-1 text-center font-bold text-amber-700">
                        {summary.grade || "—"}
                      </td>
                      {(["prize", "statusPrize"] as const).map((key) => (
                        <td key={key} className="p-1 text-center">
                          <Input
                            type="number"
                            min={0}
                            step="100"
                            value={row[key]}
                            onChange={(event) => updateRow(row.id, { [key]: event.target.value })}
                            aria-label={`${key} — ${row.name}`}
                            className="mx-auto h-7 w-20 rounded-lg px-1 text-center text-[11px] tabular-nums"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-1 pt-1.5 text-[11px] font-bold text-emerald-900">
            إجمالي التكريم: {totals.prize.toLocaleString("en-US")} ريال · حسب الحالة:{" "}
            {totals.statusPrize.toLocaleString("en-US")} ريال · المستحق:{" "}
            {totals.grand.toLocaleString("en-US")} ريال
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs font-black text-foreground">
                ملاحظة المعلم/ة (تظهر في كل ورقة)
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="مثال: نشكر لولي الأمر متابعته، ونرجو الاستمرار في المراجعة اليومية."
                className="w-full rounded-2xl border border-border/70 bg-background px-3 py-2 text-xs leading-6"
              />
            </label>
            <PaperLayoutControls value={options} onChange={setOptions} showCommittee={false} />
          </div>
          <PaperPreviewFrame
            title="معاينة نتيجة ولي الأمر"
            body={body}
            css={css}
            height={520}
            verticalMarginsMm={
              (options.margins?.top ?? DEFAULT_PAPER_MARGINS.top) +
              (options.margins?.bottom ?? DEFAULT_PAPER_MARGINS.bottom)
            }
          />
        </div>

        {inputs.length > PREVIEW_LIMIT && (
          <p className="text-[11px] font-semibold text-muted-foreground">
            المعاينة تعرض أول {PREVIEW_LIMIT} نتيجة — الطباعة والتحميل يشملان كل الـ
            {inputs.length} نتيجة.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button className="gap-1" onClick={() => void handlePrint()} disabled={busy !== ""}>
            {busy === "print" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            طباعة النتيجة
          </Button>
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => void handleDownloadPdf()}
            disabled={busy !== ""}
          >
            {busy === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            تنزيل PDF
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ParentResultDialog;
