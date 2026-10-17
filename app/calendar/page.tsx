import { getMockTours } from "@/lib/mock-data";
import { getIndiaTodayISO } from "@/lib/utils";
import { CalendarView } from "@/components/calendar/CalendarView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  const initialTours = getMockTours();
  const today = getIndiaTodayISO();

  return <CalendarView initialTours={initialTours} referenceDate={today} />;
}
