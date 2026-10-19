import { getEffectiveServerTours } from "@/lib/server-tours";
import { getIndiaTodayISO } from "@/lib/utils";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const today = getIndiaTodayISO();
  const initialTours = await getEffectiveServerTours(today);

  return <AssignmentsView initialTours={initialTours} referenceDate={today} />;
}
