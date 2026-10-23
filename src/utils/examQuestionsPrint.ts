import type { ExamQuestion } from "@/lib/exam-questions";
import {
  PAPER_FONT_BODY,
  PAPER_FONT_FACES,
  PAPER_FONT_HEAD,
  PAPER_FONT_QUESTION,
} from "@/utils/paper-fonts";
import { esc } from "@/utils/report";

/**
 * طباعة «أسئلة الاختبارات» (بنك الأسئلة) بالشكل المعتمد من إدارة المركز.
 *
 * المرجع البصري: ملف `أسئلة_1448.pdf` الذي أرسلته الإدارة:
 *  - عنوان أخضر في الوسط بخط نسخي عريض، تحته خط أفقي أخضر بعرض الصفحة.
 *  - نص السؤال في الوسط بخط نسخي عريض (ومنه الاقتباس بين ﴿ ﴾) بخطٍّ واحد،
 *    فلا يظهر نصف السؤال بخط مصحفي ونصفه الآخر بخط آخر.
 *  - سطر «الإجابة: …» أخضر في الوسط أسفل السؤال.
 *
 * سبب وجود الملف: طباعة البنك كانت تعتمد على الخط الافتراضي للمتصفح (لأن
 * إعلان `font-family` في مستند الطباعة كان معطوبًا)، فتخرج بأي خط نظام.
 * هنا نُضمّن خطوط `public/fonts` نفسها المستخدمة في أوراق النماذج.
 */

/** عنوان المستند كما يُطبع — مثال: «بنك أسئلة الاختبارات — 1448هـ — فئة الحفظ: جزء عمّ» */
export const questionsPrintTitle = (
  year: string,
  categoryLabel?: string,
  subjectLabel?: string,
): string => {
  const parts = [`بنك أسئلة الاختبارات — ${year}هـ`];
  if (categoryLabel) parts.push(`فئة الحفظ: ${categoryLabel}`);
  if (subjectLabel) parts.push(`المادة: ${subjectLabel}`);
  return parts.join(" — ");
};

export const QUESTIONS_PRINT_CSS = `
  /* خطوط محلّية مضمّنة — لا اعتماد على خطوط الجهاز */
${PAPER_FONT_FACES}

  :root {
    --font-body: ${PAPER_FONT_BODY};
    --font-head: ${PAPER_FONT_HEAD};
    --font-question: ${PAPER_FONT_QUESTION};
    --brand: #0e6b3a;
    --ink: #111827;
  }

  @page { size: A4 portrait; margin: 15mm 14mm; }

  body {
    margin: 0;
    padding: 0;
    color: var(--ink);
    background: #fff;
    font-family: var(--font-question);
    font-weight: 700;
    -webkit-font-smoothing: antialiased;
  }

  /* العنوان: أخضر في الوسط وخط أفقي أخضر بعرض المحتوى تحته (كالنموذج) */
  .doc-head {
    margin: 0 0 9mm;
    padding: 0 0 3mm;
    text-align: center;
    color: var(--brand);
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 14pt;
    line-height: 1.7;
    border-bottom: 1.6px solid var(--brand);
  }

  /* كل سؤال كتلة مستقلة لا تُقسم بين صفحتين */
  .q-card {
    margin: 0 0 7mm;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .q-text {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-question);
    font-weight: 700;
    font-size: 15pt;
    /* النسخي يحتاج ارتفاع سطر أوسع حتى لا تتلامس الحركات */
    line-height: 1.95;
  }

  .q-no {
    color: var(--brand);
    font-size: 0.85em;
    margin-inline-end: 1mm;
  }

  /* خيارات الاختيار من متعدد: عمود واحد واضح تحت السؤال */
  .q-choices {
    display: inline-block;
    margin: 1.5mm auto 0;
    padding: 0;
    list-style: none;
    text-align: start;
    font-family: var(--font-question);
    font-weight: 700;
    font-size: 12pt;
    line-height: 1.85;
  }

  .q-choices li { padding-inline-start: 1mm; }

  /* سطر الإجابة: أخضر في الوسط أسفل السؤال (كالنموذج) */
  .q-answer {
    margin: 1.5mm 0 0;
    color: var(--brand);
    font-family: var(--font-question);
    font-weight: 700;
    font-size: 11.5pt;
    line-height: 1.8;
  }

  .q-answer .label { font-weight: 700; }

  /* على الشاشة (المعاينة) نحاكي هوامش الصفحة حتى يطابق العرض الطباعة */
  @media screen {
    html, body {
      margin: 0 !important;
      padding: 15mm 14mm !important;
      background: #fff !important;
      box-sizing: border-box;
    }
  }

  @media print {
    html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
  }
`;

/**
 * أرقام عربية-هندية (١ ٢ ٣) لترقيم الأسئلة: الأرقام اللاتينية داخل سياق عربي
 * تُقلب مع علامة الترقيم المحيطة بها في بعض محركات العرض، فتظهر «(1» بدل «1)».
 */
const arabicDigits = (value: number): string =>
  String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);

/** سطر الإجابة: الإجابة الصحيحة، ثم ملاحظة المعلم/ة إن وُجدت. */
const answerLine = (row: ExamQuestion): string => {
  const answer = (row.correct_answer ?? "").trim();
  const note = (row.notes ?? "").trim();
  const text = [answer, note].filter(Boolean).join(" — ");
  return `<p class="q-answer"><span class="label">الإجابة:</span> ${
    text ? esc(text) : "................................"
  }</p>`;
};

/** جسم المستند (HTML) — يُمرَّر إلى `buildPrintDocument` مع `QUESTIONS_PRINT_CSS`. */
export const buildQuestionsPrintBody = (
  rows: ExamQuestion[],
  options: { year: string; categoryLabel?: string; subjectLabel?: string },
): string => {
  const title = questionsPrintTitle(options.year, options.categoryLabel, options.subjectLabel);

  const items = rows
    .map((row, index) => {
      const choices =
        row.question_type === "mcq" && row.choices.length
          ? `<ul class="q-choices">${row.choices
              .map((choice) => `<li>• ${esc(choice)}</li>`)
              .join("")}</ul>`
          : "";
      return `
      <article class="q-card">
        <p class="q-text"><span class="q-no">${arabicDigits(index + 1)}.</span> ${esc(row.question)}</p>
        ${choices}
        ${answerLine(row)}
      </article>`;
    })
    .join("");

  return `
    <h1 class="doc-head">${esc(title)}</h1>
    ${items || `<p class="q-answer">لا توجد أسئلة في هذا الفلتر.</p>`}
  `;
};
