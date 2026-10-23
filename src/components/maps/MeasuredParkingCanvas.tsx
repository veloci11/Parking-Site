"use client";

import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from "three";
import type { PublicScene } from "@/lib/scene-contract";
import { MeasuredParkingScene, WebGLContextGuard } from "./ParkingScene";

/** Loaded only for an approved measured model that has no precomputed image. */
export default function MeasuredParkingCanvas({
  manifest,
  selectedId,
  onSelect,
  onUnavailable,
}: {
  manifest: PublicScene["manifest"];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUnavailable: () => void;
}) {
  return (
    <Canvas
      className="gp-parking-canvas"
      orthographic
      shadows
      camera={{ position: [19, 25, 31], zoom: 20, near: 0.1, far: 250 }}
      dpr={[1, 1.75]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: "default" }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.shadowMap.type = PCFSoftShadowMap;
        gl.domElement.setAttribute(
          "aria-label",
          "Vue isométrique fixe du parking. Cliquez sur une place pour la consulter. Le mode Places permet aussi de la sélectionner au clavier.",
        );
      }}
    >
      <WebGLContextGuard onUnavailable={onUnavailable} />
      <MeasuredParkingScene
        manifest={manifest}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </Canvas>
  );
}
