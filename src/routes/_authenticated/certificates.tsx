import { createFileRoute } from "@tanstack/react-router";
import Certificates from "@/pages/Certificates";

export const Route = createFileRoute("/_authenticated/certificates")({
  head: () => ({
    meta: [
      { title: "الشهادات والتكريم - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        name: "description",
        content: "إصدار وطباعة شهادات التكريم للطلاب والطالبات والمعلمين والمعلمات.",
      },
      { property: "og:title", content: "الشهادات والتكريم - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        property: "og:description",
        content: "إصدار وطباعة شهادات التكريم للطلاب والطالبات والمعلمين والمعلمات.",
      },
    ],
  }),
  component: Certificates,
});
