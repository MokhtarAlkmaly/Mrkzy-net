/**
 * بنك الأسئلة — تخزين محلي بالكامل داخل MrkzyDatabase.
 *
 * هذه الواجهة توافق التحديثات القادمة من المشروع المرجعي، لكنها تستخدم
 * قاعدة البيانات المجلدية مباشرة بدلاً من SQLite السحابي/المزامنة. بذلك يعمل
 * إنشاء الأسئلة وتعديلها وحذفها دون إنترنت، وتدخل الأسئلة في النسخة
 * الاحتياطية نفسها مع بقية جداول التطبيق.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  createExamQuestion,
  examQuestionSchema,
  fromExamQuestionRow,
  normalizeQuestionText,
  sortExamQuestions,
  toExamQuestionRow,
  type ExamQuestion,
  type ExamQuestionInput,
  type ExamQuestionRow,
} from "@/lib/exam-questions";
import { folderDB, type DbRow } from "@/utils/folderDB";
import { getViewAsId, isViewingOtherUser } from "@/utils/viewAs";

const TABLE = "exam_questions";

const resolveOwnerId = async (): Promise<string> => {
  const viewing = getViewAsId();
  if (viewing) return viewing;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error("سجّل الدخول بحساب محلي قبل استخدام بنك الأسئلة.");
  return userId;
};

const assertWritableOwner = async (): Promise<string> => {
  if (isViewingOtherUser()) {
    throw new Error("أنت في وضع الاطلاع على بيانات مستخدم آخر — التعديل غير مسموح");
  }
  return resolveOwnerId();
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("تم إلغاء العملية", "AbortError");
};

const asRow = (question: ExamQuestion): DbRow => toExamQuestionRow(question) as unknown as DbRow;

const asQuestion = (row: DbRow): ExamQuestion =>
  fromExamQuestionRow(row as unknown as ExamQuestionRow);

/** كل أسئلة عام واحد من قاعدة الجهاز، بترتيب ثابت من الأحدث. */
export const loadExamQuestions = async (
  year: string,
  signal?: AbortSignal,
): Promise<ExamQuestion[]> => {
  throwIfAborted(signal);
  const ownerId = await resolveOwnerId();
  const rows = await folderDB.getAll(TABLE);
  throwIfAborted(signal);
  return sortExamQuestions(
    rows
      .filter((row) => row.user_id === ownerId && String(row.year ?? "") === String(year))
      .map(asQuestion),
  );
};

/** حفظ سؤال جديد أو تعديل سؤال موجود محلياً. */
export const saveExamQuestion = async (
  input: ExamQuestionInput,
  id?: string,
): Promise<ExamQuestion> => {
  const ownerId = await assertWritableOwner();
  const values = examQuestionSchema.parse(input);
  const existing = id
    ? (await folderDB.getAll(TABLE)).find((row) => row.id === id && row.user_id === ownerId)
    : undefined;
  if (id && !existing) throw new Error("السؤال غير موجود في بنك هذا الحساب.");
  const created = createExamQuestion(values, ownerId, id);
  const record: ExamQuestion = {
    ...created,
    created_at: typeof existing?.created_at === "string" ? existing.created_at : created.created_at,
  };
  await folderDB.upsert(TABLE, asRow(record));
  return record;
};

/** حفظ النماذج المولَّدة مع منع تكرار نص السؤال داخل العام نفسه. */
export const saveExamQuestions = async (
  inputs: ExamQuestionInput[],
): Promise<{ saved: ExamQuestion[]; skipped: number }> => {
  const ownerId = await assertWritableOwner();
  if (inputs.length === 0) return { saved: [], skipped: 0 };

  const year = String(inputs[0].year ?? "");
  const existing = (await folderDB.getAll(TABLE)).filter(
    (row) => row.user_id === ownerId && String(row.year ?? "") === year,
  );
  const seen = new Set(existing.map((row) => normalizeQuestionText(String(row.question ?? ""))));
  const saved: ExamQuestion[] = [];
  let skipped = 0;

  for (const input of inputs) {
    const values = examQuestionSchema.parse(input);
    const key = normalizeQuestionText(values.question);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    saved.push(createExamQuestion(values, ownerId));
  }

  if (saved.length > 0) await folderDB.upsert(TABLE, saved.map(asRow));
  return { saved, skipped };
};

/** حذف سؤال من قاعدة الجهاز، مع حماية ملكية الصف. */
export const deleteExamQuestion = async (id: string): Promise<{ id: string }> => {
  const ownerId = await assertWritableOwner();
  await folderDB.deleteWhere(TABLE, (row) => row.id === id && row.user_id === ownerId);
  return { id };
};

export { examQuestionErrorMessage } from "@/lib/exam-questions";
