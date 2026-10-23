/**
 * طبقة حماية إضافية لمستندات الطباعة.
 *
 * تُكتب مستندات الطباعة في نافذة/إطار بنفس أصل التطبيق، فأي سكربت يتسلل عبر
 * اسم طالب أو ملاحظة (مثلاً من ملف Excel مستورد) كان سيعمل بصلاحيات التطبيق
 * ويقرأ جلسة الدخول المخزنة. مستندات الطباعة هنا ساكنة ولا تحتاج أي سكربت،
 * فنحذف السكربتات ومعالجات الأحداث وروابط javascript: قبل الكتابة.
 *
 * هذه دفاعٌ ثانٍ؛ الدفاع الأول هو ترميز القيم بـ esc() عند بناء القالب.
 */
const BLOCKED_SELECTOR = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "base",
  "meta[http-equiv]",
  "link[rel~='import']",
].join(", ");

const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "data"]);

export const sanitizePrintHtml = (html: string): string => {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(BLOCKED_SELECTOR).forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      // إزالة المسافات وأحرف التحكم التي يستعملها المهاجمون لتمويه "javascript:"
      // eslint-disable-next-line no-control-regex
      const value = attr.value.replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
      const dangerousUrl =
        URL_ATTRS.has(name) && (value.startsWith("javascript:") || value.startsWith("vbscript:"));
      if (name.startsWith("on") || dangerousUrl) el.removeAttribute(attr.name);
    }
  });
  return `<!doctype html>${doc.documentElement.outerHTML}`;
};
