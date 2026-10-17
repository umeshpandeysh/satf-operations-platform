import { BarChart2 } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/Primitives";

export default function ReportsPage() {
  return (
    <PlaceholderPage
      title="Operational Reports & Manifests"
      description="The reports module will generate daily arrival manifests, hotel rooming lists, driver duty slips, and operational summaries. Planned for Phase 2."
      plannedPhase="Phase 2"
      icon={BarChart2}
    />
  );
}
