import { getBaseTours } from "@/lib/server-tours";
import { getIndiaTodayISO } from "@/lib/utils";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";

// Ensure dynamic date generation on Asia/Kolkata reference time
export const dynamic = "force-dynamic";

export default function AssignmentsPage() {
  const initialTours = getBaseTours();
  const today = getIndiaTodayISO();

  return <AssignmentsView initialTours={initialTours} referenceDate={today} />;
}
