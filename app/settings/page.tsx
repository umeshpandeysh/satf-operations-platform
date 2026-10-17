import { getMockTours } from "@/lib/mock-data";
import { getIndiaTodayISO } from "@/lib/utils";
import { SettingsView } from "@/components/settings/SettingsView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const initialTours = getMockTours();
  const today = getIndiaTodayISO();

  return <SettingsView initialTours={initialTours} referenceDate={today} />;
}
