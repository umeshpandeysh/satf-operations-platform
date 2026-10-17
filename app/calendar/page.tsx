import { Calendar as CalendarIcon } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/Primitives";

export default function CalendarPage() {
  return (
    <PlaceholderPage
      title="Operational Schedule & Calendar"
      description="The calendar module will provide multi-day tour views, arrival/departure flight tracking, and guide/vehicle schedule coordination. Planned for Phase 2."
      plannedPhase="Phase 2"
      icon={CalendarIcon}
    />
  );
}
