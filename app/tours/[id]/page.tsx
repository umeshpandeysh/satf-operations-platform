import { notFound } from "next/navigation";
import { getTourById } from "@/lib/mock-data";
import { TourDetailClient } from "@/components/tours/TourDetailClient";

// Ensure tour detail page resolves live dates dynamically at runtime
export const dynamic = "force-dynamic";

interface TourDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TourDetailPage({ params }: TourDetailPageProps) {
  const { id } = await params;
  const tour = getTourById(id);

  if (!tour) {
    notFound();
  }

  return <TourDetailClient initialTour={tour} />;
}
