import { getIndiaTodayISO } from "@/lib/utils";
import { getMockTours } from "@/lib/mock-data";
import { ToursView } from "@/components/tours/ToursView";

// Ensure /tours reliably generates initial data relative to current Asia/Kolkata date per request
export const dynamic = "force-dynamic";

export default function ToursPage() {
  const today = getIndiaTodayISO();
  const initialTours = getMockTours(today);

  return <ToursView initialTours={initialTours} referenceDate={today} />;
}
