import { Settings } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/Primitives";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="System Settings & Administration"
      description="Administrative configuration, user roles and permissions, destination catalog, and Excel migration preferences. Planned for Phase 3."
      plannedPhase="Phase 3"
      icon={Settings}
    />
  );
}
