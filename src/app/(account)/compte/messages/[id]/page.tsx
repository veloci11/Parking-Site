import Messages from "@/components/account/messages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Messages id={id} />;
}
