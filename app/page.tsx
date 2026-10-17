import { getBaseTours } from "@/lib/server-tours";
import { getIndiaTodayISO } from "@/lib/utils";
import { DashboardView } from "@/components/dashboard/DashboardView";

// Ensure dashboard calculates live dates at runtime per request
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = getIndiaTodayISO();
  const initialTours = getBaseTours(today);

  return <DashboardView initialTours={initialTours} today={today} />;
}
