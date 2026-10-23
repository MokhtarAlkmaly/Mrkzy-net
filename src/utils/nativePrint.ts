import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { sanitizePrintHtml } from "@/lib/print-sanitize";
import { currentDocumentBase, waitForPrintAssets, withDocumentBase } from "@/lib/print-document";

/**
 * طباعة المستندات داخل التطبيق وعلى الويب.
 *
 * مشكلات كانت تمنع الطباعة تماماً قبل هذا التحديث:
 *
 * 1. كان تحميل `html2canvas` و`jsPDF` يتم عبر import ديناميكي بمعرّف متغيّر
 *    (مع تعليق vite-ignore). Vite يترك المعرّف كما هو في حزمة الإنتاج، فيصير
 *    المتصفح/الـ WebView أمام استيراد بمعرّف غير قابل للحلّ
 *    (Failed to resolve module specifier) ويفشل بصمت — لا طباعة ولا رسالة
 *    خطأ. الآن نستورد الحزمتين استيراداً ديناميكياً عادياً فتُضمَّنان في حزمة
 *    مستقلة تُحمَّل عند الحاجة فقط.
 * 2. كان فتح نافذة الطباعة يحدث بعد `await import("@/utils/nativePrint")`
 *    (أي بعد جلب حزمة من الشبكة)، فيفقد المتصفح «تفاعل المستخدم» وتُحجب
 *    النافذة المنبثقة. الآن تُفتح النافذة داخل نفس نقرة المستخدم مباشرة.
 * 3. أضفنا مساراً بديلاً عبر إطار مخفي إن حُجبت النوافذ المنبثقة، ورسالة
 *    واضحة للمستخدم عند الفشل بدل الصمت.
 */

type Html2Canvas = (typeof import("html2canvas"))["default"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPdfCtor = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPdfDoc = any;

interface PdfToolkit {
  html2canvas: Html2Canvas;
  jsPDF: JsPdfCtor;
}

let pdfToolkitPromise: Promise<PdfToolkit> | null = null;

/** عرض ثابت لصفحة الطباعة قبل التصوير (يقارب عرض A4/A5 أفقي) */
const PRINT_FRAME_WIDTH = 900;
/** حدود آمنة لحجم الصورة: بعض المتصفحات ترفض كانفس أطول من ~16384 بكسل */
const MAX_CANVAS_HEIGHT = 16000;
const MAX_CANVAS_PIXELS = 30_000_000;

/** الحجم الافتراضي للـ PDF */
const DEFAULT_PDF_FORMAT = "a4";
const DEFAULT_PDF_ORIENTATION = "portrait";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** يحمّل (مرة واحدة) أدوات توليد PDF داخل التطبيق المثبَّت. */
const loadPdfToolkit = (): Promise<PdfToolkit> => {
  pdfToolkitPromise ??= Promise.all([import("html2canvas"), import("jspdf")]).then(
    ([html2canvasModule, jsPdfModule]) => ({
      html2canvas: html2canvasModule.default,
      jsPDF: jsPdfModule.jsPDF ?? jsPdfModule.default,
    }),
  );
  return pdfToolkitPromise;
};

/**
 * يختار دقّة التصوير بحيث لا يتجاوز الكانفس حدود المتصفح — مستند طويل
 * (مثل 25 نموذج اختبار) كان يولّد كانفس عملاقاً يفشل تصويره فينتج PDF فارغ.
 */
const pickScale = (elementHeight: number): number => {
  const height = Math.max(elementHeight, 1);
  const byHeight = MAX_CANVAS_HEIGHT / height;
  const byPixels = Math.sqrt(MAX_CANVAS_PIXELS / (PRINT_FRAME_WIDTH * height));
  return Math.max(0.75, Math.min(2, byHeight, byPixels));
};

/**
 * يضيف صورة طويلة إلى ملف PDF بصفحات A4 متتالية — بدل صفحة واحدة عملاقة كانت
 * تُطبع مصغَّرة غير مقروءة عند طباعة كشف طويل أو عشرات النماذج.
 */
const appendCanvasToPdf = (pdf: JsPdfDoc, canvas: HTMLCanvasElement, startOnNewPage: boolean) => {
  const pageWidth: number = pdf.internal.pageSize.getWidth();
  const pageHeight: number = pdf.internal.pageSize.getHeight();
  // ارتفاع الجزء من الصورة الذي يملأ صفحة A4 كاملة
  const sliceHeight = Math.max(1, Math.floor((canvas.width * pageHeight) / pageWidth));
  const pages = Math.max(1, Math.ceil(canvas.height / sliceHeight));

  const slice = document.createElement("canvas");
  slice.width = canvas.width;
  const ctx = slice.getContext("2d");
  if (!ctx) throw new Error("تعذّر تجهيز صفحات الطباعة");

  for (let page = 0; page < pages; page++) {
    const sourceY = page * sliceHeight;
    const height = Math.min(sliceHeight, canvas.height - sourceY);
    if (height <= 0) break;
    slice.height = height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, height, 0, 0, canvas.width, height);
    if (page > 0 || startOnNewPage) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      pageWidth,
      (height * pageWidth) / canvas.width,
    );
  }
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "حدث خطأ غير متوقع أثناء الطباعة";

const isShareCancelled = (error: unknown): boolean => /cancel/i.test(errorMessage(error));

/** يشارك ملف PDF الناتج عبر قائمة مشاركة النظام (حفظ / واتساب / طباعة). */
const sharePdf = async (base64: string, fileName: string) => {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const pdfFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const result = await Filesystem.writeFile({
    path: pdfFileName,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ title: pdfFileName, url: result.uri, dialogTitle: "حفظ أو طباعة" });
};

interface MountedHtml {
  doc: Document;
  /** عناصر التصوير: كل ورقة `.paper` على حدة إن وُجدت، وإلا جسم المستند كله */
  targets: HTMLElement[];
  cleanup: () => void;
}

/**
 * إصلاح التشكيل العربي في ملفات PDF — جذر مشكلة «النص المتراكب».
 *
 * html2canvas يقرأ `letter-spacing` من كل عنصر، وحين يجده غير صفري يقطّع النص
 * إلى محارف منفصلة (breakText ⇒ segmentGraphemes) ويرسمها متتابعة. النص العربي
 * لا يحتمل ذلك: تنفصل الحروف عن مواضع وصلها، وتختل مواضع التشكيل، فتظهر
 * تسميةٌ فوق تسمية وكلمةٌ فوق كلمة — وهو ما رآه المستخدم في ملفات PDF سابقًا
 * رغم أن الورقة سليمة تمامًا في المتصفح.
 *
 * الحل: صفرُ تباعد الحروف قبل التصوير، على كل عنصر. تباعد الحروف في العربية
 * زخرفة لا تكاد تُرى في الطباعة، وثمنها إفساد النص كله في ملف PDF.
 * (تباعد الكلمات `word-spacing` لا يسبب المشكلة، فلا نمسّه.)
 */
const ARABIC_SHAPING_FIX_CSS = `*, *::before, *::after { letter-spacing: 0 !important; }`;

/** يضيف إصلاح التشكيل إلى مستند الطباعة قبل تصويره، ويُرجع العنصر لإزالته. */
const applyArabicShapingFix = (doc: Document): HTMLStyleElement | null => {
  if (!doc.head) return null;
  const style = doc.createElement("style");
  style.setAttribute("data-print-shaping-fix", "true");
  style.textContent = ARABIC_SHAPING_FIX_CSS;
  doc.head.appendChild(style);
  return style;
};

/* ==================================================================
 * تصوير الورقة بمحرّك المتصفح نفسه — لا بخطاط html2canvas
 * ==================================================================
 *
 * html2canvas يرسم النص حرفًا حرفًا على canvas، وفهمه لخصائص العربية محدود:
 * التشكيل، ووصل الحروف في الخطوط الرقعة (عناوين الورقة)، والشرطة «/» داخل
 * الكلمة — كلها كانت تخرج مشوّهة في PDF بينما الورقة سليمة في المتصفح.
 *
 * الحل: `foreignObjectRendering` يجعل المتصفح يرسم المستند كاملًا (بنفس محرّك
 * الطباعة والشاشة) ثم يأخذ منه صورة. لكن الصورة تُركَّب في SVG مستقل، فلا تصل
 * إليها ملفات الخطوط والشعار بالمسار النسبي — لذلك نضمّنها data: قبل الرسم.
 */

/** ذاكرة مؤقتة لملفات الخطوط المضمّنة (base64) — تُقرأ مرة واحدة. */
const inlinedAssetCache = new Map<string, string>();

/** يقرأ ملفًا من الموقع ويُرجع data: URL — أو null إن تعذّر. */
const toDataUrl = async (url: string): Promise<string | null> => {
  const cached = inlinedAssetCache.get(url);
  if (cached) return cached;
  // لا تجلب الطباعة أصلاً خارجياً: الأصول البعيدة تُترك كما هي بدلاً من
  // تحويل ميزة أوفلاين إلى طلب شبكة خفي. ملفات التطبيق المحلية فقط تُضمّن.
  if (/^(?:https?:)?\/\//i.test(url)) {
    try {
      if (
        typeof window === "undefined" ||
        new URL(url, window.location.href).origin !== window.location.origin
      ) {
        return null;
      }
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    inlinedAssetCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
};

/**
 * يضمّن خطوط المستند وصوره داخل الـ DOM، فلا تحتاج الصورة الناتجة إلى الشبكة.
 * يُرجع دالة تراجع كل ما غيّره.
 */
const inlineDocumentAssets = async (doc: Document): Promise<() => void> => {
  const undo: (() => void)[] = [];
  const faceRules: string[] = [];

  // 1) ملفات @font-face: نقرأ كل قاعدة ونعيد كتابتها في <style> جديد بملف مضمّن.
  //    إضافة <style> صريحة (لا تعديل قاعدة قائمة) ضرورية: html2canvas ينسخ
  //    صفحات الأنماط إلى مستند النسخة، والقاعدة المضافة تُنسخ كما هي.
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // ورقة من أصل آخر: لا يمكن قراءتها
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const src = rule.style.getPropertyValue("src");
      const match = src.match(/url\((['"]?)([^'")]+)\1\)/);
      if (!match) continue;
      const url = match[2];
      if (url.startsWith("data:")) continue;
      const dataUrl = await toDataUrl(url);
      if (!dataUrl) continue;
      const family = rule.style.getPropertyValue("font-family");
      const weight = rule.style.getPropertyValue("font-weight") || "400";
      const style = rule.style.getPropertyValue("font-style") || "normal";
      const range = rule.style.getPropertyValue("unicode-range");
      const format = url.endsWith(".ttf") ? "truetype" : "woff2";
      faceRules.push(
        // swap لا block: لو تعذّر ترميز خط لأي سبب ظهر النص بخط بديل فورًا
        // بدل أن يبقى مخفيًا حتى انتهاء مهلة الحجب. الانتظار هنا صريح أدناه
        // (`doc.fonts.ready`) فلا نخسر دقة الخط عند نجاح التحميل.
        `@font-face{font-family:${family};font-style:${style};font-weight:${weight};font-display:swap;` +
          `src:url("${dataUrl}") format("${format}");` +
          (range ? `unicode-range:${range};` : "") +
          `}`,
      );
    }
  }

  if (faceRules.length > 0 && doc.head) {
    const styleEl = doc.createElement("style");
    styleEl.setAttribute("data-inlined-fonts", "true");
    styleEl.textContent = faceRules.join("\n");
    doc.head.appendChild(styleEl);
    undo.push(() => styleEl.remove());
  }

  // 2) الشعارات والصور
  for (const img of Array.from(doc.images)) {
    const src = img.getAttribute("src") ?? "";
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
    const dataUrl = await toDataUrl(img.currentSrc || src);
    if (!dataUrl) continue;
    img.setAttribute("src", dataUrl);
    undo.push(() => img.setAttribute("src", src));
  }

  if (doc.fonts?.ready) await doc.fonts.ready.catch(() => undefined);
  return () => undo.forEach((fn) => fn());
};

/** هل الصورة الناتجة فارغة؟ (foreignObject قد يفشل بلا استثناء) */
const isBlankCanvas = (canvas: HTMLCanvasElement): boolean => {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const { width, height } = canvas;
    if (!width || !height) return true;
    const sample = ctx.getImageData(0, 0, Math.min(width, 600), Math.min(height, 600)).data;
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i] < 250 || sample[i + 1] < 250 || sample[i + 2] < 250) return false;
    }
    return true;
  } catch {
    return false;
  }
};

type Html2CanvasFn = Html2Canvas;

/**
 * يصوّر ورقة واحدة بأفضل مسار متاح:
 *  ١) رسم المتصفح الأصلي (foreignObject) — تشكيل عربي صحيح ومطابق للمعاينة.
 *  ٢) إن فشل أو خرجت صورة فارغة: مسار html2canvas المعتاد.
 */
const renderElementToCanvas = async (
  html2canvas: Html2CanvasFn,
  element: HTMLElement,
  doc: Document,
): Promise<HTMLCanvasElement> => {
  const options = {
    scale: pickScale(element.scrollHeight || 1),
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    windowWidth: PRINT_FRAME_WIDTH,
  } as const;

  try {
    const undo = await inlineDocumentAssets(doc);
    try {
      const canvas = await html2canvas(element, { ...options, foreignObjectRendering: true });
      if (!isBlankCanvas(canvas)) return canvas;
    } finally {
      undo();
    }
  } catch (error) {
    console.warn("Native-render print failed, falling back to html2canvas:", error);
  }

  return html2canvas(element, options);
};

/**
 * يكتب مستند الطباعة بعد تنقيته وبعد حقن `<base href>` بأصل التطبيق.
 *
 * الخطوة الثانية ليست تحسينًا: مستند يُكتب في نافذة/إطار جديد عنوانه
 * `about:blank`، وهذا العنوان بلا أصل فلا تُحلّ عليه المسارات المطلقة
 * (`/fonts/…`، `/brand/…`). بدونها لا يُحمَّل خط ولا شعار، ومع
 * `font-display: block` يختفي النص كله من الطباعة. التفاصيل في `print-document`.
 */
const writePrintDocument = (target: Document, fullHtml: string): void => {
  const baseHref = currentDocumentBase();
  target.open();
  target.write(withDocumentBase(sanitizePrintHtml(fullHtml), baseHref));
  target.close();
};

/** يعرض مستند HTML داخل إطار مخفي ويجهّزه للتصوير. */
const mountHtmlDocument = async (fullHtml: string): Promise<MountedHtml> => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.top = "-99999px";
  iframe.style.left = "-99999px";
  iframe.style.width = `${PRINT_FRAME_WIDTH}px`;
  iframe.style.height = "1px";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* تجاهل */
    }
  };

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("تعذّر تجهيز مستند الطباعة");
    writePrintDocument(doc, fullHtml);

    // انتظار اكتمال التحميل (مع مهلة أمان إن لم يصل الحدث)
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      iframe.addEventListener("load", finish, { once: true });
      window.setTimeout(finish, 1500);
    });
    // مهلة بسيطة لضمان اكتمال رسم الخطوط والتنسيق قبل التصوير
    await delay(400);

    if (!doc.body || doc.body.innerHTML.trim().length === 0) {
      throw new Error("تعذّر تحميل محتوى الطباعة");
    }
    applyArabicShapingFix(doc);
    doc.body.style.width = `${PRINT_FRAME_WIDTH}px`;
    iframe.style.height = `${doc.body.scrollHeight}px`;
    await delay(150);

    const papers = Array.from(doc.body.querySelectorAll<HTMLElement>(".paper"));
    const targets: HTMLElement[] = papers.length > 0 ? papers : [doc.body];
    return { doc, targets, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
};

/** يبني ملف PDF من مستند HTML (صفحات متتالية). */
const buildPdfFromHtml = async (
  fullHtml: string,
  pdfFormat = DEFAULT_PDF_FORMAT,
  pdfOrientation = DEFAULT_PDF_ORIENTATION,
): Promise<JsPdfDoc> => {
  const { html2canvas, jsPDF } = await loadPdfToolkit();
  const { doc, targets, cleanup } = await mountHtmlDocument(fullHtml);

  try {
    const pdf = new jsPDF({ orientation: pdfOrientation, unit: "pt", format: pdfFormat });
    for (let index = 0; index < targets.length; index++) {
      const element = targets[index];
      const canvas = await renderElementToCanvas(html2canvas, element, doc);
      // كل ورقة `.paper` تبدأ من صفحة جديدة (مثل فواصل الصفحات بالطباعة)
      appendCanvasToPdf(pdf, canvas, index > 0);
    }
    return pdf;
  } finally {
    cleanup();
  }
};

/**
 * مسار التطبيق المثبَّت (أندرويد): WebView لا يدعم `window.print()`، لذا
 * نولّد PDF حقيقياً بعدة صفحات ثم نفتح قائمة مشاركة النظام (حفظ/واتساب/
 * الطابعات المثبَّتة).
 */
const printHtmlAsPdf = async (
  fullHtml: string,
  fileName: string,
  pdfFormat = DEFAULT_PDF_FORMAT,
  pdfOrientation = DEFAULT_PDF_ORIENTATION,
): Promise<void> => {
  const pdf = await buildPdfFromHtml(fullHtml, pdfFormat, pdfOrientation);
  const base64 = String(pdf.output("datauristring")).split(",")[1] ?? "";
  if (!base64) throw new Error("تعذّر تجهيز ملف الطباعة");
  await sharePdf(base64, fileName);
};

/**
 * مسار المتصفح (1): نافذة طباعة جديدة. الأهم هنا أن الاستدعاء يتم داخل نفس
 * نقرة المستخدم قبل أي `await`، وإلا حجبته مانعة النوافذ المنبثقة.
 */
const printInNewWindow = (fullHtml: string): boolean => {
  let printWindow: Window | null = null;
  try {
    printWindow = window.open("", "_blank");
  } catch {
    printWindow = null;
  }
  if (!printWindow) return false;

  try {
    writePrintDocument(printWindow.document, fullHtml);
  } catch (error) {
    console.error("Print window write failed:", error);
    try {
      printWindow.close();
    } catch {
      /* تجاهل */
    }
    return false;
  }

  let printed = false;
  const runPrint = () => {
    if (printed) return;
    printed = true;
    try {
      printWindow?.focus();
      printWindow?.print();
    } catch (error) {
      console.error("window.print() failed:", error);
    }
  };

  // الطباعة لا تبدأ قبل اكتمال الخطوط والشعارات: المتصفح لا ينتظرها في `load`،
  // وقد تُطبع الورقة بخط بديل أو شعار ناقص إن سُبقت.
  const prepareAndPrint = async () => {
    if (printed) return;
    await waitForPrintAssets(printWindow?.document);
    runPrint();
  };

  try {
    printWindow.focus();
  } catch {
    /* تجاهل */
  }
  if (printWindow.document.readyState === "complete") {
    window.setTimeout(() => void prepareAndPrint(), 250);
  } else {
    printWindow.addEventListener(
      "load",
      () => window.setTimeout(() => void prepareAndPrint(), 250),
      {
        once: true,
      },
    );
    // مهلة أمان إن تأخر حدث load (اتصال بطيء أو خطوط خارجية)
    window.setTimeout(() => void prepareAndPrint(), 1500);
  }
  return true;
};

/**
 * مسار المتصفح (2) — بديل عند حجب النوافذ المنبثقة أو داخل PWA بشاشة
 * مستقلة: طباعة مستند داخل إطار مخفي. الإطار يبقى مرسوماً (لا `display:none`)
 * لكنه بحجم 1px حتى لا تطبع المتصفحات صفحة فارغة.
 */
const printInIframe = (fullHtml: string): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    let printed = false;
    let frame: HTMLIFrameElement | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const cleanup = () => {
      try {
        frame?.remove();
      } catch {
        /* تجاهل */
      }
    };

    try {
      frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("title", "طباعة");
      frame.style.position = "fixed";
      frame.style.top = "0";
      frame.style.left = "0";
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.border = "0";
      frame.style.opacity = "0";
      frame.style.pointerEvents = "none";
      document.body.appendChild(frame);

      const frameWindow = frame.contentWindow;
      const frameDoc = frame.contentDocument;
      if (!frameWindow || !frameDoc) {
        cleanup();
        finish(false);
        return;
      }

      frameWindow.addEventListener(
        "afterprint",
        () => {
          finish(true);
          window.setTimeout(cleanup, 500);
        },
        { once: true },
      );

      const runPrint = async () => {
        if (printed) return;
        printed = true;
        // لا تُطبع الورقة قبل تحميل خطوطها وشعاراتها — انظر `print-document`.
        await waitForPrintAssets(frameDoc);
        try {
          frameWindow.focus();
          frameWindow.print();
          finish(true);
        } catch (error) {
          console.error("iframe print failed:", error);
          cleanup();
          finish(false);
        }
      };

      writePrintDocument(frameDoc, fullHtml);

      if (frameDoc.readyState === "complete") {
        window.setTimeout(() => void runPrint(), 300);
      } else {
        frameWindow.addEventListener("load", () => window.setTimeout(() => void runPrint(), 300), {
          once: true,
        });
      }
      // مهلة أمان أخيرة، ثم تنظيف الإطار بعد مدة كافية
      window.setTimeout(() => void runPrint(), 2000);
      window.setTimeout(cleanup, 60000);
    } catch (error) {
      console.error("Iframe print failed:", error);
      cleanup();
      finish(false);
    }
  });

/**
 * يطبع مستند HTML كامل (نفس ما كان يُمرَّر سابقاً لنافذة window.open + print):
 * - بالمتصفح العادي: نافذة طباعة جديدة (أو إطار مخفي إن حُجبت النوافذ).
 * - داخل تطبيق Capacitor المثبَّت: PDF فعلي بعدة صفحات عبر قائمة المشاركة.
 *
 * تُعيد `true` عند بدء الطباعة بنجاح، و`false` مع رسالة للمستخدم عند الفشل.
 */
export const printHtmlDocument = async (
  fullHtml: string,
  fileName: string,
  pdfFormat = DEFAULT_PDF_FORMAT,
  pdfOrientation = DEFAULT_PDF_ORIENTATION,
): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
    try {
      await printHtmlAsPdf(fullHtml, fileName, pdfFormat, pdfOrientation);
      return true;
    } catch (error) {
      console.error("Native print failed:", error);
      if (!isShareCancelled(error)) {
        toast({
          title: "تعذّر تجهيز ملف الطباعة",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
      return false;
    }
  }

  if (printInNewWindow(fullHtml)) return true;

  const ok = await printInIframe(fullHtml);
  if (!ok) {
    toast({
      title: "تعذّر فتح نافذة الطباعة",
      description:
        "اسمح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع ثم أعد المحاولة، أو استخدم الطباعة من قائمة المتصفح.",
      variant: "destructive",
    });
  }
  return ok;
};

/**
 * يطبع الصفحة الحالية المعروضة على الشاشة (تستخدم عناصر بصنف print:hidden
 * لإخفاء أزرار التحكم كما بمنطق CSS الطباعة العادي بالمتصفح).
 */
export const printCurrentPage = async (fileName = "طباعة"): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    window.print();
    return true;
  }

  const styleEl = document.createElement("style");
  styleEl.id = "native-print-style";
  styleEl.textContent = `.native-printing-hide { display: none !important; }`;
  document.head.appendChild(styleEl);
  const hiddenEls = Array.from(document.querySelectorAll(".print\\:hidden"));
  hiddenEls.forEach((el) => el.classList.add("native-printing-hide"));
  let shapingFixEl: HTMLStyleElement | null = null;

  try {
    const { html2canvas, jsPDF } = await loadPdfToolkit();
    shapingFixEl = applyArabicShapingFix(document);
    await delay(150);
    const canvas = await renderElementToCanvas(html2canvas, document.body, document);
    const pdf = new jsPDF({
      orientation: DEFAULT_PDF_ORIENTATION,
      unit: "pt",
      format: DEFAULT_PDF_FORMAT,
    });
    appendCanvasToPdf(pdf, canvas, false);
    const base64 = String(pdf.output("datauristring")).split(",")[1] ?? "";
    if (!base64) throw new Error("تعذّر تجهيز ملف الطباعة");
    await sharePdf(base64, fileName);
    return true;
  } catch (error) {
    console.error("Native page print failed:", error);
    if (!isShareCancelled(error)) {
      toast({
        title: "تعذّر تجهيز ملف الطباعة",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
    return false;
  } finally {
    hiddenEls.forEach((el) => el.classList.remove("native-printing-hide"));
    shapingFixEl?.remove();
    styleEl.remove();
  }
};

/**
 * ينزّل (أو يشارك) المستند كملف PDF جاهز للطباعة — مسار مضمون لا يعتمد على
 * نافذة الطباعة ولا على مانع النوافذ المنبثقة: يُنشئ PDF بصفحات ويحفظه
 * مباشرة (تنزيل بالمتصفح / مشاركة داخل التطبيق المثبَّت).
 */
export const exportHtmlAsPdf = async (
  fullHtml: string,
  fileName: string,
  pdfFormat = DEFAULT_PDF_FORMAT,
  pdfOrientation = DEFAULT_PDF_ORIENTATION,
): Promise<boolean> => {
  try {
    const pdf = await buildPdfFromHtml(fullHtml, pdfFormat, pdfOrientation);
    const pdfFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;

    if (Capacitor.isNativePlatform()) {
      const base64 = String(pdf.output("datauristring")).split(",")[1] ?? "";
      if (!base64) throw new Error("تعذّر تجهيز ملف الطباعة");
      await sharePdf(base64, fileName);
      return true;
    }

    const blob = pdf.output("blob") as Blob;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = pdfFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (error) {
    console.error("PDF export failed:", error);
    if (!isShareCancelled(error)) {
      toast({
        title: "تعذّر تجهيز ملف PDF",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
    return false;
  }
};

/** يشارك نصاً (مثل رسالة واتساب) — داخل التطبيق عبر قائمة المشاركة الأصلية. */
export const shareText = async (text: string, waFallbackUrl?: string) => {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({ text });
      return;
    } catch (error) {
      if (!isShareCancelled(error)) throw error;
      return;
    }
  }
  window.open(waFallbackUrl || `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
};
