/**
 * مكتبة الوسائط — منطق نقي (بلا متصفح ولا شبكة) يخدم صفحة الوسائط واختباراتها.
 *
 * الفكرة: كل ما يخصّ تصنيف الملف (صورة/فيديو/مستند)، ونوع المستند، والتقويم
 * الهجري، وتجميع العناصر حسب الشهر، ومفاتيح المصغّرات — يُعرَّف هنا مرة واحدة
 * ويُستورد من الصفحة والاختبارات معاً، فلا يتفرّق المنطق بين الواجهة والتخزين.
 */

// ========== الأنواع والثوابت ==========

/** تصنيفات المكتبة الثلاثة. */
export type MediaKind = "image" | "video" | "document";

/** تصنيفات المستندات المدعومة. */
export type MediaDocumentKind = "pdf" | "word" | "excel" | "powerpoint" | "text" | "other";

/** مرشّح العرض في الصفحة. */
export type MediaKindFilter = MediaKind | "all";

/** الحد الأقصى لحجم الملف الواحد (نفس سقف SQLite المحلي وقاعدة السحابة). */
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

/** أقصى ضلع للمصغّرة بالبكسل — يكفي لشبكة الصفحة ويقلّل الذاكرة إلى حدّها الأدنى. */
export const THUMBNAIL_MAX_EDGE = 360;
export const THUMBNAIL_QUALITY = 0.72;
export const THUMBNAIL_MIME = "image/jpeg";

/** بادئة مفتاح المصغّرة داخل جدول media_files نفسه. */
const THUMBNAIL_SUFFIX = ":thumb";

/** امتدادات المستندات المدعومة — تُعرض في الواجهة وفي دليل المكتبة. */
export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "ppt",
  "pptx",
  "txt",
] as const;

/** قيمة accept لحقل الرفع. */
export const MEDIA_ACCEPT = `image/*,video/*,${SUPPORTED_DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(",")}`;

/** أشهر السنة الهجرية بترتيب التقويم (1 = محرم). */
export const HIJRI_MONTHS = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
] as const;

// ========== التصنيف ==========

export interface MediaFileDescriptor {
  /** اسم الملف كما اختاره المستخدم. */
  name?: string;
  /** نوع MIME كما يبلّغ عنه المتصفح (قد يكون فارغاً). */
  type?: string;
  /** الحجم بالبايت. */
  size?: number;
}

export interface MediaFileInfo {
  kind: MediaKind;
  mimeType: string;
  /** نوع المستند إن كان الملف مستنداً، وإلا null. */
  documentKind: MediaDocumentKind | null;
  /** الامتداد بحروف صغيرة بلا نقطة (قد يكون فارغاً). */
  extension: string;
  /** هل يمكن توليد مصغّرة لهذا الملف؟ */
  thumbnailEligible: boolean;
}

const DOCUMENT_MIME_TYPES: Record<string, MediaDocumentKind> = {
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "text/csv": "excel",
  "application/vnd.ms-powerpoint": "powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "text/plain": "text",
};

const DOCUMENT_EXTENSIONS: Record<string, MediaDocumentKind> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  csv: "excel",
  ppt: "powerpoint",
  pptx: "powerpoint",
  txt: "text",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  ogv: "video/ogg",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

/** الامتداد من اسم الملف (بلا نقطة، بحروف صغيرة). */
export const mediaFileExtension = (name = ""): string => {
  const clean = name.split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
};

/** نوع MIME: قيمة المتصفح إن كانت مفيدة، وإلا يُستنتج من الامتداد. */
export const normalizeMediaMime = (type = "", name = ""): string => {
  const declared = type.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared;
  return MIME_BY_EXTENSION[mediaFileExtension(name)] ?? declared;
};

/** نوع المستند من MIME أو الامتداد. */
export const documentKindOf = (mime = "", name = ""): MediaDocumentKind | null => {
  const kind = DOCUMENT_MIME_TYPES[mime.trim().toLowerCase()];
  if (kind) return kind;
  return DOCUMENT_EXTENSIONS[mediaFileExtension(name)] ?? null;
};

/** هل الملف من نوع مدعوم؟ (بلا فحص الحجم) */
export const isSupportedMediaFile = (file: MediaFileDescriptor): boolean => {
  const mime = normalizeMediaMime(file.type, file.name);
  if (/^(image|video)\//.test(mime)) return true;
  return documentKindOf(mime, file.name) !== null;
};

/**
 * تصنيف ملف واحد. يرمي خطأً عربياً واضحاً لغير المدعوم حتى تعرضه الواجهة
 * كما هو، وتستخدمه طبقة التخزين للتحقق قبل الكتابة.
 */
export const classifyMediaFile = (file: MediaFileDescriptor): MediaFileInfo => {
  const extension = mediaFileExtension(file.name);
  const mimeType = normalizeMediaMime(file.type, file.name);

  if (mimeType.startsWith("image/")) {
    return { kind: "image", mimeType, documentKind: null, extension, thumbnailEligible: true };
  }
  if (mimeType.startsWith("video/")) {
    return { kind: "video", mimeType, documentKind: null, extension, thumbnailEligible: true };
  }

  const documentKind = documentKindOf(mimeType, file.name);
  if (documentKind) {
    return { kind: "document", mimeType, documentKind, extension, thumbnailEligible: false };
  }

  const label = file.name?.trim() || mimeType || "غير معروف";
  throw new Error(`نوع الملف غير مدعوم: ${label}`);
};

/** التحقق من الحجم (منفصل ليُستخدم في الرفع والتنزيل معاً). */
export const validateMediaSize = (bytes: number): void => {
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error("حجم ملف غير صالح");
  if (bytes > MAX_MEDIA_BYTES) {
    throw new Error(`الحد الأقصى للملف ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} ميجابايت`);
  }
};

// ========== التسميات ==========

const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  image: "صور",
  video: "فيديوهات",
  document: "مستندات",
};

const MEDIA_KIND_NOUNS: Record<MediaKind, string> = {
  image: "صورة",
  video: "فيديو",
  document: "مستند",
};

const DOCUMENT_KIND_LABELS: Record<MediaDocumentKind, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
  text: "نص",
  other: "مستند",
};

/** تسمية الجمع (للمرشّحات والعناوين). */
export const mediaKindLabel = (kind: MediaKind): string => MEDIA_KIND_LABELS[kind] ?? "ملفات";

/** تسمية المفرد (لشارة البطاقة). */
export const mediaKindNoun = (kind: MediaKind): string => MEDIA_KIND_NOUNS[kind] ?? "ملف";

/** تسمية نوع المستند بالعربية/اللاتينية. */
export const documentKindLabel = (kind: MediaDocumentKind | null | undefined): string =>
  kind ? (DOCUMENT_KIND_LABELS[kind] ?? "مستند") : "مستند";

/** تصحيح قيمة قديمة/مفقودة في قاعدة البيانات إلى تصنيف معروف. */
export const normalizeMediaKind = (value: unknown): MediaKind =>
  value === "video" || value === "document" ? value : "image";

/** هل القيمة تصنيفاً معروفاً؟ */
export const isMediaKind = (value: unknown): value is MediaKind =>
  value === "image" || value === "video" || value === "document";

// ========== حجم الملف ==========

/** صياغة عربية/مختصرة للحجم. */
export const formatMediaSize = (bytes: number): string => {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

// ========== التقويم الهجري ==========

/**
 * رقم الشهر الهجري (1..12) لتاريخ معيّن باستخدام تقويم أم القرى.
 * عند غياب دعم Intl للتقويم نرجع إلى الشهر الميلادي كخطة بديلة آمنة.
 */
export const hijriMonthOf = (date: Date = new Date()): number => {
  try {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      month: "numeric",
    }).formatToParts(date);
    const raw = parts.find((part) => part.type === "month")?.value ?? "";
    const month = Number(raw.replace(/\D/g, ""));
    if (Number.isInteger(month) && month >= 1 && month <= 12) return month;
  } catch {
    // لا دعم كامل للتقويم في هذه البيئة — نكمل للخطة البديلة.
  }
  return date.getMonth() + 1;
};

/** اسم الشهر الهجري من رقمه. */
export const hijriMonthLabel = (month: number): string =>
  HIJRI_MONTHS[Math.min(Math.max(Math.round(month), 1), 12) - 1];

/** عنوان مجموعة شهرية مثل: «جمادى الأولى 1448هـ». */
export const hijriMonthTitle = (month: number, year?: string): string =>
  `${hijriMonthLabel(month)}${year ? ` ${year}هـ` : ""}`;

// ========== المصغّرات ==========

/** مفتاح صف المصغّرة: نفس معرّف الملف مع لاحقة ثابتة. */
export const thumbnailKey = (id: string): string => `${id}${THUMBNAIL_SUFFIX}`;

/** هل هذا المفتاح لمصغّرة لا لملف أصلي؟ */
export const isThumbnailKey = (key: string): boolean => key.endsWith(THUMBNAIL_SUFFIX);

/** هل يمكن توليد مصغّرة لهذا التصنيف؟ */
export const isThumbnailSource = (kind: MediaKind): boolean => kind === "image" || kind === "video";

// ========== التجميع والتصفية ==========

export interface MediaLike {
  id: string;
  month: number;
  file_type: MediaKind | string;
  created_at?: string;
}

/** تصفية حسب التصنيف. */
export const filterMediaByKind = <T extends MediaLike>(items: T[], filter: MediaKindFilter): T[] =>
  filter === "all" ? items : items.filter((item) => normalizeMediaKind(item.file_type) === filter);

export interface MediaKindCounts {
  image: number;
  video: number;
  document: number;
  total: number;
  /** عناصر تحتاج مصغّرة (صور وفيديوهات). */
  thumbnailSources: number;
}

/** عدّادات التصنيفات لعرضها في المرشّحات. */
export const countMediaKinds = (items: MediaLike[]): MediaKindCounts => {
  const counts: MediaKindCounts = {
    image: 0,
    video: 0,
    document: 0,
    total: items.length,
    thumbnailSources: 0,
  };
  for (const item of items) {
    const kind = normalizeMediaKind(item.file_type);
    counts[kind] += 1;
    if (isThumbnailSource(kind)) counts.thumbnailSources += 1;
  }
  return counts;
};

export interface MediaMonthGroup<T> {
  month: number;
  label: string;
  items: T[];
}

const timeOf = (item: MediaLike): number => {
  const value = item.created_at ? Date.parse(item.created_at) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
};

/**
 * تجميع حسب الشهر الهجري. المجموعات تصاعدياً (محرم أولاً) والعناصر داخل كل
 * مجموعة الأحدث أولاً، وهو الترتيب المتوقّع في أرشيف المركز.
 */
export const groupMediaByMonth = <T extends MediaLike>(
  items: T[],
  options: { order?: "asc" | "desc" } = {},
): MediaMonthGroup<T>[] => {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const month = Math.min(Math.max(Math.round(Number(item.month) || 1), 1), 12);
    const bucket = groups.get(month);
    if (bucket) bucket.push(item);
    else groups.set(month, [item]);
  }
  const order = options.order ?? "asc";
  return [...groups.entries()]
    .sort(([a], [b]) => (order === "asc" ? a - b : b - a))
    .map(([month, groupItems]) => ({
      month,
      label: hijriMonthLabel(month),
      items: [...groupItems].sort((a, b) => timeOf(b) - timeOf(a)),
    }));
};

/** هل يحتاج هذا العنصر «تسريع العرض» (مصغّرة مفقودة)؟ */
export const needsThumbnail = (item: MediaLike, hasThumbnail: boolean): boolean =>
  isThumbnailSource(normalizeMediaKind(item.file_type)) && !hasThumbnail;
