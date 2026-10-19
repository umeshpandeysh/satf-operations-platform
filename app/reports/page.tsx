import { getEffectiveServerTours } from "@/lib/server-tours";
import { getIndiaTodayISO } from "@/lib/utils";
import { ReportsView } from "@/components/reports/ReportsView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const today = getIndiaTodayISO();
  const initialTours = await getEffectiveServerTours(today);

  return <ReportsView initialTours={initialTours} referenceDate={today} />;
}
