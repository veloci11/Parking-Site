import SceneManager from "@/components/maps/SceneManager";
import { z } from "zod";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string | string[] }>;
}) {
  const params = await searchParams;
  const listingId = z.string().uuid().safeParse(params.listingId);
  return (
    <SceneManager
      initialListingId={listingId.success ? listingId.data : undefined}
    />
  );
}
