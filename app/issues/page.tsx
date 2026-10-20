import { Metadata } from "next";
import { getEmailGatewayConfiguration } from "@/lib/email-issues";
import { ClientIssuesView } from "@/components/issues/ClientIssuesView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Client Issues & Communications | SATF Operations",
  description: "Client email tracking, flight delay notices, and coordinator inquiries.",
};

export default function ClientIssuesPage() {
  const gateway = getEmailGatewayConfiguration();

  return <ClientIssuesView initialGateway={gateway} />;
}
