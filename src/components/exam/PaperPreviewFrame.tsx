import { useMemo, useState, type SyntheticEvent } from "react";
import { AlertTriangle, CheckCircle2, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPrintDocument } from "@/utils/report";
import { cn } from "@/lib/utils";

/** أبعاد صفحة A4 بالبكسل عند 96dpi (210×297mm). */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

const MIN_SCALE = 0.35;
const MAX_SCALE = 1;
const FITTED_SCALE = 0.55;

/** 96dpi: 1mm = 3.7795px */
const PX_PER_MM = 3.7795275591;

interface Props {
  /** عنوان المستند داخل الإطار */
  title: string;
  /** جسم الورقة (HTML) */
  body: string;
  /** تنسيق الورقة (CSS) */
  css: string;
  /** ارتفاع نافذة المعاينة بالبكسل */
  height?: number;
  /** مجموع الهامش العلوي والسفلي (مم) لحساب المساحة المتاحة في A4 */
  verticalMarginsMm?: number;
  className?: string;
}

/**
 * معاينة حيّة للورقة بمقاس A4 الحقيقي: الإطار بعرض صفحة كاملة ثم يُصغَّر
 * بصريًا، حتى يرى المستخدم مقدار ما يسع في الصفحة (هل الأسئلة والتوقيعات
 * كلها في صفحة واحدة) قبل الطباعة أو التحميل.
 */
export const PaperPreviewFrame = ({
  title,
  body,
  css,
  height = 560,
  verticalMarginsMm = 16,
  className,
}: Props) => {
  const [scale, setScale] = useState(FITTED_SCALE);
  const [fit, setFit] = useState<{ total: number; overflowing: number } | null>(null);
  const document = useMemo(() => buildPrintDocument(title, body, css), [title, body, css]);

  /**
   * فحص ملاءمة كل ورقة لصفحة A4 واحدة بعد رسم الإطار: نقيس ارتفاع `.paper`
   * الفعلي ونقارنه بالمساحة المتاحة (297mm − الهوامش). هذا الفحص يرى نتيجة
   * التنسيق الحقيقية (حجم الخط والهوامش وعدد الأسئلة) بدل التخمين.
   */
  const measureFit = (event: SyntheticEvent<HTMLIFrameElement>) => {
    const doc = event.currentTarget.contentDocument;
    if (!doc) return;
    const papers = Array.from(doc.querySelectorAll<HTMLElement>(".paper"));
    const availablePx = (297 - verticalMarginsMm) * PX_PER_MM;
    setFit({
      total: papers.length,
      overflowing: papers.filter((paper) => paper.getBoundingClientRect().height > availablePx)
        .length,
    });
  };

  const changeScale = (delta: number) =>
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta)));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground">
          معاينة بمقاس A4 — كل ورقة صفحة واحدة، واسحب داخل المعاينة لرؤية بقية الأوراق.
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => changeScale(-0.1)}
            disabled={scale <= MIN_SCALE}
            aria-label="تصغير المعاينة"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => changeScale(0.1)}
            disabled={scale >= MAX_SCALE}
            aria-label="تكبير المعاينة"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-full px-2 text-[11px]"
            onClick={() => setScale(FITTED_SCALE)}
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            ملاءمة
          </Button>
        </div>
      </div>

      <div
        className="overflow-auto rounded-2xl border border-border/70 bg-slate-100 p-2"
        style={{ height }}
      >
        <div
          style={{
            width: A4_WIDTH_PX * scale,
            height: A4_HEIGHT_PX * scale,
            marginInline: "auto",
          }}
        >
          <iframe
            title={title}
            srcDoc={document}
            sandbox="allow-same-origin"
            onLoad={measureFit}
            className="rounded-md border border-border bg-white shadow-lg"
            style={{
              width: A4_WIDTH_PX,
              height: A4_HEIGHT_PX,
              transform: `scale(${scale})`,
              transformOrigin: "top right",
            }}
          />
        </div>
      </div>

      {fit && fit.total > 0 && (
        <p
          className={cn(
            "flex items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold",
            fit.overflowing > 0
              ? "bg-amber-500/10 text-amber-800"
              : "bg-emerald-700/10 text-emerald-800",
          )}
        >
          {fit.overflowing > 0 ? (
            <>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {fit.overflowing} من {fit.total} ورقة أطول من صفحة A4 — قلّل حجم خط الأسئلة أو
                الهوامش ليظهر كل سؤال مع التوقيعات في صفحة واحدة.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>كل الأوراق تسع صفحة A4 واحدة بالأسئلة والتوقيعات.</span>
            </>
          )}
        </p>
      )}
    </div>
  );
};

export default PaperPreviewFrame;
