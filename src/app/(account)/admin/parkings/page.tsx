import RegistryManager from "@/components/registry/RegistryManager";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string }>;
}) {
  const params = await searchParams;
  return <RegistryManager initialListingId={params.listingId} />;
}
