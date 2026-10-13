import { createFileRoute } from "@tanstack/react-router";
import Awards from "@/pages/Awards";

export const Route = createFileRoute("/_authenticated/awards")({
  head: () => ({
    meta: [
      { title: "الجوائز والإكراميات - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        name: "description",
        content:
          "متابعة جوائز وإكراميات الطلاب والطالبات والمعلمون والمعلمات في المسابقة الرمضانية.",
      },
      { property: "og:title", content: "الجوائز والإكراميات - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        property: "og:description",
        content:
          "متابعة جوائز وإكراميات الطلاب والطالبات والمعلمون والمعلمات في المسابقة الرمضانية.",
      },
    ],
  }),
  component: Awards,
});
