import { printHtmlDocument } from "@/utils/nativePrint";
import { esc } from "@/utils/report";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Student, HifzHistory, YearData } from "@/types/student";
import { TableHeader } from "./table/TableHeader";
import { SortField, SortDirection } from "./table/TableHeader";
import { TableRow } from "./table/TableRow";
import { TableFilters } from "./table/TableFilters";
import { GenerateStudentPapersDialog } from "@/components/exam/GenerateStudentPapersDialog";
import { calculateGrade, resolveBaseHifz } from "@/utils/calculations";
import { arabicIncludes } from "@/utils/arabicSearch";
import { getDuplicateNameCounts, getDuplicateCountFor } from "@/utils/studentNames";
import logo from "@/assets/logo.png";
import { getTableFilters, setTableFilters } from "@/utils/storage";
import { PRINT_FONT_BODY, PRINT_FONT_FACES } from "@/utils/paper-fonts";

interface DirtyData {
  name: string;
  history: HifzHistory;
  yearData: YearData;
}

interface Props {
  students: Student[];
  currentYear: string;
  competitionLabel?: string;
  onDelete: (id: number) => void;
  dirtyMap: Record<number, DirtyData>;
  onDirtyChange: (studentId: number, data: DirtyData) => void;
}

export const CompetitionTable = ({
  students,
  currentYear,
  competitionLabel = "المسابقة الرمضانية",
  onDelete,
  dirtyMap,
  onDirtyChange,
}: Props) => {
  const STORAGE_KEY = "competitionTable.filters";
  type Persisted = {
    selectedTeacher: string;
    nameFilter: string;
    statusFilter: string;
    gradeFilter: string;
    partsFilter: string;
    cumulativeHifzFilter: string;
    sortField: SortField | null;
    sortDirection: SortDirection;
    updatedAt?: number;
  };
  const loadPersisted = (): Partial<Persisted> => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const [saved] = useState<Partial<Persisted>>(loadPersisted);
  const [selectedTeacher, setSelectedTeacher] = useState<string>(saved.selectedTeacher ?? "all");
  const [nameFilter, setNameFilter] = useState<string>(saved.nameFilter ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(saved.statusFilter ?? "all");
  const [gradeFilter, setGradeFilter] = useState<string>(saved.gradeFilter ?? "all");
  const [partsFilter, setPartsFilter] = useState<string>(saved.partsFilter ?? "");
  const [cumulativeHifzFilter, setCumulativeHifzFilter] = useState<string>(
    saved.cumulativeHifzFilter ?? "all",
  );
  const [sortField, setSortField] = useState<SortField | null>(saved.sortField ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(saved.sortDirection ?? null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  /**
   * الطلاب المشمولون بتوليد نماذج الاختبار: `null` = الحوار مغلق،
   * طالب واحد من زر الصف، أو كل الطلاب المفلترين من زر رأس الكشف.
   */
  const [paperStudents, setPaperStudents] = useState<Student[] | null>(null);

  // قراءة نسخة المرشحات المحفوظة في قاعدة الجهاز مرة واحدة عند الفتح
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = (await getTableFilters<Partial<Persisted>>()) || {};
        const localUpdated = saved.updatedAt ?? 0;
        const remoteUpdated = remote.updatedAt ?? 0;
        // لا تستبدل مرشحات هذا المتصفح إلا بنسخة محفوظة أحدث.
        if (
          !cancelled &&
          remote &&
          Object.keys(remote).length > 0 &&
          remoteUpdated > localUpdated
        ) {
          if (remote.selectedTeacher !== undefined) setSelectedTeacher(remote.selectedTeacher);
          if (remote.nameFilter !== undefined) setNameFilter(remote.nameFilter);
          if (remote.statusFilter !== undefined) setStatusFilter(remote.statusFilter);
          if (remote.gradeFilter !== undefined) setGradeFilter(remote.gradeFilter);
          if (remote.partsFilter !== undefined) setPartsFilter(remote.partsFilter);
          if (remote.cumulativeHifzFilter !== undefined)
            setCumulativeHifzFilter(remote.cumulativeHifzFilter);
          if (remote.sortField !== undefined) setSortField(remote.sortField);
          if (remote.sortDirection !== undefined) setSortDirection(remote.sortDirection);
        }
      } catch (e) {
        /* offline ok */
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saved.updatedAt]);

  useEffect(() => {
    const data: Persisted = {
      selectedTeacher,
      nameFilter,
      statusFilter,
      gradeFilter,
      partsFilter,
      cumulativeHifzFilter,
      sortField,
      sortDirection,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
    if (!settingsLoaded) return;
    // النسخة المحلية تحفظ المرشحات في MrkzyDatabase دائماً، بلا شرط اتصال.
    const persistSettings = async () => {
      try {
        await setTableFilters(data);
      } catch {
        /* ignore */
      }
    };
    const handle = setTimeout(persistSettings, 800);
    // Flush immediately if user closes/hides the tab before debounce fires
    const flush = () => {
      clearTimeout(handle);
      void persistSettings();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(handle);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    selectedTeacher,
    nameFilter,
    statusFilter,
    gradeFilter,
    partsFilter,
    cumulativeHifzFilter,
    sortField,
    sortDirection,
    settingsLoaded,
  ]);

  const savePersistedSettings = useCallback(
    (overrides: Partial<Persisted> = {}) => {
      const data: Persisted = {
        selectedTeacher,
        nameFilter,
        statusFilter,
        gradeFilter,
        partsFilter,
        cumulativeHifzFilter,
        sortField,
        sortDirection,
        updatedAt: Date.now(),
        ...overrides,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
    },
    [
      selectedTeacher,
      nameFilter,
      statusFilter,
      gradeFilter,
      partsFilter,
      cumulativeHifzFilter,
      sortField,
      sortDirection,
    ],
  );

  const handleSort = useCallback(
    (field: SortField) => {
      let nextSortField: SortField | null = field;
      let nextSortDirection: SortDirection = "asc";

      if (sortField === field) {
        if (sortDirection === "asc") nextSortDirection = "desc";
        else if (sortDirection === "desc") {
          nextSortField = null;
          nextSortDirection = null;
        }
      }

      savePersistedSettings({ sortField: nextSortField, sortDirection: nextSortDirection });
      setSortField(nextSortField);
      setSortDirection(nextSortDirection);
    },
    [sortField, sortDirection, savePersistedSettings],
  );

  const teachers = useMemo(() => {
    const uniqueTeachers = Array.from(new Set(students.map((s) => s.teacher).filter(Boolean)));
    return uniqueTeachers.sort((a, b) => a.localeCompare(b, "ar"));
  }, [students]);

  // كشف الأسماء المكررة (بعد التطبيع) لتمييزها داخل الجدول
  const duplicateNameCounts = useMemo(() => getDuplicateNameCounts(students), [students]);

  const currentYearNum = parseInt(currentYear);

  const getStudentSortValue = useCallback(
    (student: Student, field: SortField): string | number => {
      const parts = parseFloat(student.yearData?.parts || "0");
      const totalScore = parseFloat(student.yearData?.total || "0");
      const isActive = parts > 0 || totalScore > 0;
      const baseHifz = resolveBaseHifz(
        student.hifzHistory || {},
        currentYearNum,
        student.yearData?.baseHifz,
      );

      switch (field) {
        case "name":
          return student.name || "";
        case "teacher":
          return student.teacher || "";
        case "baseHifz":
          return baseHifz;
        case "parts":
          return parts;
        case "totalHifz":
          return Math.min(baseHifz + parts, 30);
        case "annual":
          return parseFloat(student.yearData?.annual || "0");
        case "recitation":
          return parseFloat(student.yearData?.recitation || "0");
        case "memorization":
          return parseFloat(student.yearData?.memorization || "0");
        case "total":
          return totalScore;
        case "status":
          return isActive ? 1 : 0;
        case "grade": {
          const { grade } = calculateGrade(totalScore);
          const order: Record<string, number> = {
            ممتاز: 5,
            "جيد جداً": 4,
            جيد: 3,
            مقبول: 2,
            ضعيف: 1,
            "": 0,
          };
          return order[grade] || 0;
        }
        case "prize":
          return parseFloat(student.yearData?.prize || "0");
        case "statusPrize":
          return parseFloat(student.yearData?.statusPrize || "0");
        case "rank":
          return parseFloat(student.yearData?.rank || "0") || 9999;
        default:
          return 0;
      }
    },
    [currentYearNum],
  );

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      if (selectedTeacher !== "all" && student.teacher !== selectedTeacher) return false;
      if (nameFilter && !arabicIncludes(student.name, nameFilter)) return false;

      const parts = parseFloat(student.yearData?.parts || "0");
      const total = parseFloat(student.yearData?.total || "0");
      const isActive = parts > 0 || total > 0;

      if (statusFilter !== "all") {
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "inactive" && isActive) return false;
      }

      if (gradeFilter !== "all") {
        const totalScore = parseFloat(student.yearData?.total || "0");
        const { grade } = calculateGrade(totalScore);
        if (grade !== gradeFilter) return false;
      }

      if (partsFilter) {
        const minParts = parseFloat(partsFilter) || 0;
        if (parts < minParts) return false;
      }

      if (cumulativeHifzFilter !== "all") {
        const baseHifz = resolveBaseHifz(
          student.hifzHistory || {},
          currentYearNum,
          student.yearData?.baseHifz,
        );
        const cumulativeParts = Math.min(baseHifz + parts, 30);
        if (cumulativeParts !== Number(cumulativeHifzFilter)) return false;
      }

      return true;
    });

    if (sortField && sortDirection) {
      filtered.sort((a, b) => {
        const aVal = getStudentSortValue(a, sortField);
        const bVal = getStudentSortValue(b, sortField);
        const cmp =
          typeof aVal === "string"
            ? aVal.localeCompare(bVal as string, "ar")
            : (aVal as number) - (bVal as number);
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return filtered;
  }, [
    students,
    selectedTeacher,
    nameFilter,
    statusFilter,
    gradeFilter,
    partsFilter,
    cumulativeHifzFilter,
    currentYearNum,
    sortField,
    sortDirection,
    getStudentSortValue,
  ]);

  /** استخدم أحدث تعديلات الجدول غير المحفوظة عند فتح مولّد النماذج. */
  const applyPendingEdits = useCallback(
    (student: Student): Student => {
      const pending = dirtyMap[student.id];
      if (!pending) return student;
      return {
        ...student,
        name: pending.name,
        hifzHistory: pending.history,
        yearData: pending.yearData,
      };
    },
    [dirtyMap],
  );

  /**
   * مجموعة توليد نماذج الاختبار: تُفلتر بالحفظ **التراكمي** فقط
   * (الحفظ السابق + الحفظ الجديد)، ولا يستبعد منها أحد بسبب الحفظ الجديد
   * أو الحالة أو التقدير — لأن فئة النموذج تُشتق من التراكمي وحده.
   */
  const paperFilteredStudents = useMemo(
    () =>
      students.filter((student) => {
        if (selectedTeacher !== "all" && student.teacher !== selectedTeacher) return false;
        if (nameFilter && !arabicIncludes(student.name, nameFilter)) return false;

        if (cumulativeHifzFilter !== "all") {
          const baseHifz = resolveBaseHifz(
            student.hifzHistory || {},
            currentYearNum,
            student.yearData?.baseHifz,
          );
          const parts = parseFloat(student.yearData?.parts || "0") || 0;
          const cumulative = Math.min(baseHifz + parts, 30);
          if (cumulative !== Number(cumulativeHifzFilter)) return false;
        }

        return true;
      }),
    [students, selectedTeacher, nameFilter, cumulativeHifzFilter, currentYearNum],
  );

  /**
   * الطلاب كما سيُطبعون: تُثبَّت فيهم قيمة «الحفظ السابق» المحسوبة من سجل
   * الأعوام (لا القيمة المخزّنة وحدها) ليطابق ما في الكشف.
   */
  const filteredPaperStudents = useMemo(
    () =>
      paperFilteredStudents.map((student) => {
        const withEdits = applyPendingEdits(student);
        const baseHifz = resolveBaseHifz(
          withEdits.hifzHistory || {},
          currentYearNum,
          withEdits.yearData?.baseHifz,
        );
        if (!withEdits.yearData) return withEdits;
        return {
          ...withEdits,
          yearData: { ...withEdits.yearData, baseHifz: String(baseHifz) },
        };
      }),
    [paperFilteredStudents, applyPendingEdits, currentYearNum],
  );

  const hasFilters =
    selectedTeacher !== "all" ||
    nameFilter !== "" ||
    statusFilter !== "all" ||
    gradeFilter !== "all" ||
    partsFilter !== "" ||
    cumulativeHifzFilter !== "all";

  const getFilterDescription = () => {
    const parts: string[] = [];
    if (selectedTeacher !== "all") parts.push(`المعلم/ة: ${selectedTeacher}`);
    if (statusFilter !== "all")
      parts.push(`الحالة: ${statusFilter === "active" ? "نشط" : "منقطع"}`);
    if (gradeFilter !== "all") parts.push(`التقدير: ${gradeFilter}`);
    if (partsFilter) parts.push(`الحفظ الجديد ≥ ${partsFilter}`);
    if (cumulativeHifzFilter !== "all") parts.push(`الحفظ التراكمي: ${cumulativeHifzFilter} جزء`);
    if (nameFilter) parts.push(`الاسم: ${nameFilter}`);
    return parts.join(" | ");
  };

  const handlePrintFiltered = async () => {
    const rows = filteredStudents
      .map((s, i) => {
        const parts = parseFloat(s.yearData?.parts || "0");
        const totalScore = parseFloat(s.yearData?.total || "0");
        const isActive = parts > 0 || totalScore > 0;
        const { grade } = calculateGrade(totalScore);
        const prize = parseFloat(s.yearData?.prize || "0");
        const statusPrize = parseFloat(s.yearData?.statusPrize || "0");

        return `<tr>
        <td>${i + 1}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.teacher)}</td>
        <td>${esc(String(s.yearData?.baseHifz || "-"))}</td>
        <td>${esc(String(s.yearData?.parts || "-"))}</td>
        <td>${esc(String(s.yearData?.totalHifz || "-"))}</td>
        <td>${esc(String(s.yearData?.annual || "-"))}</td>
        <td>${esc(String(s.yearData?.recitation || "-"))}</td>
        <td>${esc(String(s.yearData?.memorization || "-"))}</td>
        <td>${totalScore || "-"}</td>
        <td class="${isActive ? "active" : "inactive"}">${isActive ? "نشط" : "منقطع"}</td>
        <td>${grade || "-"}</td>
        <td>${prize.toLocaleString()}</td>
        <td>${statusPrize.toLocaleString()}</td>
      </tr>`;
      })
      .join("");

    const totalPrize = filteredStudents.reduce(
      (sum, s) => sum + parseFloat(s.yearData?.prize || "0"),
      0,
    );
    const totalStatusPrize = filteredStudents.reduce(
      (sum, s) => sum + parseFloat(s.yearData?.statusPrize || "0"),
      0,
    );

    const fullHtml = `
      <html dir="rtl"><head><title>تقرير مصفى - ${currentYear}هـ</title>
      <style>
      ${PRINT_FONT_FACES}
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body{font-family:${PRINT_FONT_BODY}; padding: 20px; color: #1a3a2a; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #2d7a52; padding-bottom: 12px; }
        .header img { height: 80px; margin-bottom: 8px; }
        .header h1 { font-size: 20px; color: #2d7a52; }
        .header h2 { font-size: 16px; color: #555; margin-top: 4px; }
        .filter-info { background: #f0f7f3; padding: 10px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
        .filter-info strong { color: #2d7a52; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #2d7a52; color: white; padding: 6px 3px; border: 1px solid #1a5a38; }
        td { padding: 5px 3px; border: 1px solid #ccc; text-align: center; }
        tr:nth-child(even) { background: #f9fdfb; }
        .total-row { background: #e8f5ee !important; font-weight: bold; }
        .total-row td { border-top: 2px solid #2d7a52; }
        .active { color: #16a34a; font-weight: bold; }
        .inactive { color: #dc2626; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #888; }
        .count { margin-bottom: 10px; font-size: 13px; }
        @media print { body { padding: 10px; } @page { size: landscape; margin: 10mm; } }
      </style></head><body>
        <div class="header">
          <img src="${logo}" alt="الشعار" />
          <h1>مركز إنماء الأهلي الخيري</h1>
          <h2>كشف ${competitionLabel} - ${currentYear}هـ</h2>
        </div>
        <div class="filter-info"><strong>التصفية:</strong> ${esc(String(getFilterDescription()))}</div>
        <div class="count">عدد الطلاب: <strong>${filteredStudents.length}</strong></div>
        <table>
          <thead><tr>
            <th>م</th><th>الاسم</th><th>المعلم/ة</th><th>الحفظ السابق</th><th>حفظ جديد</th>
            <th>الإجمالي</th><th>سنة</th><th>تلاوة</th><th>حفظ</th><th>المجموع</th>
            <th>الحالة</th><th>التقدير</th><th>المكافأة</th><th>المكافأة حسب الحالة</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="12">إجمالي المكافآت</td>
              <td>${totalPrize.toLocaleString()}</td>
              <td>${totalStatusPrize.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">تصميم أ/ مختار الكمالي - ${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</div>
      </body></html>
    `;
    printHtmlDocument(fullHtml, `تقرير_${competitionLabel}_${currentYear}`);
  };

  return (
    <div className="space-y-3.5">
      <TableFilters
        teachers={teachers}
        selectedTeacher={selectedTeacher}
        onTeacherChange={setSelectedTeacher}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        gradeFilter={gradeFilter}
        onGradeFilterChange={setGradeFilter}
        partsFilter={partsFilter}
        onPartsFilterChange={setPartsFilter}
        cumulativeHifzFilter={cumulativeHifzFilter}
        onCumulativeHifzFilterChange={setCumulativeHifzFilter}
        onPrintFiltered={handlePrintFiltered}
        hasFilters={hasFilters}
      />

      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-card/90 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 bg-muted/20 px-3 py-2.5 print:hidden">
          <div className="flex items-center gap-2">
            <span className="hidden h-6 w-6 items-center justify-center rounded-full bg-primary/[0.07] ring-1 ring-primary/10 sm:flex">
              <Wand2 className="h-3 w-3 text-primary/70" />
            </span>
            <div>
              <h3 className="text-[12px] font-bold tracking-tight text-foreground">كشف الطلاب</h3>
              <p className="text-[10px] text-muted-foreground/70">
                اسحب يمين/يسار لرؤية كل الأعمدة على الجوال
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaperStudents(filteredPaperStudents)}
              disabled={filteredPaperStudents.length === 0}
              title="توليد نموذج اختبار لكل طالب/ة — الفلترة بالحفظ التراكمي فقط"
              className="h-7 gap-1 rounded-full border-primary/20 bg-background/70 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/[0.06] hover:text-primary shadow-sm"
            >
              <Wand2 className="h-3 w-3" />
              نماذج الاختبار
            </Button>
            <div className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] px-2.5 py-1 text-[11px] font-medium tabular-nums text-primary ring-1 ring-primary/10">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              {filteredStudents.length} طالب/ة
            </div>
          </div>
        </div>
        <div className="table-scroll max-h-[60vh] overflow-auto md:max-h-[72vh]">
          <table className="w-full min-w-[1560px] table-fixed border-separate border-spacing-0 bg-card text-sm whitespace-nowrap">
            <TableHeader
              currentYear={currentYear}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <tbody>
              {filteredStudents.map((student, index) => (
                <TableRow
                  key={`${student.id}-${currentYear}`}
                  student={student}
                  index={index + 1}
                  currentYear={currentYear}
                  onDelete={onDelete}
                  onDirtyChange={onDirtyChange}
                  duplicateNameCount={getDuplicateCountFor(student.name, duplicateNameCounts)}
                  onGeneratePaper={(target) => setPaperStudents([applyPendingEdits(target)])}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredStudents.length === 0 && (
        <div className="rounded-[1.5rem] border border-dashed border-primary/20 bg-card/70 py-12 text-center text-muted-foreground">
          لا توجد بيانات تطابق معايير البحث
        </div>
      )}

      <GenerateStudentPapersDialog
        open={paperStudents !== null}
        onOpenChange={(open) => {
          if (!open) setPaperStudents(null);
        }}
        students={paperStudents ?? []}
        currentYear={currentYear}
        competitionLabel={competitionLabel}
      />
    </div>
  );
};
