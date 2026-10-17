import { getIndiaTodayISO } from "@/lib/utils";
import { getBaseTours } from "@/lib/server-tours";
import { ToursView } from "@/components/tours/ToursView";

// Ensure /tours reliably generates initial data relative to current Asia/Kolkata date per request
export const dynamic = "force-dynamic";

export default function ToursPage() {
  const today = getIndiaTodayISO();
  const initialTours = getBaseTours(today);

  return <ToursView initialTours={initialTours} referenceDate={today} />;
}
