/**
 * خطوط الورقة المطبوعة — ملفات محلّية داخل `public/fonts` (لا اعتماد على خطوط
 * الجهاز ولا على شبكة).
 *
 * سبب الوجود: كان تنسيق الطباعة يعتمد على «Traditional Arabic / Amiri Quran / serif»
 * وهي خطوط غير موجودة على أندرويد ولا في أغلب المتصفحات، فيسقط النص إلى خط نظام
 * رديء ويظهر النص القرآني مشوّهًا.
 *
 * الخطوط (كلها مضمّنة في المستودع):
 *  - MushafHafs       : خط مصحف المدينة النبوية (مجمع الملك فهد لطباعة المصحف
 *                       الشريف — KFGQPC Uthmanic Script HAFS). هو الخط الذي
 *                       تُطبع به نسخة المدينة، فرسم الكلمات والرسم العثماني
 *                       (ٱللَّه، ٱلۡأَرۡضِ، ٱلۡحَمِيدُ) يظهر كما في المصحف لا
 *                       كما في خطوط النسخ العادية.
 *  - ArefRuqaa        : خط العناوين — رقعة فخمة بطابع مصحفي، يمنح الورقة شخصية
 *                       خاصة ولا يشبه الخط الافتراضي لأي تطبيق.
 *  - ExamNaskh        : متن الورقة والتعليمات (Noto Naskh Arabic، نسخي واضح).
 *  - ExamCairo        : الأرقام والجداول والبيانات الصغيرة.
 *  - AmiriQuran       : أقواس الآيات المزخرفة ﴿ ﴾ فقط (خط المصحف لا يحتويها).
 *
 * ملاحظتان مهمتان تعلّمناها بالاختبار:
 *  ١) لكل ملف `unicode-range` صريح (عربي / لاتيني)، وإلا تغلّب الملف اللاتيني على
 *     العربي فيُستخدم للعربية وتظهر مربّعات. ولهذا أيضاً يوجد ملف لاتيني مطابق
 *     لكل خط عربي حتى لا تسقط الأرقام (1448، 80، 20) إلى خط النظام.
 *  ٢) الملفات **ثابتة الوزن** (400 و700 منفصلان) لا متغيّرة؛ الملفات المتغيّرة
 *     (variable) يُفسد بعض محركات الطباعة تشكيلها فتخرج الحروف والأرقام مشوّهة.
 */

/** نطاق المحارف العربية كما تنشره Google Fonts لمجموعة arabic. */
const ARABIC_RANGE = [
  "U+0600-06FF",
  "U+0750-077F",
  "U+0870-0891",
  "U+0897-08E1",
  "U+08E3-08FF",
  "U+200C-200E",
  "U+2010-2011",
  "U+204F",
  "U+2E41",
  "U+FB50-FDFF",
  "U+FE70-FE74",
  "U+FE76-FEFC",
  "U+102E0-102FB",
  "U+10E60-10E7E",
  "U+10EC2-10EC7",
  "U+10EC9-10EEE",
  "U+10EF0-10EFF",
  "U+1EE00-1EE03",
  "U+1EE05-1EE1F",
  "U+1EE21-1EE22",
  "U+1EE24",
  "U+1EE27",
  "U+1EE29-1EE32",
  "U+1EE34-1EE37",
  "U+1EE39",
  "U+1EE3B",
  "U+1EE42",
  "U+1EE47",
  "U+1EE49",
  "U+1EE4B",
  "U+1EE4D-1EE4F",
  "U+1EE51-1EE52",
  "U+1EE54",
  "U+1EE57",
  "U+1EE59",
  "U+1EE5B",
  "U+1EE5D",
  "U+1EE5F",
  "U+1EE61-1EE62",
  "U+1EE64",
  "U+1EE67-1EE6A",
  "U+1EE6C-1EE72",
  "U+1EE74-1EE77",
  "U+1EE79-1EE7C",
  "U+1EE7E",
  "U+1EE80-1EE89",
  "U+1EE8B-1EE9B",
  "U+1EEA1-1EEA3",
  "U+1EEA5-1EEA9",
  "U+1EEAB-1EEBB",
  "U+1EEF0-1EEF1",
].join(", ");

/** الأرقام والحروف اللاتينية القليلة (1448هـ، 80، 20) داخل الخطوط العربية. */
const LATIN_RANGE = "U+0000-00FF, U+2010-2027, U+2030-205E, U+20A0-20CF, U+2212";

interface FaceOptions {
  family: string;
  file: string;
  weight: number;
  /** `arabic` (افتراضي)، `latin`، أو `all` لملف يغطي المحارف كلها */
  range?: "arabic" | "latin" | "all";
}

const face = ({ family, file, weight, range = "arabic" }: FaceOptions) => {
  // خط المصحف يُقدَّم بصيغته الأصلية (ttf) لأن رخصة مجمع الملك فهد تمنع أي
  // تحويل أو تعديل للملف، وبقية الخطوط مُحوَّلة إلى woff2 الأصغر.
  //
  // `font-display: swap` لا `block`: القيمة block تُخفي النص كله حتى ٣ ثوانٍ
  // في انتظار الخط، والطباعة تُستدعى قبل ذلك بكثير — فتخرج الورقة مطبوعةً
  // بحدودها ومربّعاتها بلا أي نص. وقع هذا فعليًا: عند فشل تحميل الخط (مستند
  // في about:blank لا تُحلّ فيه مسارات /fonts) اختفى نص النموذج كاملًا في ملف
  // الطباعة. مع swap يظهر النص بخط بديل فورًا ثم يُستبدل بالخط المقصود عند
  // وصوله، وننتظر الخطوط قبل الطباعة في `nativePrint`.
  const format = file.endsWith(".ttf") ? "truetype" : "woff2";
  return `  @font-face {
    font-family: '${family}';
    font-style: normal;
    font-weight: ${weight};
    font-display: swap;
    src: url('/fonts/${file}') format('${format}');${
      range === "all"
        ? ""
        : `
    unicode-range: ${range === "arabic" ? ARABIC_RANGE : LATIN_RANGE};`
    }
  }`;
};

/**
 * تعريفات @font-face كاملة — تُحقن في CSS الورقة المطبوعة.
 * كل خط عربي له ملف لاتيني مطابق بنفس العائلة، فلا تسقط الأرقام إلى خط النظام
 * وتظهر بأسلوب متناسق معه.
 */
export const PAPER_FONT_FACES = [
  // نص القرآن — مصحف المدينة
  face({ family: "MushafHafs", file: "kfgqpc-hafs.ttf", weight: 400 }),
  // أقواس الآيات المزخرفة ﴿ ﴾ (خط المصحف لا يحتويها)
  face({ family: "QuranBracket", file: "amiri-quran.woff2", weight: 400 }),
  // العناوين — وجه واحد يغطي العربية واللاتينية والأرقام والشرطة «/».
  // سبب إلغاء الوجه اللاتيني المنفصل: عناوين الورقة تحوي «/» (تقييم المعلم/ة)،
  // فكان القاطع ينتقل في وسط الكلمة إلى عائلة أخرى، وينكسر تشكيل العربية عند
  // الحد بين الوجهين فيظهر العنوان مشوّهًا. وجه واحد = تشكيل متصل دائمًا.
  face({ family: "ArefRuqaa", file: "aref-ruqaa-700.woff2", weight: 700, range: "all" }),
  // المتن والجداول
  face({ family: "ExamNaskh", file: "noto-naskh-400.woff2", weight: 400 }),
  face({ family: "ExamNaskh", file: "noto-naskh-700.woff2", weight: 700 }),
  face({ family: "ExamNaskh", file: "naskh-latin-400.woff2", weight: 400, range: "latin" }),
  face({ family: "ExamNaskh", file: "naskh-latin-700.woff2", weight: 700, range: "latin" }),
  face({ family: "ExamCairo", file: "cairo-400.woff2", weight: 400 }),
  face({ family: "ExamCairo", file: "cairo-700.woff2", weight: 700 }),
  face({ family: "ExamCairo", file: "cairo-latin-400.woff2", weight: 400, range: "latin" }),
  face({ family: "ExamCairo", file: "cairo-latin-700.woff2", weight: 700, range: "latin" }),
].join("\n");

/** متن الورقة: نسخي واضح للطباعة، ثم بدائل آمنة إن فشل تحميل الملف. */
export const PAPER_FONT_BODY =
  "'ExamNaskh', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";

/**
 * العناوين والجداول: نسخي عريض، ثم الرقعة كبديل أخير.
 *
 * سبب تقديم النسخي على «ArefRuqaa» (وإن كانت الرقعة أفخم شكلًا): خطاط
 * html2canvas — وهو مسار تصدير PDF داخل التطبيق — لا يجيد تشكيل الرقعة،
 * فتخرج عناوين الورقة (تقييم المعلم/ة والمجموع، أسئلة الحفظ) مشوّهة في ملف
 * PDF بينما تظهر سليمة في المتصفح. النسخي يُشكّل صحيحًا في المسارين.
 * الفخامة هنا تأتي من اللون والزخرفة والخط القرآني، لا من خط العناوين.
 */
export const PAPER_FONT_HEAD =
  "'ExamNaskh', 'Noto Naskh Arabic', 'Amiri', 'Segoe UI', Tahoma, sans-serif";

/**
 * نص السؤال المطبوع (بنك الأسئلة): نسخي عريض واحد لكل السؤال — ومنه الاقتباس
 * بين ﴿ ﴾ — فلا يظهر نصف السؤال بخط مصحفي ونصفه الآخر بخط آخر، كما في
 * النموذج المعتمد من الإدارة (`أسئلة_1448.pdf`).
 */
export const PAPER_FONT_QUESTION = PAPER_FONT_BODY;

/** نص القرآن الكريم — خط مصحف المدينة النبوية. */
export const PAPER_FONT_QURAN =
  "'MushafHafs', 'KFGQPC Uthmanic Script HAFS', 'Amiri Quran', 'Traditional Arabic', serif";

/** أقواس الآيات ﴿ ﴾ (وزن واحد، من خط مصحفي آخر يحويها). */
export const PAPER_FONT_QURAN_BRACKET = "'QuranBracket', 'Amiri Quran', 'ExamNaskh', serif";

/** أسماء الخطوط الأساسية — تُستخدم في الاختبارات والتحقق. */
export const PAPER_FONT_FAMILIES = ["MushafHafs", "ArefRuqaa", "ExamNaskh", "ExamCairo"] as const;

/** ملفات الخطوط المطلوبة داخل public/fonts (كلها ثابتة الوزن). */
export const PAPER_FONT_FILES = [
  "kfgqpc-hafs.ttf",
  "amiri-quran.woff2",
  "aref-ruqaa-700.woff2",
  "noto-naskh-400.woff2",
  "noto-naskh-700.woff2",
  "naskh-latin-400.woff2",
  "naskh-latin-700.woff2",
  "cairo-400.woff2",
  "cairo-700.woff2",
  "cairo-latin-400.woff2",
  "cairo-latin-700.woff2",
] as const;

/* =====================================================================
   خطوط الطباعة العامة — تستخدمها كل مستندات الطباعة في التطبيق
   (شهادات المعلمين، الكشوف، تقارير الطلاب، الجوائز، المسابقات…)
   كان كل مستند يكتب 'Traditional Arabic' / 'Segoe UI' وهي غير متوفرة على
   أندرويد، فيسقط النص إلى خط نظام رديء.
   ===================================================================== */

/** @font-face للمستندات المطبوعة — تُحقن بعد <style> في القالب. */
export const PRINT_FONT_FACES = PAPER_FONT_FACES;

/** خط متن مستندات الطباعة. */
export const PRINT_FONT_BODY = PAPER_FONT_BODY;
