import { getMockTours } from "@/lib/mock-data";
import { getIndiaTodayISO } from "@/lib/utils";
import { ReportsView } from "@/components/reports/ReportsView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const initialTours = getMockTours();
  const today = getIndiaTodayISO();

  return <ReportsView initialTours={initialTours} referenceDate={today} />;
}
