import { createFileRoute } from "@tanstack/react-router";
import Media from "@/pages/Media";

export const Route = createFileRoute("/_authenticated/media")({
  head: () => ({
    meta: [
      { title: "الوسائط والصور - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        name: "description",
        content: "معرض صور ووسائط المسابقة الرمضانية لمركز التوفق لتحفيظ القرآن الكريم.",
      },
      { property: "og:title", content: "الوسائط والصور - مركز التوفق لتحفيظ القرآن الكريم" },
      {
        property: "og:description",
        content: "معرض صور ووسائط المسابقة الرمضانية لمركز التوفق لتحفيظ القرآن الكريم.",
      },
    ],
  }),
  component: Media,
});
