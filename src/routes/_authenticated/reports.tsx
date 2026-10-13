import { createFileRoute } from "@tanstack/react-router";
import Reports from "@/pages/Reports";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        name: "description",
        content:
          "ابحث عن أي طالب/طالبة واطبع تقريرًا شاملًا يضم كل بياناتها: المسابقة الرمضانية، المتابعة الشهرية، والتكريم.",
      },
    ],
  }),
  component: Reports,
});
