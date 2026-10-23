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
          <path d="M2 5h20M4 5v16M20 5v16" />
          <path d="M9 19V10h3.5a3 3 0 0 1 0 6H9" />
        </>
      ) : type === "box" ? (
        <>
          <path d="M3 21V5h18v16M7 21V9h10v12M7 13h10M7 17h10" />
        </>
      ) : type === "outdoor" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M9 17V7h3.5a3.5 3.5 0 0 1 0 7H9" />
        </>
      ) : (
        <>
          <rect x="6" y="3" width="15" height="15" rx="2" />
          <path d="M3 7v12a2 2 0 0 0 2 2h12M11 14V7h2.5a2.5 2.5 0 0 1 0 5H11" />
        </>
      )}
    </svg>
  );
}
