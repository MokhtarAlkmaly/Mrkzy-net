import { esc } from "@/utils/report";
import {
  ATTENDANCE_MARKS,
  BEHAVIOR_MARKS,
  HIFZ_TOTAL_MARKS,
  PAPER_TOTAL_MARKS,
  QUESTIONS_TOTAL_MARKS,
  RECITATION_TOTAL_MARKS,
  TEACHER_TOTAL_MARKS,
  hifzQuestionMarks,
  recitationQuestionMarks,
} from "@/lib/exam-marks";
import { calculateGrade } from "@/utils/calculations";
import {
  type ExamPaper,
  type PaperQuestion,
  formatQuestionRef,
  formatQuestionText,
  studentTitle,
} from "@/utils/examPaperGenerator";
import {
  PAPER_FONT_BODY,
  PAPER_FONT_FACES,
  PAPER_FONT_HEAD,
  PAPER_FONT_QURAN,
  PAPER_FONT_QURAN_BRACKET,
} from "@/utils/paper-fonts";

/**
 * بناء أوراق الطباعة لنماذج الاختبار: ورقة النموذج + مفتاح التصحيح + نتيجة
 * ولي الأمر. دوال نصية بحتة (بدون React) لتسهيل الاختبار وإعادة الاستخدام.
 */

/**
 * بيانات طالب تُطبع في ورقة النموذج بدل الخانات الفارغة.
 * تُمرَّر عند توليد نماذج مخصصة من جدول المسابقة، وتُترك فارغة عند
 * توليد نماذج عامة غير مرتبطة بأسماء.
 */
export interface PaperStudentContext {
  name?: string;
  teacher?: string;
  gender?: string;
  /**
   * الحفظ السابق: الإجمالي التراكمي للعام السابق (`baseHifz`) — للعرض في
   * شريحة «الحفظ السابق».
   */
  baseHifz?: number;
  /** الحفظ الجديد الناتج من المتابعة الشهرية (`parts`) — شريحة «الحفظ الجديد». */
  parts?: number;
  /** الإجمالي التراكمي = السابق + الجديد، ومنه فئة النموذج. */
  totalHifz?: number;
  /** اسم فئة الحفظ المعروضة (مثال: «5 أجزاء») */
  categoryLabel?: string;
  /** ترتيب الطالب داخل فئته وعدد طلاب الفئة */
  orderInCategory?: number;
  categoryTotal?: number;
}

/** هوامش الورقة بالمليمتر — تُضبط من المعاينة قبل الطباعة. */
export interface PaperMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** ألوان خطوط الورقة — تُضبط من المعاينة قبل الطباعة. */
export interface PaperColors {
  /** لون النص العام (التعليمات والفقرات) */
  ink: string;
  /** اسم الطالب */
  name: string;
  /** فئة الحفظ التراكمي */
  category: string;
  /** الحفظ السابق */
  previous: string;
  /** الحفظ الجديد */
  current: string;
  /** اسم المعلمة */
  teacher: string;
  /** نص الأسئلة */
  question: string;
  /** منطقة التوقيعات */
  signature: string;
}

/** خيارات تنسيق الورقة القابلة للتعديل من المعاينة قبل الطباعة. */
export interface PaperLayoutOptions {
  margins?: Partial<PaperMargins>;
  colors?: Partial<PaperColors>;
  /** حجم خط الأسئلة بالنقاط (pt) — يساعد على إبقاء الورقة في صفحة A4 واحدة. */
  questionFontSize?: number;
  /** أسماء أعضاء لجنة التحكيم (تُدخل كل مرة عند الطباعة) */
  committee?: string[];
  /** إخفاء منطقة التوقيعات (افتراضيًا تظهر) */
  hideSignatures?: boolean;
  /** عنوان المسابقة المطبوع في الترويسة */
  competitionLabel?: string;
  /** إخفاء البسملة من صدر الورقة (تظهر افتراضيًا) */
  hideBasmala?: boolean;
}

export const DEFAULT_PAPER_MARGINS: PaperMargins = { top: 8, bottom: 8, left: 8, right: 8 };

/**
 * ألوان المصحف: زمردي داكن للاسم، ذهبٌ للحفظ، وحبرٌ أخضر للأسئلة — بلا ألوان
 * صارخة تُشتّت العين عن النص القرآني.
 */
export const DEFAULT_PAPER_COLORS: PaperColors = {
  ink: "#22322a",
  name: "#0b5b3c",
  category: "#0f6b47",
  previous: "#8a672a",
  current: "#a2702a",
  teacher: "#4a5f6b",
  question: "#12211a",
  signature: "#22322a",
};

export const DEFAULT_QUESTION_FONT_SIZE = 11.5;

/**
 * حجم الخط المقترح حسب أكبر عدد أسئلة في ورقة واحدة (حفظ + تلاوة).
 * عدد أكبر ⇒ خط أصغر، ليبقى كل شيء (الأسئلة + التوقيعات) في صفحة A4 واحدة.
 * المستخدم يستطيع تجاوز الاقتراح من المعاينة.
 */
export const suggestQuestionFontSize = (maxQuestions: number): number => {
  if (!Number.isFinite(maxQuestions) || maxQuestions <= 0) return DEFAULT_QUESTION_FONT_SIZE;
  if (maxQuestions >= 10) return 9.5;
  if (maxQuestions >= 8) return 10;
  if (maxQuestions >= 6) return 10.5;
  return DEFAULT_QUESTION_FONT_SIZE;
};

/** ألوان جاهزة تُختار بنقرة واحدة في المعاينة. */
export const PAPER_COLOR_PRESETS: {
  id: string;
  label: string;
  colors: PaperColors;
}[] = [
  {
    id: "mushaf",
    label: "مصحفي (زمردي · ذهبي)",
    colors: { ...DEFAULT_PAPER_COLORS },
  },
  {
    id: "green",
    label: "زمردي موحّد",
    colors: {
      ink: "#123a29",
      name: "#0b5b3c",
      category: "#0f6b47",
      previous: "#146b52",
      current: "#17774f",
      teacher: "#0f5f4c",
      question: "#0a2c1d",
      signature: "#123a29",
    },
  },
  {
    id: "black",
    label: "حبر أسود للطباعة الاقتصادية",
    colors: {
      ink: "#111827",
      name: "#111827",
      category: "#111827",
      previous: "#111827",
      current: "#111827",
      teacher: "#111827",
      question: "#000000",
      signature: "#111827",
    },
  },
  {
    id: "manuscript",
    label: "مخطوط (بنّي · ذهبي)",
    colors: {
      ink: "#3b2a17",
      name: "#5b3a1e",
      category: "#8a672a",
      previous: "#6b4a22",
      current: "#a2702a",
      teacher: "#4a3520",
      question: "#2a1d10",
      signature: "#3b2a17",
    },
  },
];

const resolveMargins = (options?: PaperLayoutOptions): PaperMargins => ({
  ...DEFAULT_PAPER_MARGINS,
  ...(options?.margins ?? {}),
});

const resolveColors = (options?: PaperLayoutOptions): PaperColors => ({
  ...DEFAULT_PAPER_COLORS,
  ...(options?.colors ?? {}),
});

const clampFontSize = (value?: number): number => {
  if (!value || !Number.isFinite(value)) return DEFAULT_QUESTION_FONT_SIZE;
  return Math.min(16, Math.max(8.5, value));
};

/**
 * CSS الورقة. الهوامش تُحوَّل إلى `@page { margin }` وتُصفَّر حشوة جسم
 * المستند في الطباعة، حتى لا تتجاوز الورقة مساحة A4 القابلة للطباعة.
 *
 * ملاحظة مهمة: `buildPrintDocument` يضيف `body{padding:24px}` — وهي وحدها
 * تكفي لدفع الورقة إلى صفحة ثانية، لذلك نلغيها هنا في وضع الطباعة.
 *
 * مبادئ التنسيق (بعد مراجعة نموذج الورقة المطبوعة):
 *  - الورقة إطار واحد رفيع ثم مساحة بيضاء واسعة؛ لا صناديق ملوّنة متلاصقة.
 *  - تدرّج بصري واضح: ترويسة ← بيانات الطالب ← التعليمات ← أقسام الأسئلة ←
 *    التقييم ← التوقيعات، وبين كل كتلتين فراغ صريح فلا تتداخل.
 *  - النص القرآني بخط مصحف المدينة وله تباعد أسطر أوسع (1.95) لأن الحركات
 *    والتجويد تحتاج مساحة رأسية، بخلاف المتن العادي.
 *  - كتلة السؤال كتلة واحدة لا تنقسم بين صفحتين (`break-inside: avoid`).
 */
export const buildPaperCss = (options?: PaperLayoutOptions): string => {
  const m = resolveMargins(options);
  const c = resolveColors(options);
  const fontSize = clampFontSize(options?.questionFontSize);
  const pageMargin = `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
  /** ارتفاع صفحة A4 المتاح فعليًا بعد الهوامش (ناقص 1mm أمان للتقريب) */
  const paperHeight = `calc(297mm - ${m.top}mm - ${m.bottom}mm - 1mm)`;

  return `
  /* خطوط محلّية مضمّنة — لا اعتماد على خطوط الجهاز */
${PAPER_FONT_FACES}

  :root {
    --font-body: ${PAPER_FONT_BODY};
    --font-head: ${PAPER_FONT_HEAD};
    --font-quran: ${PAPER_FONT_QURAN};
    --font-quran-bracket: ${PAPER_FONT_QURAN_BRACKET};

    /* هوية الورقة: زمردي المصحف + ذهب المخطوط + ورق عاجي */
    --brand: #0b5b3c;
    --brand-deep: #073d28;
    --brand-soft: #eef5f0;
    --gold: #a8813a;
    --gold-deep: #8a672a;
    --gold-soft: #f8f1e2;
    --parchment: #fcfaf4;
    --ink: ${c.ink};
    --muted: #5a6b61;
    --line: #dde7e0;
    --line-gold: #e7dcc2;

    --c-name: ${c.name};
    --c-category: ${c.category};
    --c-previous: ${c.previous};
    --c-current: ${c.current};
    --c-teacher: ${c.teacher};
    --c-question: ${c.question};
    --c-signature: ${c.signature};

    --q-size: ${fontSize}pt;
    --paper-h: ${paperHeight};
    /* المسافة بعد كتلة الإجابة — تُمنع التصاق الأسئلة ببعضها */
    --gap-after-answer: 1.8mm;
    /* ارتفاع صفّ التوقيع: مساحة كافية للتوقيع بخط اليد */
    --sig-row-h: 6.8mm;
  }

  @page { size: A4 portrait; margin: ${pageMargin}; }

  html, body { background: #fff; }

  body {
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 9pt;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  /* تحذير مهم — لا تُضِف letter-spacing إلى أي عنصر في هذه الورقة:
     html2canvas (مسار تصدير PDF داخل التطبيق) يقطّع النص حرفًا حرفًا حين يجد
     تباعد حروف غير صفري (breakText → segmentGraphemes)، فيفقد التشكيل العربي
     وصلات الحروف وتتراكب الكلمات. تباعد الحروف في العربية زخرفة لا تكاد تُرى،
     وثمنها إفساد الورقة كاملة عند التصدير. */

  /* ===== الورقة: صفحة A4 كاملة بإطار مزدوج (زمردي رفيع + ذهبي داخلي) ===== */
  .paper {
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-height: var(--paper-h);
    padding: 4.4mm 5.6mm 3.2mm;
    border: 0.85px solid var(--line);
    border-radius: 1.4mm;
    background: #fff;
    color: var(--ink);
    font-family: var(--font-body);
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* شريط الهوية أعلى الورقة: زمردي يمتد إلى الذهبي */
  .paper::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1.15mm;
    background: linear-gradient(90deg, var(--brand-deep) 0%, var(--brand) 58%, var(--gold) 58.3%, var(--gold) 100%);
  }

  /* الإطار الذهبي الداخلي — خطّ رفيع يفصل الهامش عن المتن كما في المخطوطات */
  .paper::after {
    content: "";
    position: absolute;
    top: 1.7mm;
    right: 1.7mm;
    bottom: 1.7mm;
    left: 1.7mm;
    border: 0.45px solid var(--line-gold);
    border-radius: 0.9mm;
    pointer-events: none;
  }

  .paper:last-child { page-break-after: auto; break-after: auto; }

  /* ===== ورقة كثيفة الأسئلة (٩ أسئلة فأكثر) =====
     تُضغط الزخرفة والترويسة والتوقيعات بضعةَ مليمترات بدل تصغير خط القرآن،
     فتبقى الآيات مقروءة وتظل الورقة كلها في صفحة A4 واحدة. */
  .paper.dense .logo { width: 9.4mm; height: 9.4mm; }
  .paper.dense .logo-cell { width: 12mm; }
  .paper.dense .title {
    font-size: 11pt;
    line-height: 1.35;
    margin: 0.6mm 0 0.5mm;
    padding: 0.6mm 8mm 0.4mm;
  }
  .paper.dense .basmala { margin-bottom: 0.5mm; }
  .paper.dense .basmala span { font-size: 8.6pt; line-height: 1.5; }
  .paper.dense .header-rule { height: 2.2mm; margin: 0.3mm 0 0.9mm; }
  .paper.dense .meta { margin-bottom: 1.1mm; }
  .paper.dense .section-title { font-size: 9.8pt; }
  .paper.dense .note { font-size: 6.6pt; line-height: 1.5; }
  .paper.dense .eval-table th { padding: 1mm 5px; }
  .paper.dense .eval-table td { height: 4.4mm; }
  .paper.dense .sig-cell { height: 6mm; }
  .paper.dense .footer-line { margin-top: 0.8mm; padding-top: 0.7mm; }

  /* زوايا مرصَّعة: مربّع مائل صغير على الإطار الداخلي */
  .frame-corners { position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none; }

  .frame-corners i {
    position: absolute;
    width: 2.2mm;
    height: 2.2mm;
    background: #fff;
    border: 0.5px solid var(--gold);
    transform: rotate(45deg);
  }

  .frame-corners .fc-tr { top: 0.85mm; right: 0.85mm; }
  .frame-corners .fc-tl { top: 0.85mm; left: 0.85mm; }
  .frame-corners .fc-br { bottom: 0.85mm; right: 0.85mm; }
  .frame-corners .fc-bl { bottom: 0.85mm; left: 0.85mm; }

  /* ===== الترويسة: بسم الله ثم الشعاران ثم اسم المركز وشارة العنوان ===== */
  .masthead { text-align: center; }

  /* البسملة على سطر بيانات رفيع — أول ما تقع عليه العين */
  .basmala {
    position: relative;
    margin: 0 0 0.9mm;
    line-height: 1.7;
  }

  .basmala::before {
    content: "";
    position: absolute;
    left: 6%;
    right: 6%;
    top: 50%;
    border-top: 0.4px solid var(--line-gold);
  }

  .basmala span {
    position: relative;
    display: inline-block;
    padding: 0 3.4mm;
    background: #fff;
    font-family: var(--font-quran);
    font-size: 9.4pt;
    color: var(--gold-deep);
    line-height: 1.65;
  }

  .header {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .header td { vertical-align: middle; }

  .logo-cell { width: 14mm; }

  .logo {
    width: 11mm;
    height: 11mm;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }

  .header-mid { text-align: center; min-width: 0; }

  .center {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 9.2pt;
    color: var(--brand);
    line-height: 1.55;
  }

  .center .sep { color: var(--gold); font-weight: 400; padding: 0 0.9mm; }

  /* شارة العنوان: زمردي بحدود ذهبية مزدوجة — أوضح عنصر في الورقة */
  .title {
    display: inline-block;
    margin: 0.9mm 0 0.7mm;
    padding: 0.8mm 10mm 0.55mm;
    border-radius: 1.1mm;
    background: linear-gradient(180deg, #0f6746, #073d28);
    border: 0.45px solid var(--gold);
    box-shadow: 0 0 0 0.55mm #fff, 0 0 0 0.85mm var(--line-gold);
    color: #fff;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 12.2pt;
    line-height: 1.4;
  }

  .competition {
    font-family: var(--font-body);
    font-size: 7.8pt;
    font-weight: 700;
    color: var(--gold-deep);
    margin-top: 0.7mm;
  }

  /* خطّان (زمردي رفيع ثم ذهبي أدقّ) تتوسّطهما مرصعة معيّنة */
  .header-rule {
    position: relative;
    height: 2.7mm;
    margin: 0.5mm 0 1.2mm;
  }

  .header-rule::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0.75mm;
    border-top: 0.9px solid var(--brand);
  }

  .header-rule::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 1.75mm;
    border-top: 0.45px solid var(--gold);
  }

  .header-rule .stud {
    position: absolute;
    left: 50%;
    top: 0.05mm;
    margin-left: -1.25mm;
    width: 2.5mm;
    height: 2.5mm;
    background: #fff;
    border: 0.5px solid var(--gold);
    transform: rotate(45deg);
  }

  /* ===== سطر البيانات الوصفي ===== */
  .meta {
    text-align: center;
    color: #48584f;
    font-size: 7.3pt;
    font-weight: 600;
    line-height: 1.65;
    margin: 0 0 1.4mm;
    font-variant-numeric: tabular-nums;
  }

  .meta .dot { color: var(--gold); padding: 0 1.2mm; font-weight: 400; }

  /* ===== بطاقة البيانات: اسمٌ وتسميةٌ في كل خانة، بلا نقاط نصية تتقاطع ===== */
  .id-grid {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0 0 1.3mm;
    font-size: 8.4pt;
  }

  .id-grid td {
    border: 0.5px solid var(--line);
    border-top: 0.9px solid var(--line-gold);
    padding: 0.7mm 2.6mm 0.85mm;
    text-align: right;
    vertical-align: middle;
    background: var(--parchment);
    line-height: 1.45;
  }

  .id-lbl {
    display: block;
    font-family: var(--font-body);
    font-size: 6.1pt;
    font-weight: 700;
    color: #7b877f;
    line-height: 1.5;
    margin-bottom: 0.25mm;
  }

  .id-grid b {
    display: block;
    font-family: var(--font-body);
    font-size: 9.6pt;
    font-weight: 700;
    line-height: 1.38;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    overflow-wrap: break-word;
    word-break: normal;
  }

  /* خانة فارغة: سطر منقّط حقيقي بدل نقاط نصية تتجاوز الخانة */
  .id-grid b.id-blank {
    height: 4.6mm;
    border-bottom: 0.45px dotted #b4c6ba;
    font-size: 9pt;
  }

  .id-name b { color: var(--c-name); font-size: 10.8pt; }
  .id-category .id-lbl { color: var(--c-category); }
  .id-previous .id-lbl { color: var(--c-previous); }
  .id-current .id-lbl { color: var(--c-current); }
  .id-teacher .id-lbl { color: var(--c-teacher); }
  .id-total .id-lbl { color: var(--gold-deep); }
  .id-total b { color: var(--brand); }

  /* ===== التعليمات ===== */
  .note {
    font-size: 6.9pt;
    line-height: 1.55;
    color: #3f4f46;
    background: var(--parchment);
    border: 0.5px solid #ece2cc;
    border-right: 0.9mm solid var(--gold);
    border-radius: 1mm;
    padding: 0.7mm 2.8mm 0.85mm;
    margin: 0 0 1.15mm;
  }

  .note .note-label {
    font-family: var(--font-head);
    color: var(--gold-deep);
    font-weight: 700;
    font-size: 8.6pt;
  }

  .note .note-split { display: block; color: #5d6b62; }

  /* ===== عنوان القسم: شارة الرقم + العنوان + درجة القسم ===== */
  .section-head {
    display: flex;
    align-items: center;
    gap: 2mm;
    margin: 0.9mm 0 0.5mm;
    padding-bottom: 0.55mm;
    border-bottom: 0.5px solid var(--line);
    break-after: avoid;
  }

  .section-index {
    font-family: var(--font-body);
    font-size: 6.8pt;
    font-weight: 700;
    color: #fff;
    background: var(--brand);
    border-radius: 0.8mm;
    padding: 0.45mm 1.9mm 0.25mm;
    white-space: nowrap;
    line-height: 1.55;
  }

  .section-title {
    margin: 0;
    padding: 0;
    border: 0;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 10.2pt;
    line-height: 1.45;
    color: var(--brand-deep);
    white-space: nowrap;
    break-after: avoid;
  }

  .section-marks {
    margin-right: auto;
    font-family: var(--font-body);
    font-size: 7pt;
    font-weight: 700;
    color: var(--gold-deep);
    background: var(--gold-soft);
    border: 0.45px solid var(--line-gold);
    border-radius: 6mm;
    padding: 0.25mm 2.4mm 0.1mm;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* ===== الأسئلة ===== */
  .qs {
    font-size: var(--q-size);
    font-weight: 700;
    line-height: 1.32;
    padding: 0;
    margin: 0;
    list-style: none;
    color: var(--c-question);
  }

  .q-item {
    display: flex;
    align-items: flex-start;
    gap: 2mm;
    margin: 0;
    padding: 0.5mm 0 0.8mm;
    border-bottom: 0.4px dashed #e8e0d0;
    break-inside: avoid;
  }

  .q-item:last-child { border-bottom: 0; }

  /* رقم السؤال في دائرة مزدوجة الحلقة — لا يلتف النص تحتها */
  .q-num {
    flex: 0 0 5.9mm;
    width: 5.9mm;
    height: 5.9mm;
    margin-top: 0.5mm;
    border-radius: 50%;
    background: var(--brand-soft);
    border: 0.5px solid var(--gold);
    box-shadow: inset 0 0 0 0.35mm #fff;
    color: var(--brand-deep);
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 8.4pt;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    direction: ltr;
    text-align: center;
    padding-top: 0.3mm;
    box-sizing: border-box;
    font-variant-numeric: tabular-nums;
  }

  .q-body { flex: 1 1 auto; min-width: 0; }

  /* النص القرآني: خط مصحف المدينة + تباعد أسطر واسع للحركات */
  .q {
    font-family: var(--font-quran);
    font-weight: 400;
    font-size: calc(var(--q-size) * 1.04);
    line-height: 1.76;
    color: var(--c-question);
    text-align: right;
    /* لا تُقطع الآية بشرطة في آخر السطر — تجزئة عربية خاطئة تُفسد المعنى */
    -webkit-hyphens: none;
    hyphens: none;
    word-break: normal;
    overflow-wrap: normal;
    word-spacing: 0.06em;
  }

  /* كلمات السؤال («اقرأ من قوله تعالى») بخط المتن لا بخط المصحف */
  .q-stem {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: calc(var(--q-size) * 0.82);
    color: #5d6e64;
    white-space: nowrap;
  }

  .q-verse { font-family: var(--font-quran); }

  /* أقواس الآيات ﴿ ﴾ من خط مصحفي يحويها، بلون ذهبي هادئ */
  .q-bracket {
    font-family: var(--font-quran-bracket);
    font-size: 0.94em;
    color: var(--gold);
    padding: 0 0.2mm;
  }

  /* كتلة الدرجة والإجابة: تحت السؤال، بسطر واحد مضغوط */
  .q-foot {
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 3mm;
    margin-top: 0.25mm;
    line-height: 1.35;
    clear: both;
    break-inside: avoid;
  }

  .score {
    font-family: var(--font-body);
    font-size: 6.9pt;
    font-weight: 700;
    color: #6d7d74;
    white-space: nowrap;
    flex: 0 0 auto;
    direction: rtl;
  }

  .score .score-max { color: var(--brand); font-family: var(--font-head); font-size: 9pt; }

  /* درجة سؤال الحفظ على سطر السؤال نفسه */
  .q-mark {
    font-family: var(--font-body);
    font-size: calc(var(--q-size) * 0.6);
    font-weight: 700;
    color: #7c8c83;
    white-space: nowrap;
    padding-right: 1.8mm;
  }

  .q-mark .score-dots { width: 8mm; margin: 0 1.2mm; }

  /* سطر الكتابة داخل كتلة الدرجة: نقاط حقيقية لا نقاط نصية */
  .score-dots {
    display: inline-block;
    width: 9mm;
    border-bottom: 0.45px dotted #a9bdb1;
    margin: 0 1.4mm;
    vertical-align: baseline;
  }

  .answer-block {
    margin: 0.5mm 0 var(--gap-after-answer);
    color: var(--ink);
    font-size: 7.2pt;
    font-weight: 700;
    line-height: 1.4;
    break-inside: avoid;
  }

  .answer-block .answer-label { color: var(--gold-deep); }

  /* سطر الإجابة: نقاط حقيقية بعرض كامل — تُرسم في المتصفح وفي محركات الطباعة */
  .answer-dots {
    display: block;
    margin-top: 3mm;
    border-bottom: 0.5px dotted #b9c9bf;
    height: 0;
  }

  .section-head.anchor-bottom { margin-top: auto; }

  .meta,
  .id-grid b,
  .score { font-variant-numeric: tabular-nums; }

  /* أسئلة التلاوة تتقاسم ما يبقى من الورقة: كلما قلّ عددها اتّسعت مساحة
     الإجابة، فلا تبقى فراغات كبيرة قبل قسم التقييم. لا تنكمش أبدًا حتى لا
     تتزاحم الأسئلة في الأوراق الكثيفة. */
  .qs.fill {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
  }

  .qs.fill .q-item { flex-grow: 1; flex-shrink: 0; }

  .qs.fill .q-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
  }

  .qs.fill .answer-block {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
  }

  .qs.fill .answer-dots { margin-top: auto; }

  /* ===== جدول التقييم ===== */
  .eval-table {
    font-family: var(--font-body);
    width: 100%;
    border-collapse: collapse;
    font-size: 8.2pt;
    margin-top: 1.2mm;
    table-layout: fixed;
    break-inside: avoid;
  }

  .eval-table th,
  .eval-table td {
    border: 0.5px solid #d9e4dc;
    padding: 1.2mm 5px;
    text-align: center;
    vertical-align: middle;
  }

  .eval-table th {
    background: var(--brand-soft);
    color: var(--brand-deep);
    font-weight: 800;
    font-size: 7.6pt;
    line-height: 1.5;
  }

  .eval-table td {
    background: #fff;
    height: 5mm;
    font-weight: 700;
    color: #b3bfb8;
  }

  /* ===== التوقيعات أسفل الورقة ===== */
  .signatures {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.1mm;
    font-size: 8pt;
    color: var(--c-signature);
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .signatures th,
  .signatures td {
    text-align: center;
    vertical-align: middle;
  }

  .signatures th {
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 7.2pt;
    color: var(--brand-deep);
    background: var(--brand-soft);
    border-top: 0.9px solid var(--gold);
    border-bottom: 0.4px solid #d9e4dc;
    padding: 0.7mm 4px;
  }

  .signatures td {
    border: 0.45px solid #e4ece6;
    border-top: 0;
    padding: 1.2mm 2mm;
  }

  .sig-cell { height: var(--sig-row-h); }

  .sig-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2.5mm;
    white-space: nowrap;
    flex-wrap: nowrap;
    overflow: hidden;
  }

  .sig-name {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 8.8pt;
    color: var(--c-signature);
    line-height: 1.5;
    flex: 0 1 auto;
    min-width: 0;
  }

  .sig-line {
    font-size: 7.4pt;
    color: #7b8a82;
    flex: 0 0 auto;
    white-space: nowrap;
  }

  /* أعضاء اللجنة الثلاثة في سطر واحد دائمًا */
  .sig-row.committee { justify-content: center; gap: 3mm; }

  .sig-row.committee .sig-name {
    flex: 0 0 auto;
    font-size: 8.2pt;
  }

  /* المرصعة الفاصلة بين أسماء اللجنة */
  .sig-dot {
    color: var(--gold);
    font-size: 9pt;
    font-weight: 700;
    flex: 0 0 auto;
    line-height: 1;
  }

  .footer-line {
    margin-top: 1mm;
    padding-top: 0.9mm;
    border-top: 0.45px solid var(--line-gold);
    text-align: center;
  }

  .thanks {
    font-size: 8.4pt;
    color: var(--brand);
    font-weight: 700;
    font-family: var(--font-head);
    line-height: 1.7;
  }

  /* آية الخاتمة بخط المصحف — توقيع الورقة المصحفي */
  .footer-verse {
    font-family: var(--font-quran);
    font-size: 8.4pt;
    color: var(--gold-deep);
    line-height: 1.6;
    margin-top: 0.2mm;
  }

  /* ===== نتيجة ولي الأمر ===== */
  .result-hero {
    text-align: center;
    border: 0.8px solid var(--gold);
    border-radius: 1.6mm;
    padding: 6mm 6mm 5mm;
    margin: 1.8mm 0 4.6mm;
    background: linear-gradient(180deg, #fdfaf3, #f3f7f2);
    box-shadow: inset 0 0 0 0.6mm #fff, inset 0 0 0 0.85mm var(--line-gold);
    break-inside: avoid;
  }

  .result-hero .result-label { font-size: 8pt; color: #46574e; font-weight: 700; }

  .result-hero .result-value {
    font-family: var(--font-head);
    font-size: 30pt;
    font-weight: 700;
    color: var(--brand);
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .result-hero .result-grade {
    font-size: 12.5pt;
    font-weight: 700;
    font-family: var(--font-head);
    color: var(--c-current);
  }

  .result-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.4pt;
    margin-bottom: 4mm;
    table-layout: fixed;
    break-inside: avoid;
  }

  .result-table th,
  .result-table td { border: 0.5px solid #d9e4dc; padding: 3.2mm 5px; text-align: center; }

  .result-table th { background: var(--brand-soft); color: var(--brand-deep); font-weight: 800; font-size: 7.8pt; }

  .result-table td { font-variant-numeric: tabular-nums; color: #46574e; }

  .result-table b { font-size: 11pt; font-weight: 700; color: var(--ink); font-family: var(--font-head); }

  .prize-box {
    border: 0.5px solid var(--line-gold);
    border-radius: 1.4mm;
    padding: 2mm 3.4mm;
    margin-bottom: 4mm;
    background: var(--gold-soft);
    break-inside: avoid;
  }

  .prize-box .prize-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 9.2pt;
    font-weight: 600;
    color: #4a5a51;
    padding: 2.3mm 0;
    border-bottom: 0.4px dotted #e2d3b4;
  }

  .prize-box .prize-row:last-child { border-bottom: 0; }

  .prize-box .prize-total {
    font-family: var(--font-head);
    font-size: 10.5pt;
    font-weight: 700;
    color: var(--brand);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .result-note {
    font-size: 8.6pt;
    color: #46574e;
    line-height: 1.9;
    margin: 0 0 3mm;
    padding: 2mm 3mm;
    background: var(--parchment);
    border: 0.45px solid #ece2cc;
    border-radius: 1.2mm;
  }

  /* ===== مؤشرات الأداء ===== */
  .meters { display: grid; gap: 2.6mm; margin: 0 0 4mm; }

  .meter { display: flex; align-items: center; gap: 2.4mm; }

  .meter-label {
    flex: 0 0 46mm;
    font-size: 8pt;
    font-weight: 700;
    color: #46574e;
  }

  .meter-track {
    flex: 1 1 auto;
    direction: rtl;
    height: 3mm;
    background: #eef3f0;
    border-radius: 1.2mm;
    overflow: hidden;
    box-shadow: inset 0 0 0 0.3px #dbe7df;
  }

  .meter-fill {
    display: block;
    height: 100%;
    border-radius: 1.2mm;
    background: linear-gradient(90deg, var(--brand), #16805a);
  }

  .meter-value {
    flex: 0 0 18mm;
    direction: ltr;
    text-align: left;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 8.6pt;
    color: var(--brand);
    font-variant-numeric: tabular-nums;
  }

  /* فراغ مرن يدفع التوقيعات إلى أسفل الورقة في المستندات القصيرة */
  .grow { flex: 1 1 auto; }

  /* ===== إقرار ولي الأمر ===== */
  .ack {
    display: flex;
    align-items: baseline;
    gap: 3mm;
    margin: 0 0 2.2mm;
    padding: 2.4mm 3.4mm;
    border: 0.5px dashed #d3dfd6;
    border-radius: 1.2mm;
    background: #fdfcf8;
    font-size: 8pt;
    color: #46574e;
    break-inside: avoid;
  }

  .ack-text { flex: 1 1 auto; font-weight: 600; }

  .ack-line { flex: 0 0 auto; color: #7c8c83; font-weight: 700; white-space: nowrap; }

  /* ===== جداول الكشوف ومفتاح التصحيح ===== */
  .info-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    table-layout: fixed;
    margin: 1mm 0 2mm;
    break-inside: auto;
  }

  .info-table th {
    background: var(--brand);
    color: #fff;
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 7.4pt;
    padding: 1.1mm 3px;
    border: 0.4px solid var(--brand);
    text-align: center;
    white-space: nowrap;
  }

  .info-table td {
    border: 0.4px solid #d9e4dc;
    padding: 0.9mm 3px;
    text-align: center;
    vertical-align: middle;
    line-height: 1.5;
    color: #33443b;
  }

  .info-table td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }

  .info-table tbody tr:nth-child(even) td { background: #fafcf9; }

  .info-table tr { break-inside: avoid; }

  /* ===== مفتاح التصحيح: كتلة لكل نموذج ===== */
  .key-block { margin: 0 0 2.5mm; }

  .key-block-head {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 9.6pt;
    color: var(--brand-deep);
    background: var(--parchment);
    border-right: 0.9mm solid var(--gold);
    border-radius: 1mm;
    padding: 0.9mm 2.4mm;
    margin: 0 0 1.2mm;
    break-after: avoid;
  }

  .key-ref {
    font-family: var(--font-body);
    font-size: 7.2pt;
    font-weight: 700;
    color: #7c8c83;
    margin-top: 0.3mm;
  }

  .key-ref .score-dots { width: 7mm; margin: 0 1.2mm; }
  .key-ref b { color: var(--brand); font-family: var(--font-head); font-size: 8.6pt; }

  .key-answer {
    font-size: 8.4pt;
    line-height: 1.75;
    color: #2f4038;
    background: #fbfcf9;
    border: 0.4px solid #ece2cc;
    border-radius: 1mm;
    padding: 1mm 2mm;
    margin-top: 0.8mm;
  }

  .key-answer b { color: var(--brand); }

  /* على الشاشة: نحاكي هوامش الصفحة حتى يعطي القياس والمعاينة نفس نتيجة الطباعة */
  @media screen {
    html, body {
      margin: 0 !important;
      padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm !important;
      background: #fff !important;
      box-sizing: border-box;
    }
  }

  @media print {
    html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
    .paper { border-radius: 0; border-color: #cbd9d0; }
  }
`;
};

/** التنسيق الافتراضي (هوامش 8mm وألوان الهوية) — للتوافق مع بقية الواجهات. */
export const PAPER_CSS = buildPaperCss();

/**
 * «درجة / الدرجة القصوى» داخل عزل اتجاهي — بدونه يعرض المتصفح «100 / 91»
 * لأن الشطرين أرقام بلا حروف تحدد اتجاهها.
 */
const scoreRatio = (value: string | number, max: string | number): string =>
  `<span dir="ltr">${esc(String(value))} / ${esc(String(max))}</span>`;

/** قيمة رقمية بصيغة عربية مختصرة: 3 أجزاء. */
const juzLabel = (value?: number): string => `${Number(value) || 0} جزءًا`;

/**
 * بطاقة البيانات: تسميةٌ صغيرة فوق كل بيان وقيمةٌ عريضة تحتها، تُملأ من كشف
 * المسابقة أو تبقى سطرًا منقّطًا للكتابة اليدوية.
 *
 * سبب إعادة بنائها: كانت الخانات `white-space: nowrap` مع `overflow: hidden`
 * و`text-overflow: ellipsis`، فيقصّ الطويلَ من الأسماء ويُدخل القصير في جاره —
 * ومحرّكات تحويل HTML إلى PDF (html2canvas) لا تقصّ الفائض فظهرت الأسماء
 * متراكبة فوق التسميات. الآن كل قيمة في سطرها، وتلتفّ إن طالت.
 */
const valueOrBlank = (value?: string): string =>
  value ? `<b>${esc(value)}</b>` : `<b class="id-blank">&nbsp;</b>`;

const identityCard = (fields: {
  nameLabel: string;
  name?: string;
  teacherLabel: string;
  teacher?: string;
  category?: string;
  previous?: string;
  current?: string;
  /** الدرجة النهائية — HTML جاهز (المجموع من ١٠٠) أو سطر فارغ */
  total?: string;
  totalLabel?: string;
}): string => `
      <table class="id-grid">
        <colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%"></colgroup>
        <tr>
          <td class="id-name" colspan="2">
            <span class="id-lbl">${esc(fields.nameLabel)}</span>
            ${valueOrBlank(fields.name)}
          </td>
          <td class="id-teacher" colspan="2">
            <span class="id-lbl">${esc(fields.teacherLabel)}</span>
            ${valueOrBlank(fields.teacher)}
          </td>
        </tr>
        <tr>
          <td class="id-category"><span class="id-lbl">فئة الحفظ (التراكمي)</span>${valueOrBlank(fields.category)}</td>
          <td class="id-previous"><span class="id-lbl">الحفظ السابق</span>${valueOrBlank(fields.previous)}</td>
          <td class="id-current"><span class="id-lbl">الحفظ الجديد</span>${valueOrBlank(fields.current)}</td>
          <td class="id-total"><span class="id-lbl">${esc(fields.totalLabel ?? "الدرجة النهائية")}</span>${
            fields.total ? `<b>${fields.total}</b>` : `<b class="id-blank">&nbsp;</b>`
          }</td>
        </tr>
      </table>`;

/**
 * شرائح بيانات الطالب: اسمه، فئة حفظه التراكمي، حفظه السابق والجديد، واسم
 * معلمته — كلها مستدعاة من كشف المسابقة.
 */
const studentIdentityTable = (paper: ExamPaper, student?: PaperStudentContext): string => {
  const title = studentTitle(student?.gender);
  const totalLabel = typeof student?.totalHifz === "number" ? juzLabel(student.totalHifz) : "";
  // اسم الفئة قد يكون نفس رقم التراكمي («20 جزءًا») — لا نكرره في الخانة.
  const extraLabel =
    paper.categoryLabel && paper.categoryLabel !== totalLabel ? paper.categoryLabel : "";
  const category = totalLabel
    ? `${totalLabel}${extraLabel ? ` · ${extraLabel}` : ""}`
    : paper.categoryLabel;

  return identityCard({
    nameLabel: student?.name ? `اسم ${title}` : "اسم الطالب/الطالبة",
    name: student?.name,
    teacherLabel: student?.teacher ? "اسم المعلمة" : "المعلّم/المعلّمة",
    teacher: student?.teacher,
    category: student?.name ? category : undefined,
    previous: typeof student?.baseHifz === "number" ? juzLabel(student.baseHifz) : undefined,
    current: typeof student?.parts === "number" ? juzLabel(student.parts) : undefined,
    totalLabel: `الدرجة النهائية (${PAPER_TOTAL_MARKS})`,
  });
};

/** اسم الطالب في أعلى الورقة (يُستدعى من كشف المسابقة) */
const studentMeta = (student?: PaperStudentContext): string => {
  if (!student?.name) return "";
  const bits: string[] = [];
  if (typeof student.totalHifz === "number" && student.totalHifz > 0)
    bits.push(`إجمالي الحفظ: ${student.totalHifz} جزءًا`);
  if (student.orderInCategory && student.categoryTotal)
    bits.push(`تسلسله في فئته: ${student.orderInCategory} من ${student.categoryTotal}`);
  // تُفصل بفاصل ذهبي مثل بقية سطر البيانات (nbsp قبلها حتى لا تنفرد في سطر)
  return bits.length
    ? `&nbsp;<span class="dot">&#183;</span>${bits.join(' <span class="dot">&#183;</span> ')}`
    : "";
};

/**
 * شعار المركز بخلفية شفافة — نسخة مخصّصة للطباعة (`public/brand/logo-mark.png`).
 * الشعار الأصلي `icon-192.png` مربّع بخلفية بيضاء، فيظهر على الورقة كصندوق
 * أبيض يقصّ على أي خلفية ملوّنة.
 */
const LOGO_URL = "/brand/logo-mark.png";

/**
 * زوايا الورقة المرصَّعة — تُرسم بمربّعات مائلة صغيرة على الإطار الداخلي،
 * بلا صور ولا رموز قد لا يحويها خط الجهاز.
 */
const PAPER_CORNERS = `<div class="frame-corners" aria-hidden="true"><i class="fc-tr"></i><i class="fc-tl"></i><i class="fc-br"></i><i class="fc-bl"></i></div>`;

/**
 * ترويسة موحّدة لكل المستندات المطبوعة: البسملة في الصدر بخط المصحف، الشعار
 * يمينًا ويسارًا، وفي الوسط اسم المركز ثم شارة العنوان (زمردية بحدود ذهبية
 * مزدوجة) ثم عنوان المسابقة، ويفصلها عن المتن خطّان تتوسّطهما مرصعة.
 */
const paperHeader = (title: string, competitionLabel?: string, hideBasmala = false): string => `
      <div class="masthead">
        ${
          hideBasmala
            ? ""
            : `<div class="basmala"><span>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</span></div>`
        }
        <table class="header">
          <tr>
            <td class="logo-cell"><img class="logo" src="${LOGO_URL}" alt="شعار المركز" /></td>
            <td class="header-mid">
              <div class="center">مركز إنماء الأهلي الخيري<span class="sep">&#183;</span>قسم القرآن الكريم</div>
              <div class="title">${esc(title)}</div>
              ${competitionLabel ? `<div class="competition">${esc(competitionLabel)}</div>` : ""}
            </td>
            <td class="logo-cell"><img class="logo" src="${LOGO_URL}" alt="شعار المركز" /></td>
          </tr>
        </table>
      </div>
      <div class="header-rule"><span class="stud"></span></div>`;

/**
 * منطقة التوقيعات أسفل الورقة: المعلمة + ثلاثة من أعضاء لجنة التحكيم
 * (أسماؤهم تُدخل عند الطباعة) + إدارة المركز.
 */
const signaturesBlock = (student?: PaperStudentContext, options?: PaperLayoutOptions): string => {
  if (options?.hideSignatures) return "";
  const committee = (options?.committee ?? []).map((member) => member.trim()).filter(Boolean);
  // تُفصل الأسماء بمرصعة ذهبية لا بأرقام: الأرقام مع النقطة في سياق عربي
  // تُقلب («1.» تظهر «.1») وتزاحم الأسماء في ثلاث خانات ضيقة.
  const members =
    committee.length > 0
      ? committee
          .map((member) => `<span class="sig-name">${esc(member)}</span>`)
          .join('<span class="sig-dot">&#183;</span>')
      : `<span class="sig-name">..............</span>
         <span class="sig-dot">&#183;</span>
         <span class="sig-name">..............</span>
         <span class="sig-dot">&#183;</span>
         <span class="sig-name">..............</span>`;

  const teacherName = student?.teacher ? esc(student.teacher) : "......................";

  return `
      <table class="signatures">
        <tr>
          <th style="width:26%">المعلّم/المعلّمة</th>
          <th style="width:52%">أعضاء لجنة التحكيم (ثلاثة)</th>
          <th style="width:22%">إدارة المركز</th>
        </tr>
        <tr>
          <td class="sig-cell">
            <div class="sig-row">
              <span class="sig-name">${teacherName}</span>
              <span class="sig-line"><span class="sig-label">التوقيع: </span>··· ····</span>
            </div>
          </td>
          <td class="sig-cell">
            <div class="sig-row committee">${members}</div>
          </td>
          <td class="sig-cell">
            <div class="sig-row">
              <span class="sig-name">مركز إنماء الأهلي الخيري</span>
              <span class="sig-line"><span class="sig-label">التوقيع والختم: </span>···</span>
            </div>
          </td>
        </tr>
      </table>`;
};

/** خاتمة موحّدة: دعاء الإدارة ثم آية الترتيل بخط المصحف. */
const paperFooter = `
      <div class="footer-line">
        <div class="thanks">وفّقكم الله — إدارة مركز إنماء الأهلي الخيري</div>
        <div class="footer-verse"><span class="q-bracket">\uFD3F</span><span class="q-verse">وَرَتِّلِ ٱلْقُرْآنَ تَرْتِيلًا</span><span class="q-bracket">\uFD3E</span></div>
      </div>`;

/**
 * آية بأقواسها المزخرفة: القوسان ﴿ ﴾ من خط مصحفي يحويهما، والنص نفسه بخط
 * مصحف المدينة. فصلهما في عنصرين ضروري لأن خط المصحف لا يرسم القوسين.
 */
const verse = (text: string): string =>
  `<span class="q-bracket">\uFD3F</span><span class="q-verse">${esc(text)}</span><span class="q-bracket">\uFD3E</span>`;

/**
 * نص سؤال الحفظ: كلمات السؤال («اقرأ من قوله تعالى») بخط المتن الرفيع،
 * والآيتان بخط المصحف. النص المقروء مطابق تمامًا لـ `formatQuestionText`
 * (الوسوم وحدها هي الإضافة).
 */
const hifzQuestionHtml = (q: PaperQuestion): string =>
  `<span class="q-stem">اقرأ من قوله تعالى</span> ${verse(q.firstQuote)} ` +
  `<span class="q-stem">إلى قوله تعالى</span> ${verse(q.lastQuote)}`;

/** كتلة الدرجة: «الدرجة ....... من N» بسطر واحد مضغوط بدل سطر كامل لكل سؤال */
const markLine = (mark: number, extra?: string): string => `
        <div class="q-foot">
          <span class="score">${extra ? `${extra} &#183; ` : ""}الدرجة<span class="score-dots"></span>من <span class="score-max">${mark}</span></span>
        </div>`;

/**
 * درجة سؤال الحفظ مضمومة إلى آخر سطر من نص السؤال — لا تحتاج سطرًا كاملًا
 * (كان سطر الدرجة يأكل ٢٠px من كل سؤال، وهي مساحة الأسئلة نفسها).
 */
const inlineMark = (mark: number): string =>
  `<span class="q-mark">الدرجة<span class="score-dots"></span>من ${mark}</span>`;

const questionItem = (q: PaperQuestion, mark: number, num: number) => `
    <div class="q-item">
      <span class="q-num">${num}</span>
      <div class="q-body">
        <div class="q">${hifzQuestionHtml(q)} ${inlineMark(mark)}</div>
      </div>
    </div>`;

const supplementItem = (q: { question: string; reference: string }, mark: number, num: number) => `
    <div class="q-item">
      <span class="q-num">${num}</span>
      <div class="q-body">
        ${supplementQuestionHtml(q.question)}${markLine(mark, esc(q.reference))}
        <div class="answer-block">
          <span class="answer-label">الإجابة:</span>
          <span class="answer-dots"></span>
        </div>
      </div>
    </div>`;

/**
 * سؤال التلاوة/التجويد/المعاني: ما بين ﴿ ﴾ يُطبع بخط المصحف، وبقية السؤال
 * («بيّن حكم النون…») بخط المتن — فلا يظهر النص القرآني بخط عادي مشوّه.
 */
export const supplementQuestionHtml = (question: string): string => {
  const parts = question.split(/(\uFD3F[^\uFD3E]*\uFD3E)/g);
  const html = parts
    .map((part) => {
      if (part.startsWith("\uFD3F") && part.endsWith("\uFD3E")) {
        return verse(part.slice(1, -1));
      }
      return esc(part);
    })
    .join("");
  return `<div class="q">${html}</div>`;
};

/**
 * عنوان قسم داخل النموذج: شارة صغيرة «أولًا» + العنوان بخط العناوين + درجة
 * القسم في الطرف الآخر، على سطر واحد تحته خط رفيع.
 */
const sectionTitle = (title: string, marks?: number, anchorBottom = false) => {
  const colon = title.indexOf(":");
  const index = colon > 0 ? title.slice(0, colon).trim() : "";
  const label = colon > 0 ? title.slice(colon + 1).trim() : title.trim();
  return `
      <div class="section-head${anchorBottom ? " anchor-bottom" : ""}">
        ${index ? `<span class="section-index">${esc(index)}</span>` : ""}
        <h3 class="section-title">${esc(label)}</h3>
        ${typeof marks === "number" ? `<span class="section-marks">${marks} درجة</span>` : ""}
      </div>`;
};

/**
 * ورقة نموذج كاملة: ترويسة مصحفية + بطاقة بيانات الطالب + الأسئلة + تقييم
 * المعلم/ة + التوقيعات + خاتمة. مصممة لتسع صفحة A4 واحدة.
 */
export const buildPaperHtml = (
  paper: ExamPaper,
  year: string,
  student?: PaperStudentContext,
  options?: PaperLayoutOptions,
): string => {
  const hifzMarks = hifzQuestionMarks(paper.questions.length);
  const recitationMarks = recitationQuestionMarks(paper.supplements.length);
  /**
   * حجم خط الأسئلة: ما يضبطه المستخدم من المعاينة، وإلا مقاسٌ يقترحه عدد أسئلة
   * الورقة نفسها — ورقة بعشرة أسئلة تحتاج خطًّا أصغر لتسع صفحة A4 واحدة مع
   * مساحات الإجابة والتوقيعات. الورقة تحمل المتغيّر في `style` فيسري على
   * أسئلتها وحدها دون بقية أوراق المستند.
   */
  const questionFontSize =
    typeof options?.questionFontSize === "number"
      ? clampFontSize(options.questionFontSize)
      : suggestQuestionFontSize(paper.questions.length + paper.supplements.length);
  const dense = paper.questions.length + paper.supplements.length >= 9;
  return `
    <div class="paper${dense ? " dense" : ""}" style="--q-size: ${questionFontSize}pt">
      ${PAPER_CORNERS}
      ${paperHeader("اختبار الحفظ والتلاوة", options?.competitionLabel, options?.hideBasmala)}
      <div class="meta">
        العام ${esc(year)}هـ<span class="dot">&#183;</span>فئة الحفظ: ${esc(paper.categoryLabel)} (${esc(paper.rangeLabel)})
        <span class="dot">&#183;</span>${esc(paper.title)}
        <span class="dot">&#183;</span>${paper.questions.length + paper.supplements.length} أسئلة
        <span class="dot">&#183;</span>${QUESTIONS_TOTAL_MARKS} درجة للأسئلة + ${TEACHER_TOTAL_MARKS} للتقييم${studentMeta(student)}
      </div>
      ${studentIdentityTable(paper, student)}
      <p class="note">
        <span class="note-label">تعليمات</span> — يقرأ ${esc(studentTitle(student?.gender))} غيبًا من موضع البداية ﴿…﴾ إلى موضع النهاية ﴿…﴾، ثم يجيب عن أسئلة التلاوة والتجويد والمعاني.
        <span class="note-split">توزيع الدرجات: ${HIFZ_TOTAL_MARKS} للحفظ + ${RECITATION_TOTAL_MARKS} للتلاوة والتجويد والمعاني + ${ATTENDANCE_MARKS} مواظبة + ${BEHAVIOR_MARKS} سلوك.</span>
      </p>

      ${sectionTitle("أولًا: أسئلة الحفظ", HIFZ_TOTAL_MARKS)}
      <div class="qs">
        ${paper.questions.map((q, index) => questionItem(q, hifzMarks[index], index + 1)).join("")}
      </div>

      ${sectionTitle("ثانيًا: أسئلة التلاوة والتجويد والمعاني", RECITATION_TOTAL_MARKS)}
      ${
        paper.supplements.length > 0
          ? `<div class="qs fill">
        ${paper.supplements
          .map((q, index) =>
            supplementItem(q, recitationMarks[index], paper.questions.length + index + 1),
          )
          .join("")}
      </div>`
          : `<p class="note">لم تُضَف أسئلة تلاوة لهذا النموذج — يقيّم المعلم/ة التلاوة شفهيًا من ${RECITATION_TOTAL_MARKS} درجة.</p>`
      }

      ${sectionTitle("ثالثًا: تقييم المعلم/ة والمجموع", TEACHER_TOTAL_MARKS, true)}
      <table class="eval-table">
        <tr>
          <th>المواظبة (${ATTENDANCE_MARKS})</th>
          <th>السلوك (${BEHAVIOR_MARKS})</th>
          <th>مجموع الأسئلة (${QUESTIONS_TOTAL_MARKS})</th>
          <th>الدرجة النهائية (${PAPER_TOTAL_MARKS})</th>
        </tr>
        <tr>
          <td>..................</td>
          <td>..................</td>
          <td>..................</td>
          <td>..................</td>
        </tr>
      </table>

      ${signaturesBlock(student, options)}
      ${paperFooter}
    </div>`;
};

/** كل النماذج في مستند واحد، كل نموذج في صفحة مستقلة */
export const buildPapersHtml = (
  papers: ExamPaper[],
  year: string,
  students?: (PaperStudentContext | undefined)[],
  options?: PaperLayoutOptions,
): string => papers.map((paper, i) => buildPaperHtml(paper, year, students?.[i], options)).join("");

/** صفوف جدول مواضع أسئلة الحفظ في مفتاح التصحيح، مع درجة كل سؤال. */
const hifzKeyRows = (paper: ExamPaper): string => {
  const marks = hifzQuestionMarks(paper.questions.length);
  return paper.questions
    .map(
      (q, index) => `<tr>
            <td class="num">${esc(paper.label)}</td>
            <td class="num">${q.number}</td>
            <td>${esc(q.surahName)}</td>
            <td class="num">${q.fromAyah}–${q.toAyah}</td>
            <td class="num">${q.juzFrom}${q.juzTo !== q.juzFrom ? "–" + q.juzTo : ""}</td>
            <td class="num">${q.pageFrom === q.pageTo ? q.pageFrom : `${q.pageFrom}–${q.pageTo}`}</td>
            <td class="num">${q.ayahCount} آية (~${q.lines} سطر)</td>
            <td class="num">${marks[index]}</td>
          </tr>`,
    )
    .join("");
};

/** نماذج فريدة: عدة طلاب قد يشتركون في النموذج نفسه فلا نكرّر صفوفه. */
const uniquePapers = (papers: ExamPaper[]): ExamPaper[] => {
  const seen = new Set<string>();
  const unique: ExamPaper[] = [];
  for (const paper of papers) {
    const key = `${paper.categoryLabel}:${paper.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(paper);
  }
  return unique;
};

/** إجابات التلاوة والتجويد والمعاني لنموذج واحد، مع درجة كل سؤال. */
const supplementAnswers = (paper: ExamPaper): string => {
  const marks = recitationQuestionMarks(paper.supplements.length);
  return `
      <div class="key-block">
        <div class="key-block-head">${esc(paper.title)}</div>
        <div class="qs">
          ${paper.supplements
            .map(
              (q, index) => `<div class="q-item">
            <span class="q-num">${paper.questions.length + index + 1}</span>
            <div class="q-body">
              ${supplementQuestionHtml(q.question)}
              <div class="key-ref">${esc(q.reference)}<span class="score-dots"></span>الدرجة <b>${marks[index]}</b></div>
              <div class="key-answer"><b>الإجابة:</b> ${esc(q.answer)}</div>
            </div>
          </div>`,
            )
            .join("")}
        </div>
      </div>`;
};

/** مفتاح التصحيح: مرجع كل سؤال (السورة والآيات والجزء والصفحة وطول المقطع) */
export const buildAnswerKeyHtml = (papers: ExamPaper[], year: string): string => {
  const unique = uniquePapers(papers);
  return `
    <div class="paper">
      ${PAPER_CORNERS}
      ${paperHeader("مفتاح تصحيح أسئلة الحفظ والتلاوة")}
      <div class="meta">
        العام ${esc(year)}هـ<span class="dot">&#183;</span>فئة الحفظ: ${esc(unique[0]?.categoryLabel ?? "")}
        <span class="dot">&#183;</span>${unique.length} نماذج
        <span class="dot">&#183;</span>توزيع الدرجات: ${HIFZ_TOTAL_MARKS} حفظ + ${RECITATION_TOTAL_MARKS} تلاوة = ${QUESTIONS_TOTAL_MARKS}، وتقييم المعلم/ة ${TEACHER_TOTAL_MARKS} = ${PAPER_TOTAL_MARKS}
      </div>
      ${sectionTitle("أولًا: مواضع أسئلة الحفظ", HIFZ_TOTAL_MARKS)}
      <table class="info-table">
        <thead>
          <tr><th>النموذج</th><th>السؤال</th><th>السورة</th><th>الآيات</th><th>الجزء</th><th>الصفحة</th><th>طول المقطع</th><th>الدرجة</th></tr>
        </thead>
        <tbody>
          ${unique.map(hifzKeyRows).join("")}
        </tbody>
      </table>
      ${sectionTitle("ثانيًا: إجابات التلاوة والتجويد والمعاني", RECITATION_TOTAL_MARKS)}
      ${unique.map(supplementAnswers).join("")}
      ${paperFooter}
    </div>`;
};

/**
 * مفتاح تصحيح النماذج المخصصة للطلاب.
 * يختلف عن مفتاح النماذج العامة بأنه يبدأ بجدول توزيع (من هو الطالب وفي أي
 * نموذج)، ثم يعرض إجابات كل نموذج مستخدم مرة واحدة فقط — لأن عدة طلاب قد
 * يشتركون في نفس النموذج حين يتجاوز عددهم الحد الأعلى للنماذج.
 */
export const buildStudentAnswerKeyHtml = (
  entries: { paper: ExamPaper; student?: PaperStudentContext }[],
  year: string,
): string => {
  const usedPapers = uniquePapers(entries.map((entry) => entry.paper));

  const distribution = entries
    .map(
      (entry, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(entry.student?.name || "—")}</td>
        <td>${esc(entry.student?.teacher || "—")}</td>
        <td class="num">${entry.student?.totalHifz || 0}</td>
        <td>${esc(entry.paper.categoryLabel)}</td>
        <td>${esc(entry.paper.rangeLabel)}</td>
        <td class="num"><b>${esc(entry.paper.label)}</b></td>
      </tr>`,
    )
    .join("");

  return `
    <div class="paper">
      ${PAPER_CORNERS}
      ${paperHeader("مفتاح تصحيح نماذج الطلاب")}
      <div class="meta">
        العام ${esc(year)}هـ<span class="dot">&#183;</span>${entries.length} طالب/ة
        <span class="dot">&#183;</span>${usedPapers.length} نماذج مستخدمة
        <span class="dot">&#183;</span>توزيع الدرجات: ${HIFZ_TOTAL_MARKS} حفظ + ${RECITATION_TOTAL_MARKS} تلاوة = ${QUESTIONS_TOTAL_MARKS}، وتقييم المعلم/ة ${TEACHER_TOTAL_MARKS} = ${PAPER_TOTAL_MARKS}
      </div>
      ${sectionTitle("توزيع النماذج على الطلاب")}
      <table class="info-table">
        <thead>
          <tr><th>م</th><th>اسم الطالب/ة</th><th>المعلّم/ة</th><th>الحفظ</th><th>فئة الاختبار</th><th>نطاق الأجزاء</th><th>النموذج</th></tr>
        </thead>
        <tbody>
          ${distribution}
        </tbody>
      </table>
      ${sectionTitle("مواضع أسئلة الحفظ لكل نموذج", HIFZ_TOTAL_MARKS)}
      <table class="info-table">
        <thead>
          <tr><th>النموذج</th><th>السؤال</th><th>السورة</th><th>الآيات</th><th>الجزء</th><th>الصفحة</th><th>طول المقطع</th><th>الدرجة</th></tr>
        </thead>
        <tbody>
          ${usedPapers.map(hifzKeyRows).join("")}
        </tbody>
      </table>
      ${sectionTitle("إجابات التلاوة والتجويد والمعاني", RECITATION_TOTAL_MARKS)}
      ${usedPapers.map(supplementAnswers).join("")}
      ${paperFooter}
    </div>`;
};

/* ==================================================================
 * نتيجة ولي الأمر
 * ================================================================== */

/**
 * درجات الطالب كما تُطبع في ورقة ولي الأمر.
 * القيم الافتراضية تأتي من كشف المسابقة (`yearData`) ويمكن للمعلم/ة
 * تعديلها في المعاينة قبل الطباعة.
 */
export interface ParentResultInput {
  student: PaperStudentContext;
  /** درجة الحفظ (من 60) */
  memorization: number;
  /** درجة التلاوة والتجويد والمعاني (من 20) */
  recitation: number;
  /** المواظبة والسلوك (من 20) */
  conduct: number;
  /** مبلغ التكريم حسب التقدير — افتراضيًا: الحفظ الجديد × سعر الجزء */
  prize?: number;
  /** مبلغ التكريم حسب الحالة — من كشف المسابقة */
  statusPrize?: number;
  /** ملاحظة المعلم/ة تظهر في أسفل الورقة */
  note?: string;
}

export interface ParentResultSummary {
  /** مجموع درجات الطالب (من 100) */
  total: number;
  /** التقدير: ممتاز / جيد جداً / جيد / مقبول / ضعيف */
  grade: string;
  /** قيمة الجزء المستحقة حسب التقدير */
  pricePerPart: number;
  /** مبلغ التكريم حسب التقدير */
  prize: number;
  /** مبلغ التكريم حسب الحالة */
  statusPrize: number;
  /** إجمالي المستحق لولي الأمر */
  grandTotal: number;
}

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

/**
 * حساب نتيجة ولي الأمر من المدخلات:
 *  - المجموع = الحفظ + التلاوة + المواظبة والسلوك (بحد أقصى 100).
 *  - التقدير من المجموع.
 *  - مبلغ التكريم حسب التقدير = الحفظ الجديد (لا التراكمي) × سعر الجزء.
 *  - مبلغ التكريم حسب الحالة يأتي جاهزًا من كشف المسابقة.
 */
export const summarizeParentResult = (input: ParentResultInput): ParentResultSummary => {
  const memorization = Math.max(0, Number(input.memorization) || 0);
  const recitation = Math.max(0, Number(input.recitation) || 0);
  const conduct = Math.max(0, Number(input.conduct) || 0);
  const total = Math.min(PAPER_TOTAL_MARKS, round2(memorization + recitation + conduct));
  const { grade, pricePerPart } = calculateGrade(total);
  const parts = Math.max(0, Number(input.student.parts) || 0);
  const prize =
    typeof input.prize === "number" && Number.isFinite(input.prize)
      ? round2(Math.max(0, input.prize))
      : round2(parts * pricePerPart);
  const statusPrize = round2(Math.max(0, Number(input.statusPrize) || 0));
  return {
    total,
    grade,
    pricePerPart,
    prize,
    statusPrize,
    grandTotal: round2(prize + statusPrize),
  };
};

/** صياغة عربية للمبلغ مع فاصل الآلاف. */
const money = (value: number): string =>
  `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString("en-US")} ريال`;

const PRIZE_SOURCE_LABEL: Record<string, string> = {
  ممتاز: "سعر الجزء للتقدير ممتاز",
  "جيد جداً": "سعر الجزء للتقدير جيد جداً",
  جيد: "سعر الجزء للتقدير جيد",
  مقبول: "سعر الجزء للتقدير مقبول",
  ضعيف: "لا يوجد سعر جزء لهذا التقدير",
  "": "لم يُسجَّل تقدير بعد",
};

/**
 * مؤشّر أداء أفقي: درجة الطالب من نهايتها القصوى. يعطي ولي الأمر صورة فورية
 * عن موضع ابنه في كل محور (الحفظ/التلاوة/المواظبة) بدل أرقام فقط.
 */
const meter = (label: string, value: number, max: number): string => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `
        <div class="meter">
          <span class="meter-label">${esc(label)}</span>
          <span class="meter-track"><span class="meter-fill" style="width:${pct}%"></span></span>
          <span class="meter-value">${esc(String(value))} / ${max}</span>
        </div>`;
};

/**
 * ورقة «نتيجة الطالب لولي الأمر»: البيانات المميزة، جدول الدرجات، التقدير،
 * ومبلغ التكريم (حسب التقدير + حسب الحالة) والتوقيعات.
 */
export const buildParentResultHtml = (
  input: ParentResultInput,
  year: string,
  options?: PaperLayoutOptions,
): string => {
  const summary = summarizeParentResult(input);
  const { student } = input;
  const title = studentTitle(student.gender);
  const gradeText = summary.grade || "لم يُحدَّد";
  const note = input.note?.trim();

  return `
    <div class="paper">
      ${PAPER_CORNERS}
      ${paperHeader("نتيجة الطالب وإشعار ولي الأمر", options?.competitionLabel, options?.hideBasmala)}
      <div class="meta">
        العام ${esc(year)}هـ — ${esc(student.totalHifz !== undefined ? `فئة الحفظ (التراكمي): ${juzLabel(student.totalHifz)}` : "")}
        — ${esc(student.categoryLabel ?? "")}
      </div>

      ${identityCard({
        nameLabel: student.name ? `اسم ${title}` : "اسم الطالب/الطالبة",
        name: student.name,
        teacherLabel: "اسم المعلمة",
        teacher: student.teacher,
        category: student.totalHifz !== undefined ? juzLabel(student.totalHifz) : undefined,
        previous: student.baseHifz !== undefined ? juzLabel(student.baseHifz) : undefined,
        current: student.parts !== undefined ? juzLabel(student.parts) : undefined,
        total: scoreRatio(summary.total, PAPER_TOTAL_MARKS),
        totalLabel: `الدرجة النهائية (${PAPER_TOTAL_MARKS})`,
      })}

      <div class="result-hero">
        <div class="result-label">الدرجة النهائية</div>
        <div class="result-value" dir="ltr">${esc(
          summary.total.toLocaleString("en-US"),
        )} <span style="font-size:12pt">/ ${PAPER_TOTAL_MARKS}</span></div>
        <div class="result-grade">التقدير: ${esc(gradeText)}</div>
      </div>

      <table class="result-table">
        <tr>
          <th>الحفظ (${HIFZ_TOTAL_MARKS})</th>
          <th>التلاوة والتجويد والمعاني (${RECITATION_TOTAL_MARKS})</th>
          <th>المواظبة والسلوك (${TEACHER_TOTAL_MARKS})</th>
          <th>المجموع (${PAPER_TOTAL_MARKS})</th>
        </tr>
        <tr>
          <td><b>${esc(String(round2(input.memorization)))}</b></td>
          <td><b>${esc(String(round2(input.recitation)))}</b></td>
          <td><b>${esc(String(round2(input.conduct)))}</b></td>
          <td><b>${esc(String(summary.total))}</b></td>
        </tr>
      </table>

      <div class="prize-box">
        <div class="prize-row">
          <span>الحفظ الجديد المعتمد للتكريم</span>
          <span class="prize-total">${esc(juzLabel(student.parts))}</span>
        </div>
        <div class="prize-row">
          <span>مبلغ التكريم حسب التقدير (${esc(
            PRIZE_SOURCE_LABEL[summary.grade] ?? "سعر الجزء",
          )}: ${esc(money(summary.pricePerPart))})</span>
          <span class="prize-total">${esc(money(summary.prize))}</span>
        </div>
        <div class="prize-row">
          <span>مبلغ التكريم حسب الحالة</span>
          <span class="prize-total">${esc(money(summary.statusPrize))}</span>
        </div>
        <div class="prize-row">
          <span>إجمالي المستحق لولي الأمر</span>
          <span class="prize-total">${esc(money(summary.grandTotal))}</span>
        </div>
      </div>

      <div class="meters">
        ${meter("الحفظ", round2(input.memorization), HIFZ_TOTAL_MARKS)}
        ${meter("التلاوة والتجويد والمعاني", round2(input.recitation), RECITATION_TOTAL_MARKS)}
        ${meter("المواظبة والسلوك", round2(input.conduct), TEACHER_TOTAL_MARKS)}
      </div>

      ${
        note
          ? `<p class="result-note"><b>ملاحظة المعلم/ة:</b> ${esc(note)}</p>`
          : `<p class="result-note">نشكر لولي الأمر تعاونه ومتابعته، ونرجو الاستمرار في تحفيز ${esc(
              title,
            )} على الحفظ والمراجعة.</p>`
      }

      <div class="grow"></div>

      <div class="ack">
        <span class="ack-text">أطّلع ولي الأمر على النتيجة والتقدير، وأقرّ بما ورد فيها.</span>
        <span class="ack-line">التوقيع: ...............</span>
        <span class="ack-line">التاريخ: ...............</span>
      </div>

      ${signaturesBlock(student, options)}
      ${paperFooter}
    </div>`;
};

/** كل نتائج الطلاب في مستند واحد، كل طالب في صفحة A4 مستقلة. */
export const buildParentResultsHtml = (
  inputs: ParentResultInput[],
  year: string,
  options?: PaperLayoutOptions,
): string => inputs.map((input) => buildParentResultHtml(input, year, options)).join("");
