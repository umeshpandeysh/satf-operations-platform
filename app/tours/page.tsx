import { getIndiaTodayISO } from "@/lib/utils";
import { getEffectiveServerTours } from "@/lib/server-tours";
import { ToursView } from "@/components/tours/ToursView";

// Ensure /tours reliably generates live data relative to current Asia/Kolkata date per request
export const dynamic = "force-dynamic";

export default async function ToursPage() {
  const today = getIndiaTodayISO();
  const initialTours = await getEffectiveServerTours(today);

  return <ToursView initialTours={initialTours} referenceDate={today} />;
}
