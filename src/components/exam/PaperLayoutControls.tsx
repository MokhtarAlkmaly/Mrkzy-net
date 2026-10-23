import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PAPER_COLORS,
  DEFAULT_QUESTION_FONT_SIZE,
  PAPER_COLOR_PRESETS,
  type PaperColors,
  type PaperLayoutOptions,
} from "@/utils/examPaperPrint";
import { cn } from "@/lib/utils";

/**
 * لوحة ضبط تنسيق الورقة قبل الطباعة:
 *  - الهوامش الأربعة (مم) + قوالب سريعة.
 *  - ألوان الخطوط (قوالب مصحفية جاهزة + منتقي لون لكل نوع بيانات).
 *  - حجم خط الأسئلة تلقائيًا حسب عدد أسئلة كل ورقة، أو يدويًا من الشريط.
 *  - إظهار/إخفاء البسملة من صدر الورقة.
 *  - أسماء أعضاء لجنة التحكيم الثلاثة (تُدخل كل مرة عند الطباعة).
 */

interface Props {
  value: PaperLayoutOptions;
  onChange: (next: PaperLayoutOptions) => void;
  /** هل نعرض حقول لجنة التحكيم (ورقة النموذج) أم لا (نتيجة ولي الأمر) */
  showCommittee?: boolean;
}

const MARGIN_PRESETS: { id: string; label: string; value: number }[] = [
  { id: "tight", label: "ضيقة 6mm", value: 6 },
  { id: "normal", label: "عادية 8mm", value: 8 },
  { id: "wide", label: "واسعة 12mm", value: 12 },
];

/** أنواع الخطوط القابلة للتلوين، بتسمية عربية مفهومة. */
const COLOR_FIELDS: { key: keyof PaperColors; label: string; hint: string }[] = [
  { key: "name", label: "اسم الطالب", hint: "خانة الاسم" },
  { key: "category", label: "فئة الحفظ التراكمي", hint: "خانة الفئة" },
  { key: "previous", label: "الحفظ السابق", hint: "خانة الحفظ السابق" },
  { key: "current", label: "الحفظ الجديد", hint: "خانة الحفظ الجديد" },
  { key: "teacher", label: "اسم المعلمة", hint: "خانة المعلمة" },
  { key: "question", label: "الأسئلة", hint: "نص أسئلة الحفظ والتلاوة" },
  { key: "ink", label: "النصوص العامة", hint: "التعليمات والدرجات" },
  { key: "signature", label: "التوقيعات", hint: "المعلمة واللجنة والإدارة" },
];

const marginValue = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const PaperLayoutControls = ({ value, onChange, showCommittee = true }: Props) => {
  const margins = value.margins ?? {};
  const colors = { ...DEFAULT_PAPER_COLORS, ...(value.colors ?? {}) };
  const fontSize = value.questionFontSize ?? DEFAULT_QUESTION_FONT_SIZE;
  /** الحجم التلقائي: يحدّده عدد أسئلة كل ورقة على حدة بدل مقاس واحد للمستند */
  const isAutoSize = typeof value.questionFontSize !== "number";

  const setMargin = (key: "top" | "bottom" | "left" | "right", raw: string) => {
    const next = Math.min(30, Math.max(0, Number(raw) || 0));
    onChange({ ...value, margins: { ...margins, [key]: next } });
  };

  const applyMarginPreset = (size: number) =>
    onChange({ ...value, margins: { top: size, bottom: size, left: size, right: size } });

  const setColor = (key: keyof PaperColors, color: string) =>
    onChange({ ...value, colors: { ...(value.colors ?? {}), [key]: color } });

  const applyColorPreset = (preset: PaperColors) => onChange({ ...value, colors: { ...preset } });

  const setCommitteeMember = (index: number, name: string) => {
    const committee = [...(value.committee ?? ["", "", ""])];
    while (committee.length < 3) committee.push("");
    committee[index] = name;
    onChange({ ...value, committee });
  };

  const committee = [...(value.committee ?? [])];
  while (committee.length < 3) committee.push("");

  return (
    <div className="space-y-4">
      {/* ===== الهوامش ===== */}
      <section className="rounded-2xl border border-border/70 bg-card/70 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black text-foreground">هوامش الصفحة (مم)</h4>
          <div className="flex flex-wrap items-center gap-1">
            {MARGIN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyMarginPreset(preset.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-bold transition",
                  marginValue(margins.top, 8) === preset.value
                    ? "border-emerald-700/40 bg-emerald-700 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-emerald-700/40 hover:text-emerald-800",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["top", "أعلى"],
              ["bottom", "أسفل"],
              ["right", "يمين"],
              ["left", "يسار"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`margin-${key}`} className="text-[10px] text-muted-foreground">
                {label}
              </Label>
              <Input
                id={`margin-${key}`}
                type="number"
                min={0}
                max={30}
                step={1}
                value={marginValue(margins[key], 8)}
                onChange={(event) => setMargin(key, event.target.value)}
                className="h-8 rounded-xl text-xs tabular-nums"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ===== الألوان ===== */}
      <section className="rounded-2xl border border-border/70 bg-card/70 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black text-foreground">ألوان الخطوط</h4>
          <div className="flex flex-wrap items-center gap-1">
            {PAPER_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyColorPreset(preset.colors)}
                title={preset.label}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground transition hover:border-emerald-700/40 hover:text-emerald-800"
              >
                <span className="flex -space-x-0.5 rtl:space-x-reverse">
                  {[preset.colors.name, preset.colors.category, preset.colors.current].map(
                    (color) => (
                      <span
                        key={color}
                        className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                        style={{ backgroundColor: color }}
                      />
                    ),
                  )}
                </span>
                {preset.label.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {COLOR_FIELDS.map((field) => (
            <label
              key={field.key}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-2 py-1.5"
              title={field.hint}
            >
              <input
                type="color"
                value={colors[field.key]}
                onChange={(event) => setColor(field.key, event.target.value)}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={`لون ${field.label}`}
              />
              <span className="truncate text-[10px] font-bold text-foreground">{field.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ===== حجم الخط + لجنة التحكيم ===== */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-foreground">حجم خط الأسئلة</h4>
            {isAutoSize ? (
              <button
                type="button"
                onClick={() => onChange({ ...value, questionFontSize: undefined })}
                className="rounded-full border border-emerald-700/40 bg-emerald-700 px-2.5 py-0.5 text-[10px] font-bold text-white"
              >
                تلقائي
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onChange({ ...value, questionFontSize: undefined })}
                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:border-emerald-700/40 hover:text-emerald-800"
              >
                تلقائي
              </button>
            )}
          </div>
          {isAutoSize ? (
            <p className="rounded-xl bg-emerald-700/10 px-2 py-1.5 text-[10px] font-bold leading-5 text-emerald-800">
              يُضبط تلقائيًا لكل ورقة حسب عدد أسئلتها، فتبقى الأسئلة والتوقيعات في صفحة A4 واحدة.
              اسحب الشريط لتثبيت مقاس يدوي.
            </p>
          ) : (
            <p className="text-[10px] font-bold tabular-nums text-emerald-800">{fontSize} pt</p>
          )}
          <input
            type="range"
            min={9}
            max={16}
            step={0.5}
            value={fontSize}
            onChange={(event) =>
              onChange({ ...value, questionFontSize: Number(event.target.value) })
            }
            className="mt-1 w-full accent-emerald-700"
            aria-label="حجم خط الأسئلة"
          />
          <p className="text-[10px] leading-5 text-muted-foreground">
            صغّره إن لم تسع الأسئلة والتوقيعات صفحة واحدة.
          </p>

          <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-2 py-1.5">
            <span className="text-[10px] font-bold text-foreground">البسملة في صدر الورقة</span>
            <input
              type="checkbox"
              checked={value.hideBasmala !== true}
              onChange={(event) => onChange({ ...value, hideBasmala: !event.target.checked })}
              className="h-3.5 w-3.5 accent-emerald-700"
            />
          </label>
        </div>

        {showCommittee && (
          <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
            <h4 className="mb-1 text-xs font-black text-foreground">أعضاء لجنة التحكيم (ثلاثة)</h4>
            <p className="mb-2 text-[10px] leading-5 text-muted-foreground">
              تُدخل أسماؤهم كل مرة عند الطباعة وتُطبع أسفل الورقة.
            </p>
            <div className="space-y-1.5">
              {[0, 1, 2].map((index) => (
                <Input
                  key={index}
                  value={committee[index] ?? ""}
                  onChange={(event) => setCommitteeMember(index, event.target.value)}
                  placeholder={`عضو اللجنة ${index + 1}`}
                  className="h-8 rounded-xl text-xs"
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default PaperLayoutControls;
