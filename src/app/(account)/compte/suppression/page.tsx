import DeletionStatus from "@/components/account/deletion-status";
export const metadata = {
  title: "Suivi de suppression | GP Parking",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <DeletionStatus />;
}
