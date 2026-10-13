import { createFileRoute } from "@tanstack/react-router";
import Khatimat from "@/pages/Khatimat";

export const Route = createFileRoute("/_authenticated/khatimat")({
  head: () => ({
    meta: [
      { title: "كشف الخاتمين والخاتمات - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        name: "description",
        content: "قائمة الطلاب والطالبات الذين ختموا القرآن الكريم عبر جميع الأعوام.",
      },
      {
        property: "og:title",
        content: "كشف الخاتمين والخاتمات - مركز التوفق لتحفيظ القرآن الكريم",
      },
      {
        property: "og:description",
        content: "قائمة الطلاب والطالبات الذين ختموا القرآن الكريم عبر جميع الأعوام.",
      },
    ],
  }),
  component: Khatimat,
});
