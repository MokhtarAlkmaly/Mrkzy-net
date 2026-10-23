/**
 * اسم جزء الفئة في اسم ملف نماذج الطلاب.
 * إذا اشتمل التوليد التلقائي على فئات متعددة، نذكر حتى ثلاث فئات فقط كي لا
 * يصبح اسم الملف طويلاً جدًا، مع توضيح أن التوليد شمل فئات أخرى.
 */
export const studentPaperCategoryFileName = (labels: readonly string[]): string => {
  const categories = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (categories.length === 0) return "فئة_غير_محددة";

  const visibleCategories =
    categories.length > 3 ? [...categories.slice(0, 2), "فئات_أخرى"] : categories;
  return visibleCategories
    .map((label) =>
      label
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("_");
};
