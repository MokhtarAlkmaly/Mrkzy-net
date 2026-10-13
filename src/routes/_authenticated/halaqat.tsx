import { createFileRoute } from "@tanstack/react-router";
import Halaqat from "@/pages/Halaqat";

export const Route = createFileRoute("/_authenticated/halaqat")({
  head: () => ({
    meta: [
      { title: "إدارة الحلقات - نظام مركز التوفق" },
      {
        name: "description",
        content: "إدارة حلقات القرآن وربط الطلاب بالمعلمين والمعلمات حسب العام.",
      },
    ],
  }),
  component: Halaqat,
});
