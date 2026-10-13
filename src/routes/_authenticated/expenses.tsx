import { createFileRoute } from "@tanstack/react-router";
import Expenses from "@/pages/Expenses";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "مصروفات حفل التكريم - مركز التوفق لتحفيظ القرآن الكريم" },
      { name: "description", content: "تتبع مصروفات حفل تكريم حافظات القرآن الكريم." },
      { property: "og:title", content: "مصروفات حفل التكريم - مركز التوفق لتحفيظ القرآن الكريم" },
      { property: "og:description", content: "تتبع مصروفات حفل تكريم حافظات القرآن الكريم." },
    ],
  }),
  component: Expenses,
});
