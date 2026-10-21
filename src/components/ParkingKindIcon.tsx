import type { SVGProps } from "react";
import type { ParkingType } from "@/lib/types";

type ParkingKindIconProps = Omit<SVGProps<SVGSVGElement>, "type"> & {
  type: ParkingType;
  size?: number;
};

/** Decorative parking symbol; the adjacent type label supplies its meaning. */
export function ParkingKindIcon({
  type,
  size = 20,
  strokeWidth = 1.8,
  ...props
}: ParkingKindIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {type === "covered" ? (
        <>
          <path d="m2 8 10-5 10 5M3 8v13M21 8v13" />
          <path d="m6 15 1.5-4h9l1.5 4v4H6v-4ZM6 15h12M8 19v2M16 19v2" />
          <path d="M9 17h.01M15 17h.01" />
        </>
      ) : type === "box" ? (
        <>
          <path d="M3 21V7l9-4 9 4v14M7 21V10h10v11M7 14h10M7 18h10M2 21h20" />
          <path d="M11 18h2" />
        </>
      ) : type === "outdoor" ? (
        <>
          <path d="m4 12 2-5h12l2 5v7H4v-7ZM4 12h16M6 19v2M18 19v2" />
          <path d="M7 15h2M15 15h2" />
        </>
      ) : (
        <>
          <path d="M3 3h18v18H3zM12 3v18M3 12h18" />
          <path d="M6.5 9V6h2v1.5h-2M15.5 9V6h2v1.5h-2M6.5 18v-3h2v1.5h-2M15.5 18v-3h2v1.5h-2" />
        </>
      )}
    </svg>
  );
}
