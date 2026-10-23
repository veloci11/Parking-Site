import ListingWizard from "@/components/account/listing-wizard";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingWizard id={id} />;
}
