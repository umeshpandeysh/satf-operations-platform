import { Users } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/Primitives";

export default function AssignmentsPage() {
  return (
    <PlaceholderPage
      title="Driver, Guide & Vehicle Assignments"
      description="The assignments module will allow dispatchers to manage guide rosters, driver allocations, vehicle fleet assignments, and vendor confirmations. Planned for Phase 2."
      plannedPhase="Phase 2"
      icon={Users}
    />
  );
}
