import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Printer, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  teachers: string[];
  selectedTeacher: string;
  onTeacherChange: (value: string) => void;
  nameFilter: string;
  onNameFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  gradeFilter: string;
  onGradeFilterChange: (value: string) => void;
  partsFilter: string;
  onPartsFilterChange: (value: string) => void;
  cumulativeHifzFilter: string;
  onCumulativeHifzFilterChange: (value: string) => void;
  onPrintFiltered: () => void;
  hasFilters: boolean;
}

export const TableFilters = ({
  teachers,
  selectedTeacher,
  onTeacherChange,
  nameFilter,
  onNameFilterChange,
  statusFilter,
  onStatusFilterChange,
  gradeFilter,
  onGradeFilterChange,
  partsFilter,
  onPartsFilterChange,
  cumulativeHifzFilter,
  onCumulativeHifzFilterChange,
  onPrintFiltered,
  hasFilters,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/30 bg-card/80 shadow-sm backdrop-blur print:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 transition-colors hover:bg-primary/[0.03]"
      >
        <div className="flex items-center gap-2.5 text-primary">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] ring-1 ring-primary/10">
            <Filter className="h-3.5 w-3.5 text-primary/80" />
          </span>
          <span className="text-start">
            <span className="block text-[12px] font-bold tracking-tight">تصفية البيانات</span>
            <span className="block text-[10px] font-normal text-muted-foreground/70">
              ابحث ورتّب الكشف بسرعة
            </span>
          </span>
          {hasFilters && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              مفعّل
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasFilters && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onPrintFiltered();
              }}
              variant="secondary"
              size="sm"
              className="h-7 gap-1 rounded-full bg-primary/90 px-3 text-[11px] font-medium shadow-sm hover:bg-primary"
            >
              <Printer className="h-3 w-3" />
              طباعة
            </Button>
          )}
          {isOpen ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/60">
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            </span>
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/60">
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="grid grid-cols-1 gap-2 border-t border-border/30 bg-muted/15 px-3 py-3 sm:grid-cols-2 lg:grid-cols-6">
          <Select value={selectedTeacher} onValueChange={onTeacherChange}>
            <SelectTrigger className="h-8 rounded-full bg-background/70 text-[11px] font-medium border-border/30 shadow-sm">
              <SelectValue placeholder="المعلم/ة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعلمين والمعلمات</SelectItem>
              {teachers.map((teacher) => (
                <SelectItem key={teacher} value={teacher}>
                  {teacher}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={nameFilter}
              onChange={(e) => onNameFilterChange(e.target.value)}
              placeholder="بحث بالاسم..."
              className="h-8 rounded-full border-border/30 bg-background/70 pr-8 text-[11px] shadow-sm"
            />
          </div>

          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-8 rounded-full bg-background/70 text-[11px] font-medium border-border/30 shadow-sm">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">منقطع</SelectItem>
            </SelectContent>
          </Select>

          <Select value={gradeFilter} onValueChange={onGradeFilterChange}>
            <SelectTrigger className="h-8 rounded-full bg-background/70 text-[11px] font-medium border-border/30 shadow-sm">
              <SelectValue placeholder="التقدير" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التقديرات</SelectItem>
              <SelectItem value="ممتاز">ممتاز</SelectItem>
              <SelectItem value="جيد جداً">جيد جداً</SelectItem>
              <SelectItem value="جيد">جيد</SelectItem>
              <SelectItem value="مقبول">مقبول</SelectItem>
              <SelectItem value="ضعيف">ضعيف</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cumulativeHifzFilter} onValueChange={onCumulativeHifzFilterChange}>
            <SelectTrigger className="h-8 rounded-full bg-background/70 text-[11px] font-medium border-border/30 shadow-sm">
              <SelectValue placeholder="الحفظ التراكمي" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل فئات الحفظ</SelectItem>
              {Array.from({ length: 30 }, (_, index) => index + 1).map((part) => (
                <SelectItem key={part} value={String(part)}>
                  {part} جزء
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            value={partsFilter}
            onChange={(e) => onPartsFilterChange(e.target.value)}
            placeholder="الحد الأدنى للحفظ"
            min="0"
            className="h-8 rounded-full border-border/30 bg-background/70 text-[11px] shadow-sm"
          />
        </div>
      )}
    </div>
  );
};
