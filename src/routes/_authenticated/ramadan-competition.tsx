import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";

const title = "كشف المسابقة الرمضانية - مركز التوفق";
const description = "كشف المسابقة الرمضانية لحفظ القرآن الكريم - مركز التوفق لتحفيظ القرآن الكريم.";

export const Route = createFileRoute("/_authenticated/ramadan-competition")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});
