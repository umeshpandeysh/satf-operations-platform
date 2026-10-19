import { getEffectiveServerTours } from "@/lib/server-tours";
import { getIndiaTodayISO } from "@/lib/utils";
import { CalendarView } from "@/components/calendar/CalendarView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const today = getIndiaTodayISO();
  const initialTours = await getEffectiveServerTours(today);

  return <CalendarView initialTours={initialTours} referenceDate={today} />;
}
