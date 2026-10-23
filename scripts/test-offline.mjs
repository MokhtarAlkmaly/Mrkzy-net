const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { addEventListener() {}, visibilityState: "visible" };
const { createServer } = await import("vite");
const server = await createServer({
  root: process.cwd(),
  logLevel: "silent",
  server: { middlewareMode: true },
});
try {
  const { supabase } = await server.ssrLoadModule("/src/integrations/supabase/client.ts");
  const assert = (c, m) => {
    if (!c) throw new Error("FAIL: " + m);
    console.log("✓", m);
  };
  // إنشاء أول مستخدم (مسؤول) + جلسة
  let r = await supabase.auth.signUp({
    email: "admin@local",
    password: "123456",
    options: { data: { display_name: "المسؤول" } },
  });
  assert(!r.error && r.data.user, "إنشاء أول مستخدم محلي");
  const uid = r.data.user.id;
  let s = await supabase.auth.getSession();
  assert(s.data.session?.user?.id === uid, "الجلسة المحلية محفوظة");
  assert((await supabase.rpc("is_admin")).data === true, "أول مستخدم مسؤول");
  // طالب: إدخال برقم تسلسلي رقمي
  let ins = await supabase
    .from("students")
    .insert({ name: "طالب تجريبي", teacher: "معلم أ", user_id: uid })
    .select("id")
    .single();
  assert(!ins.error && typeof ins.data.id === "number", "إدخال طالب برقم رقمي " + ins.data?.id);
  const sid = ins.data.id;
  await supabase
    .from("year_data")
    .upsert(
      { student_id: sid, user_id: uid, year: "1447", teacher: "معلم أ" },
      { onConflict: "student_id,year" },
    );
  let q = await supabase.from("students").select("*").eq("user_id", uid).order("id");
  assert(q.data.length === 1 && q.data[0].name === "طالب تجريبي", "استعلام الطلاب مع فلتر وترتيب");
  // تحديث + maybeSingle
  let up = await supabase
    .from("students")
    .update({ name: "طالب معدّل" })
    .eq("id", sid)
    .select()
    .maybeSingle();
  assert(up.data?.name === "طالب معدّل", "تحديث طالب");
  // بوابة معلم محلية
  let portal = await supabase
    .from("teacher_portals")
    .insert({
      user_id: uid,
      teacher_name: "معلم أ",
      code: "testcode1",
      year: "1447",
      month: 3,
      active: true,
    })
    .select()
    .single();
  assert(!portal.error, "إنشاء رابط معلم");
  let open = await supabase.rpc("open_teacher_portal", { p_code: "testcode1" });
  assert(
    !open.error && open.data.length === 1 && open.data[0].student_name === "طالب معدّل",
    "فتح بوابة المعلم محلياً",
  );
  let sub = await supabase.rpc("submit_teacher_monthly", {
    p_code: "testcode1",
    p_student_id: sid,
    p_student_name: "طالب معدّل",
    p_year: "1447",
    p_month: 3,
    p_memorization_hifz_score: 9,
  });
  assert(!sub.error, "إرسال ترسيل معلم");
  let subs = await supabase
    .from("monthly_submissions")
    .select("*, portal:teacher_portals(teacher_name)")
    .eq("user_id", uid);
  assert(subs.data[0].portal?.teacher_name === "معلم أ", "ربط (join) الترسيل بالرابط");

  // بنك الأسئلة المجلدي: إنشاء وتعديل ومنع التكرار العربي وحذف.
  const examStorage = await server.ssrLoadModule("/src/utils/examStorage.ts");
  const writtenQuestion = {
    year: "1447",
    category: "حفظ",
    subject: "تجويد",
    question_type: "written",
    question: "ما حكم تجويد القرآن؟",
    choices: [],
    correct_answer: null,
    difficulty: "متوسط",
    notes: null,
  };
  const savedQuestion = await examStorage.saveExamQuestion(writtenQuestion);
  assert(savedQuestion.user_id === uid && savedQuestion.id, "حفظ سؤال محلي بمعرّف ومالك");
  const updatedQuestion = await examStorage.saveExamQuestion(
    { ...writtenQuestion, notes: "مراجعة محلية" },
    savedQuestion.id,
  );
  assert(
    updatedQuestion.created_at === savedQuestion.created_at &&
      updatedQuestion.notes === "مراجعة محلية",
    "تعديل السؤال مع الحفاظ على تاريخ إنشائه",
  );
  const batch = await examStorage.saveExamQuestions([
    { ...writtenQuestion, question: "مَا حَكْمُ تَجْوِيدِ الْقُرْآنِ؟" },
    {
      ...writtenQuestion,
      question: "اختر الحكم الصحيح",
      question_type: "mcq",
      choices: ["صحيح", "خطأ"],
      correct_answer: "صحيح",
    },
  ]);
  assert(batch.saved.length === 1 && batch.skipped === 1, "منع تكرار السؤال بعد إزالة التشكيل");
  const bank = await examStorage.loadExamQuestions("1447");
  assert(bank.length === 2, "قراءة بنك الأسئلة من MrkzyDatabase");
  for (const row of bank) await examStorage.deleteExamQuestion(row.id);
  assert((await examStorage.loadExamQuestions("1447")).length === 0, "حذف أسئلة البنك محلياً");

  const { classifyMediaFile, hijriMonthOf } = await server.ssrLoadModule(
    "/src/lib/mediaLibrary.ts",
  );
  assert(
    classifyMediaFile({ name: "تلاوة.mkv", type: "" }).kind === "video" &&
      classifyMediaFile({ name: "وثيقة.pdf", type: "" }).kind === "document",
    "تصنيف الوسائط بالامتداد عند غياب MIME",
  );
  const currentMonth = hijriMonthOf(new Date("2026-10-23T12:00:00Z"));
  assert(currentMonth >= 1 && currentMonth <= 12, "حساب رقم الشهر الهجري بأرقام قابلة للقراءة");
  const { carryTotalHifz, calculateTotalHifz, propagateTotalHifz } = await server.ssrLoadModule(
    "/src/utils/calculations.ts",
  );
  assert(
    carryTotalHifz("12", "3") === 12 && calculateTotalHifz(12, "4") === 16,
    "ترحيل إجمالي الحفظ التراكمي",
  );
  const propagated = propagateTotalHifz(
    [
      { year: "1447", parts: "4", base_hifz: "5", total_hifz: "9" },
      { year: "1448", parts: "1", base_hifz: "9", total_hifz: "10" },
    ],
    8,
  );
  assert(
    propagated[0].base_hifz === "8" &&
      propagated[0].total_hifz === "12" &&
      propagated[1].base_hifz === "12" &&
      propagated[1].total_hifz === "13",
    "انتشار تعديل الحفظ عبر كل الأعوام اللاحقة",
  );

  const { normalizeCenterProfile, normalizeCenterProfileDraft } = await server.ssrLoadModule(
    "/src/lib/center-profile.ts",
  );
  const normalizedProfile = normalizeCenterProfile({
    intro: "  تعريف محلي بالمركز  ",
    objectives: ["هدف أول", "هدف أول", ""],
  });
  assert(
    normalizedProfile.intro === "تعريف محلي بالمركز" &&
      normalizedProfile.objectives.length === 1 &&
      normalizeCenterProfileDraft({ intro: "مسودة", objectives: [] })?.intro === "مسودة",
    "تطبيع التعريف بالمركز ومسودته دون تكرار",
  );
  const centerWrite = await supabase.from("user_settings").upsert(
    {
      user_id: uid,
      center_profile: normalizedProfile,
      center_profile_draft: { intro: "مسودة", objectives: [], saved_at: new Date().toISOString() },
    },
    { onConflict: "user_id" },
  );
  const centerRead = await supabase
    .from("user_settings")
    .select("center_profile, center_profile_draft")
    .eq("user_id", uid)
    .maybeSingle();
  assert(
    !centerWrite.error &&
      centerRead.data?.center_profile?.intro === "تعريف محلي بالمركز" &&
      centerRead.data?.center_profile_draft?.intro === "مسودة",
    "حفظ التعريف والمسودة في إعدادات MrkzyDatabase",
  );

  await examStorage.saveExamQuestion({
    ...writtenQuestion,
    question: "سؤال خاص بحساب المسؤول",
  });

  // مستخدم ثانٍ + مشاركة قراءة
  let u2 = await supabase.auth.signUp({
    email: "user2@local",
    password: "123456",
    options: { data: { display_name: "قارئ" } },
  });
  assert(!u2.error && u2.data.user.id !== uid, "مستخدم محلي ثانٍ");
  assert((await supabase.rpc("is_admin")).data === false, "الثاني ليس مسؤولاً");
  assert(
    (await examStorage.loadExamQuestions("1447")).length === 0,
    "عزل بنك الأسئلة بين المستخدمين المحليين",
  );
  const cnt = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  assert(cnt.count === 1, "عدّ الصفوف count/head");
  // حذف
  await supabase.from("students").delete().eq("id", sid);
  let after = await supabase.from("students").select("*").eq("user_id", uid);
  assert(after.data.length === 0, "حذف طالب");
  console.log("\nكل الاختبارات المحلية نجحت ✅");
} finally {
  await server.close();
}
