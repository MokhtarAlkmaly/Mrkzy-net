/**
 * أدوات تجهيز مستند الطباعة قبل كتابته في نافذة أو إطار.
 *
 * المشكلة التي وُلد منها هذا الملف: مستندات الطباعة تُكتب بـ `document.write`
 * في نافذة جديدة (`window.open("")`) أو إطار بلا `src`، وعنوان المستند في
 * الحالتين `about:blank`. وعندها **لا تُحلّ المسارات المطلقة** التي تبدأ بشرطة
 * (`/fonts/noto-naskh-700.woff2`، `/brand/logo-mark.png`) لأن `about:blank`
 * بلا أصل (opaque origin) لا يصلح أساسًا لحلّ العناوين.
 *
 * النتيجة كانت: الشعارات تخرج مربّعات فارغة، والخطوط لا تُحمَّل أبدًا. وبما أن
 * `@font-face` كان بـ `font-display: block` (نص مخفي حتى ٣ ثوانٍ في انتظار
 * الخط)، والطباعة تُستدعى بعد أقل من ثانية، كان **كل نص في الورقة يختفي** عند
 * الطباعة بينما تبقى الحدود والمربّعات — وهي الشكوى التي وصلت حرفيًا:
 * «بعد تنفيذ أمر الطباعة يختفي كل شيء».
 *
 * الحل هنا: حقن `<base href>` بأصل التطبيق قبل الكتابة (فتُحلّ المسارات كما في
 * الصفحة الأصلية)، والانتظار المحدود لاكتمال تحميل الخطوط والصور قبل استدعاء
 * الطباعة.
 */

/**
 * يحقن `<base href>` في المستند.
 *
 * يجب أن يُستدعى **بعد** `sanitizePrintHtml`: التنقية تحذف أي `<base>` قادم مع
 * المحتوى (دفاعًا ضد توجيه الطلبات إلى أصل آخر)، ثم نضيف نحن القيمة الموثوقة
 * المشتقة من `document.baseURI` للتطبيق نفسه.
 */
export const withDocumentBase = (html: string, baseHref: string): string => {
  if (!baseHref) return html;
  const base = `<base href="${baseHref.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (tag) => `${tag}${base}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${base}</head>`);
  }
  return `${base}${html}`;
};

/** أصل المستند الحالي — الأساس الذي تُحلّ عليه مسارات `/fonts` و`/brand`. */
export const currentDocumentBase = (): string => {
  try {
    return document.baseURI || document.location?.href || "";
  } catch {
    return "";
  }
};

/**
 * ينتظر اكتمال تحميل خطوط المستند، بمهلة قصوى.
 *
 * `document.fonts.ready` يحلّ عندما لا يبقى أي تحميل خط معلّق. نضيف مهلة لأن
 * الطباعة لا يجوز أن تعلق إن تعذّر تحميل خط (شبكة مقطوعة، ملف مفقود): بعد
 * المهلة نطبع بالخط المتاح، والورقة تبقى مقروءة لأن `font-display: swap`.
 */
export const waitForDocumentFonts = async (
  doc: Document | null | undefined,
  timeoutMs = 3000,
): Promise<void> => {
  const fonts = doc?.fonts;
  if (!fonts?.ready) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([fonts.ready.catch(() => undefined), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/**
 * ينتظر جاهزية صور المستند (الشعارات) للرسم، بمهلة قصوى.
 *
 * الصور تُجلب بعد حدث `load` أحيانًا (خادم بطيء، شبكة جوّال)، والمهلة
 * الاحتياطية في مسار الطباعة قد تسبقها فتُطبع الورقة بمربّعات فارغة مكان
 * الشعار. `decode()` يحلّ عند جهوزية الصورة للرسم فعلًا.
 */
export const waitForDocumentImages = async (
  doc: Document | null | undefined,
  timeoutMs = 3000,
): Promise<void> => {
  const images = Array.from(doc?.images ?? []);
  const pending = images.filter((img) => !img.complete || img.naturalWidth === 0);
  if (pending.length === 0) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([
      Promise.all(
        pending.map((img) =>
          typeof img.decode === "function"
            ? img.decode().catch(() => undefined)
            : Promise.resolve(undefined),
        ),
      ),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/**
 * يجهّز المستند للطباعة: ينتظر الخطوط والصور معًا (كلٌّ بمهلته)، فلا تُطبع
 * الورقة بنص مخفي أو شعارات ناقصة.
 */
export const waitForPrintAssets = async (
  doc: Document | null | undefined,
  timeoutMs = 3000,
): Promise<void> => {
  await Promise.all([waitForDocumentFonts(doc, timeoutMs), waitForDocumentImages(doc, timeoutMs)]);
};
