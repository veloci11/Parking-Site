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
  strokeWidth = 2,
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
          <path d="m3 8 9-5 9 5M5 7v14M19 7v14" />
          <path d="M9 20V10h3.5a3 3 0 0 1 0 6H9" />
        </>
      ) : type === "box" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="1.5" />
          <path d="M3 7h18M9 19V10h3.5a3 3 0 0 1 0 6H9" />
        </>
      ) : type === "outdoor" ? (
        <path d="M8 21V4h5a5 5 0 0 1 0 10H8" />
      ) : (
        <>
          <path d="M3 17V3h14" />
          <rect x="6" y="6" width="15" height="15" rx="1.5" />
          <path d="M10 19v-9h3a2.75 2.75 0 0 1 0 5.5h-3" />
        </>
      )}
    </svg>
  );
}
