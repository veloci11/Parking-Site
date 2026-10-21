"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Line, RoundedBox } from "@react-three/drei";
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  OrthographicCamera,
  RepeatWrapping,
  Shape,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from "three";
import type { PublicScene } from "@/lib/scene-contract";

export interface DisplaySpace {
  id: string;
  number: string;
  x: number;
  z: number;
  width: number;
  length: number;
  available: boolean;
  areaM2?: number | null;
}

type Manifest = PublicScene["manifest"];

/** Ignore the intentional context loss that the renderer triggers after unmount. */
export function WebGLContextGuard({
  onUnavailable,
}: {
  onUnavailable: () => void;
}) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const lost = () => onUnavailable();
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onUnavailable]);
  return null;
}

/** Materials describe a neutral concrete surface, never an observed condition. */
function concreteTexture(wall = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(512, 512);
  let seed = wall ? 719 : 417;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = (i / 4) % 512;
    const y = Math.floor(i / 4 / 512);
    const cloud =
      Math.sin(x * 0.037 + Math.sin(y * 0.018) * 2) * 3.5 +
      Math.cos(y * 0.026 + x * 0.01) * 4;
    const grain = ((seed >>> 24) / 255 - 0.5) * 15;
    const shade = (wall ? 200 : 160) + cloud * 1.6 + grain;
    pixels.data[i] = shade + 3;
    pixels.data[i + 1] = shade + 2;
    pixels.data[i + 2] = shade;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  // Subtle shuttering joints belong only to the neutral material pattern.
  if (wall) {
    context.strokeStyle = "rgba(108,104,98,.11)";
    context.lineWidth = 1;
    for (const y of [128, 384]) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(512, y);
      context.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(wall ? 3 : 4, wall ? 2 : 4);
  texture.anisotropy = 4;
  return texture;
}

function paintedTexture(text: string, dark = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = dark ? "#34313B" : "#FFFFFF";
  context.font = "600 150px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 135);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function protectionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#E7C34F";
  context.fillRect(0, 0, 128, 256);
  context.strokeStyle = "#252831";
  context.lineWidth = 35;
  for (let y = -180; y < 440; y += 85) {
    context.beginPath();
    context.moveTo(-35, y);
    context.lineTo(170, y + 205);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function useConcrete() {
  const floor = useMemo(() => concreteTexture(), []);
  const wall = useMemo(() => concreteTexture(true), []);
  const protection = useMemo(protectionTexture, []);
  useEffect(
    () => () => {
      floor?.dispose();
      wall?.dispose();
      protection?.dispose();
    },
    [floor, wall, protection],
  );
  return { floor, wall, protection };
}

/** A single, fitted axonometric camera. There are deliberately no orbit/pan controls. */
function FixedCamera({ extent = 25 }: { extent?: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(19, 25, 31);
    camera.lookAt(0, 0.4, 0);
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(
        size.width / (extent * 1.15),
        size.height / (extent * 0.9),
      );
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, extent, size.width, size.height, invalidate]);
  return null;
}

function Lighting() {
  return (
    <>
      <color attach="background" args={["#FFFFFF"]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#FFFFFF", "#A4A2A0", 0.85]} />
      <directionalLight
        position={[-9, 22, 10]}
        color="#FFF9EE"
        intensity={2.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={0.5}
        shadow-camera-far={70}
        shadow-normalBias={0.035}
        shadow-bias={-0.0001}
        shadow-radius={5}
      />
      <directionalLight
        position={[15, 10, -10]}
        color="#EAE8FF"
        intensity={0.65}
      />
      <mesh
        position={[0, -0.43, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[150, 150]} />
        <shadowMaterial opacity={0.14} />
      </mesh>
    </>
  );
}

function GroundNumber({
  number,
  x,
  z,
  flipped = false,
}: {
  number: string;
  x: number;
  z: number;
  flipped?: boolean;
}) {
  const texture = useMemo(() => paintedTexture(number), [number]);
  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );
  return (
    <mesh
      position={[x, 0.048, z]}
      rotation={[-Math.PI / 2, 0, flipped ? Math.PI : 0]}
    >
      <planeGeometry args={[2.1, 1.05]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function SelectionLabel({
  number,
  areaM2,
  position,
}: {
  number: string;
  areaM2?: number | null;
  position: [number, number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#FFFFFF";
    context.strokeStyle = "#E7DDFF";
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect(3, 3, 762, 186, 38);
    context.fill();
    context.stroke();
    context.fillStyle = "#6D28FF";
    context.font = "600 78px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      `Place ${number}${areaM2 ? ` · ${areaM2} m²` : ""}`,
      384,
      99,
    );
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, [number, areaM2]);
  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );
  return (
    <group position={position}>
      <sprite position={[0, 0.8, 0]} scale={[5.8, 1.45, 1]} renderOrder={8}>
        <spriteMaterial
          map={texture}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <Line
        points={[
          [0, 0.2, 0],
          [0, -0.58, 0],
        ]}
        color="#FFFFFF"
        lineWidth={1.5}
      />
      <mesh position={[0, -0.6, 0]} renderOrder={8}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshBasicMaterial color="#FFFFFF" depthTest={false} />
      </mesh>
      <mesh position={[0, -0.6, 0.08]} renderOrder={9}>
        <sphereGeometry args={[0.085, 16, 16]} />
        <meshBasicMaterial color="#6D28FF" depthTest={false} />
      </mesh>
    </group>
  );
}

function Stall({
  slot,
  selected,
  onSelect,
}: {
  slot: DisplaySpace;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const w = slot.width / 2,
    l = slot.length / 2;
  const points: [number, number, number][] = [
    [-w, 0.035, -l],
    [w, 0.035, -l],
    [w, 0.035, l],
    [-w, 0.035, l],
    [-w, 0.035, -l],
  ];
  return (
    <group position={[slot.x, 0, slot.z]}>
      {slot.available ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.025, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(slot.id);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <planeGeometry args={[slot.width, slot.length]} />
          <meshStandardMaterial
            color={selected ? "#E5CD86" : "#C9A558"}
            transparent
            opacity={selected ? 0.67 : 0.18}
            roughness={0.88}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
      <Line
        points={points}
        color={selected ? "#6D28FF" : slot.available ? "#C9A558" : "#FFFFFF"}
        lineWidth={selected ? 2.7 : 1.7}
      />
      {selected ? (
        <Line
          points={points.map(([x, y, z]) => [x * 0.97, y + 0.003, z * 0.985])}
          color="#F6E5A4"
          lineWidth={1}
        />
      ) : null}
      <GroundNumber number={slot.number} x={0} z={l - 0.7} />
      {selected ? (
        <SelectionLabel
          number={slot.number}
          areaM2={slot.areaM2}
          position={[0, 1.3, -0.15]}
        />
      ) : null}
    </group>
  );
}

function Railing({
  x,
  z,
  length,
  rotation = 0,
  y = 0,
}: {
  x: number;
  z: number;
  length: number;
  rotation?: number;
  y?: number;
}) {
  return (
    <group position={[x, y, z]} rotation={[0, rotation, 0]}>
      {[0.52, 1.02].map((height) => (
        <mesh key={height} position={[0, height, 0]} castShadow>
          <boxGeometry args={[0.045, 0.045, length]} />
          <meshStandardMaterial
            color="#777D84"
            roughness={0.36}
            metalness={0.72}
          />
        </mesh>
      ))}
      {Array.from({ length: Math.ceil(length / 1.6) + 1 }, (_, i) => (
        <mesh
          key={i}
          position={[
            0,
            0.52,
            -length / 2 + (i * length) / Math.ceil(length / 1.6),
          ]}
          castShadow
        >
          <boxGeometry args={[0.045, 1.04, 0.045]} />
          <meshStandardMaterial
            color="#7A8086"
            metalness={0.72}
            roughness={0.34}
          />
        </mesh>
      ))}
    </group>
  );
}

function CarPanel({
  points,
  color,
  metallic = true,
}: {
  points: [number, number, number][];
  color: string;
  metallic?: boolean;
}) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute(
      "position",
      new Float32BufferAttribute(points.flat(), 3),
    );
    result.setIndex([0, 1, 2, 0, 2, 3]);
    result.computeVertexNormals();
    return result;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow>
      <meshPhysicalMaterial
        color={color}
        metalness={metallic ? 0.5 : 0.2}
        roughness={metallic ? 0.24 : 0.1}
        clearcoat={1}
        side={DoubleSide}
      />
    </mesh>
  );
}

/** Context vehicles are used only in the explicitly fictional demonstration. */
function DemoCar({
  x,
  z,
  rotation = 0,
  color = "#B3B7BC",
}: {
  x: number;
  z: number;
  rotation?: number;
  color?: string;
}) {
  const body = useMemo(() => {
    const profile = new Shape();
    profile.moveTo(-2.02, 0.39);
    profile.quadraticCurveTo(-2.12, 0.58, -2.02, 0.78);
    profile.lineTo(-1.42, 0.92);
    profile.quadraticCurveTo(-0.7, 0.98, 0.2, 0.98);
    profile.lineTo(1.12, 0.96);
    profile.lineTo(1.42, 0.93);
    profile.lineTo(2.02, 0.81);
    profile.quadraticCurveTo(2.15, 0.73, 2.12, 0.49);
    profile.lineTo(1.8, 0.39);
    profile.closePath();
    return profile;
  }, []);
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.84]} castShadow receiveShadow>
          <extrudeGeometry
            args={[
              body,
              {
                depth: 1.68,
                bevelEnabled: true,
                bevelSize: 0.07,
                bevelThickness: 0.07,
                bevelSegments: 3,
                steps: 1,
              },
            ]}
          />
          <meshPhysicalMaterial
            color={color}
            roughness={0.24}
            metalness={0.62}
            clearcoat={1}
            clearcoatRoughness={0.16}
          />
        </mesh>
        <RoundedBox
          position={[0.05, 0.42, 0]}
          args={[3.8, 0.3, 1.72]}
          radius={0.11}
          smoothness={3}
          castShadow
        >
          <meshStandardMaterial
            color={color}
            metalness={0.65}
            roughness={0.24}
          />
        </RoundedBox>
        {/* A tapered cabin, rather than a full-width box, preserves a car silhouette. */}
        <CarPanel
          points={[
            [0.64, 1.44, -0.62],
            [1.19, 0.98, -0.79],
            [1.19, 0.98, 0.79],
            [0.64, 1.44, 0.62],
          ]}
          color="#3F515F"
          metallic={false}
        />
        <CarPanel
          points={[
            [-1.28, 0.97, -0.79],
            [-0.77, 1.44, -0.62],
            [-0.77, 1.44, 0.62],
            [-1.28, 0.97, 0.79],
          ]}
          color="#3A4A55"
          metallic={false}
        />
        <RoundedBox
          position={[-0.065, 1.46, 0]}
          args={[1.55, 0.09, 1.32]}
          radius={0.045}
          smoothness={3}
          castShadow
        >
          <meshPhysicalMaterial
            color={color}
            metalness={0.55}
            roughness={0.24}
            clearcoat={1}
          />
        </RoundedBox>
        {[-1, 1].map((side) => (
          <group key={`cabin-${side}`}>
            <CarPanel
              points={[
                [-1.2, 1.0, side * 0.8],
                [-0.73, 1.41, side * 0.635],
                [-0.12, 1.41, side * 0.635],
                [-0.12, 1.0, side * 0.8],
              ]}
              color="#3F515F"
              metallic={false}
            />
            <CarPanel
              points={[
                [0.0, 1.0, side * 0.8],
                [0.0, 1.41, side * 0.635],
                [0.61, 1.41, side * 0.635],
                [1.1, 1.0, side * 0.8],
              ]}
              color="#384A58"
              metallic={false}
            />
            <CarPanel
              points={[
                [-0.12, 1.0, side * 0.8],
                [-0.12, 1.42, side * 0.635],
                [0, 1.42, side * 0.635],
                [0, 1.0, side * 0.8],
              ]}
              color="#222932"
            />
          </group>
        ))}
        {[-0.884, 0.884].map((side) => (
          <group key={side} position={[0, 0, side]}>
            {[-0.45, 0.45].map((door) => (
              <mesh
                key={door}
                position={[door, 0.86, side < 0 ? -0.018 : 0.018]}
              >
                <boxGeometry args={[0.17, 0.025, 0.025]} />
                <meshStandardMaterial
                  color="#D9DDE1"
                  metalness={0.8}
                  roughness={0.2}
                />
              </mesh>
            ))}
            <RoundedBox
              position={[0.91, 1.0, side < 0 ? -0.13 : 0.13]}
              args={[0.22, 0.13, 0.25]}
              radius={0.045}
              smoothness={2}
            >
              <meshStandardMaterial
                color={color}
                metalness={0.6}
                roughness={0.2}
              />
            </RoundedBox>
            {[-1.34, 1.36].map((axle) => (
              <group key={axle} position={[axle, 0.36, 0]}>
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[0.34, 0.34, 0.21, 24]} />
                  <meshStandardMaterial color="#24262A" roughness={0.92} />
                </mesh>
                <mesh
                  position={[0, 0, side < 0 ? -0.12 : 0.12]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.22, 0.22, 0.023, 16]} />
                  <meshStandardMaterial
                    color="#B9BEC4"
                    metalness={0.82}
                    roughness={0.24}
                  />
                </mesh>
                <mesh
                  position={[0, 0, side < 0 ? -0.135 : 0.135]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.09, 0.09, 0.025, 8]} />
                  <meshStandardMaterial
                    color="#656C76"
                    metalness={0.7}
                    roughness={0.3}
                  />
                </mesh>
              </group>
            ))}
          </group>
        ))}
        {[-0.57, 0.57].map((side) => (
          <group key={side}>
            <mesh position={[2.12, 0.75, side]}>
              <boxGeometry args={[0.025, 0.12, 0.43]} />
              <meshStandardMaterial
                color="#F1F5F7"
                emissive="#D5DEE1"
                emissiveIntensity={0.35}
                roughness={0.25}
              />
            </mesh>
            <mesh position={[-2.07, 0.75, side]}>
              <boxGeometry args={[0.025, 0.1, 0.4]} />
              <meshStandardMaterial color="#9F252B" roughness={0.24} />
            </mesh>
          </group>
        ))}
        <mesh position={[2.14, 0.52, 0]}>
          <boxGeometry args={[0.02, 0.14, 0.75]} />
          <meshStandardMaterial color="#292E35" roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}

export function DemoParkingScene({
  spaces,
  selectedId,
  onSelect,
  level,
}: {
  spaces: DisplaySpace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  level: number;
}) {
  const concrete = useConcrete();
  const columns = [-10.1, -4.45, 1.55, 5.65];
  return (
    <>
      <Lighting />
      <FixedCamera extent={26} />
      <group rotation={[0, -0.08, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[23, 0.36, 19]} />
          <meshStandardMaterial
            color="#CFCCC5"
            map={concrete.floor}
            bumpMap={concrete.floor}
            bumpScale={0.018}
            roughness={0.78}
          />
        </mesh>
        {/* Full back and left walls, low front and right cutaway: the interior stays legible. */}
        <mesh position={[0, 1.5, -9.35]} castShadow receiveShadow>
          <boxGeometry args={[23, 3, 0.3]} />
          <meshStandardMaterial
            map={concrete.wall}
            color="#FFFFFF"
            bumpMap={concrete.wall}
            bumpScale={0.025}
            roughness={0.94}
          />
        </mesh>
        <mesh position={[-11.35, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 3, 19]} />
          <meshStandardMaterial
            map={concrete.wall}
            color="#FFFFFF"
            bumpMap={concrete.wall}
            bumpScale={0.025}
            roughness={0.94}
          />
        </mesh>
        <mesh position={[0, 0.32, 9.35]} castShadow receiveShadow>
          <boxGeometry args={[23, 0.64, 0.3]} />
          <meshStandardMaterial
            map={concrete.wall}
            color="#FFFFFF"
            roughness={0.94}
          />
        </mesh>
        <mesh position={[11.35, 0.32, 1.0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.64, 16.7]} />
          <meshStandardMaterial
            map={concrete.wall}
            color="#FFFFFF"
            roughness={0.94}
          />
        </mesh>
        {[-7.7, -1.8, 4.2].map((x) => (
          <mesh key={`joint-${x}`} position={[x, 0.006, 0]}>
            <boxGeometry args={[0.014, 0.006, 18.7]} />
            <meshStandardMaterial color="#8C8A85" transparent opacity={0.28} />
          </mesh>
        ))}
        {columns.map((x) =>
          [-2.15, 2.15].map((z) => (
            <group key={`${x}-${z}`} position={[x, 0, z]}>
              <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.54, 3, 0.54]} />
                <meshStandardMaterial
                  map={concrete.wall}
                  color="#FFFFFF"
                  bumpMap={concrete.wall}
                  bumpScale={0.02}
                  roughness={0.92}
                />
              </mesh>
              <mesh position={[0, 2.94, 0]} castShadow>
                <boxGeometry args={[0.78, 0.18, 0.78]} />
                <meshStandardMaterial
                  map={concrete.wall}
                  color="#F3F0E9"
                  roughness={0.9}
                />
              </mesh>
              <mesh position={[0, 0.69, z < 0 ? 0.282 : -0.282]}>
                <planeGeometry args={[0.46, 1.15]} />
                <meshStandardMaterial
                  map={concrete.protection}
                  side={DoubleSide}
                  roughness={0.7}
                />
              </mesh>
              <mesh position={[0.282, 0.69, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[0.46, 1.15]} />
                <meshStandardMaterial
                  map={concrete.protection}
                  side={DoubleSide}
                  roughness={0.7}
                />
              </mesh>
            </group>
          )),
        )}
        {spaces.map((space) => (
          <Stall
            key={space.id}
            slot={space}
            selected={selectedId === space.id}
            onSelect={onSelect}
          />
        ))}
        {[-8, -2.5, 3.4, 8.2].map((x) => (
          <group key={`light-${x}`}>
            <mesh position={[x, 2.28, -9.16]}>
              <boxGeometry args={[1.9, 0.16, 0.1]} />
              <meshStandardMaterial
                color="#757C80"
                metalness={0.7}
                roughness={0.4}
              />
            </mesh>
            <mesh position={[x, 2.26, -9.09]}>
              <boxGeometry args={[1.78, 0.07, 0.045]} />
              <meshStandardMaterial
                color="#FFFEED"
                emissive="#FFF4D7"
                emissiveIntensity={2.7}
              />
            </mesh>
            <pointLight
              position={[x, 1.9, -7.8]}
              intensity={8}
              distance={5}
              decay={2}
              color="#FFF5DC"
            />
          </group>
        ))}
        {/* Demonstration access ramp and pedestrian stair, never added to measured scenes. */}
        <group position={[8.95, 0.88, -1.35]} rotation={[0.14, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[3.45, 0.2, 15.9]} />
            <meshStandardMaterial
              map={concrete.floor}
              color="#E4E2DC"
              roughness={0.84}
            />
          </mesh>
          {[-1.74, 1.74].map((x) => (
            <group key={x}>
              <mesh position={[x, 0.23, 0]} castShadow>
                <boxGeometry args={[0.16, 0.46, 16]} />
                <meshStandardMaterial
                  map={concrete.wall}
                  color="#FFFFFF"
                  roughness={0.9}
                />
              </mesh>
              <Railing x={x} y={0.46} z={0} length={15.9} />
            </group>
          ))}
          <Line
            points={[
              [0, 0.115, -5],
              [0, 0.115, 5],
            ]}
            color="#F2F0E7"
            lineWidth={1.4}
            dashed
            dashSize={0.55}
            gapSize={0.55}
          />
        </group>
        <group position={[5.95, 0, -7.65]}>
          {Array.from({ length: 11 }, (_, i) => (
            <mesh
              key={i}
              position={[0, 0.13 * (i + 1), -i * 0.27]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1.28, 0.26 * (i + 1), 0.28]} />
              <meshStandardMaterial
                map={concrete.wall}
                color="#F4F1EC"
                roughness={0.9}
              />
            </mesh>
          ))}
          <group position={[0.69, 0.55, -1.35]} rotation={[0.45, 0, 0]}>
            <Railing x={0} z={0} length={3.1} />
          </group>
        </group>
        {spaces
          .filter((space) => !space.available)
          .filter((_, index) => index === 1 || index === 4)
          .map((space, index) => (
            <DemoCar
              key={`car-${space.id}`}
              x={space.x}
              z={space.z - 0.1}
              rotation={space.z < 0 ? 0 : Math.PI}
              color={index === 0 ? "#B8BDC1" : "#8D969D"}
            />
          ))}
        <Railing
          x={8.95}
          z={-9.38}
          y={2.12}
          length={3.4}
          rotation={Math.PI / 2}
        />
        <mesh position={[-10.99, 1.02, 6.6]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.58, 0.42]} />
          <meshStandardMaterial color="#3F6555" roughness={0.8} />
        </mesh>
        <GroundNumber
          number={String(level).replace("-", "−")}
          x={8.92}
          z={6.85}
        />
      </group>
    </>
  );
}

function MetricShape({
  points,
  base = 0,
  height = 0.2,
  endHeight,
  map,
  color = "#FFFFFF",
  transparent = false,
  selected = false,
}: {
  points: [number, number][];
  base?: number;
  height?: number;
  endHeight?: number;
  map?: CanvasTexture | null;
  color?: string;
  transparent?: boolean;
  selected?: boolean;
}) {
  const shape = useMemo(() => {
    const result = new Shape();
    points.forEach(([x, z], index) =>
      index === 0 ? result.moveTo(x, -z) : result.lineTo(x, -z),
    );
    result.closePath();
    return result;
  }, [points]);
  const ramp = useMemo(() => {
    if (endHeight === undefined) return null;
    const vertices: number[] = [],
      indices: number[] = [];
    const min = Math.min(...points.map((point) => point[1]));
    const range = Math.max(...points.map((point) => point[1])) - min || 1;
    points.forEach(([x, z]) => vertices.push(x, base, z));
    points.forEach(([x, z]) =>
      vertices.push(
        x,
        base + height + ((endHeight - height) * (z - min)) / range,
        z,
      ),
    );
    const count = points.length;
    ShapeUtils.triangulateShape(
      points.map(([x, z]) => new Vector2(x, z)),
      [],
    ).forEach((triangle) =>
      indices.push(
        triangle[0] + count,
        triangle[2] + count,
        triangle[1] + count,
        ...triangle,
      ),
    );
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      indices.push(i, j, j + count, i, j + count, i + count);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [points, base, height, endHeight]);
  useEffect(
    () => () => {
      ramp?.dispose();
    },
    [ramp],
  );
  const material = (
    <meshStandardMaterial
      map={map}
      color={color}
      roughness={0.85}
      bumpMap={map}
      bumpScale={0.015}
      side={DoubleSide}
      transparent={transparent}
      opacity={transparent ? (selected ? 0.66 : 0.17) : 1}
      depthWrite={!transparent}
    />
  );
  return ramp ? (
    <mesh geometry={ramp} castShadow receiveShadow>
      {material}
    </mesh>
  ) : (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, base, 0]}
      castShadow={!transparent}
      receiveShadow
    >
      <extrudeGeometry
        args={[shape, { depth: height, bevelEnabled: false, steps: 1 }]}
      />
      {material}
    </mesh>
  );
}

/** Only the supplied approved polygons are represented in a real parking. */
export function MeasuredParkingScene({
  manifest,
  selectedId,
  onSelect,
}: {
  manifest: Manifest;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const concrete = useConcrete();
  const floor = manifest.floor.footprintXZ;
  const minX = Math.min(...floor.map(([x]) => x)),
    minZ = Math.min(...floor.map(([, z]) => z));
  const width = Math.max(...floor.map(([x]) => x)) - minX,
    depth = Math.max(...floor.map(([, z]) => z)) - minZ;
  const scale = Math.min(1, 23 / Math.max(width, depth, 1));
  return (
    <>
      <Lighting />
      <FixedCamera extent={Math.max(width, depth, 6) * scale + 3} />
      <group scale={scale}>
        <group position={[-minX - width / 2, 0, -minZ - depth / 2]}>
          <MetricShape
            points={floor}
            base={-manifest.floor.thicknessM}
            height={manifest.floor.thicknessM}
            map={concrete.floor}
          />
          {manifest.obstacles.map((obstacle, index) => (
            <MetricShape
              key={index}
              points={obstacle.footprintXZ}
              base={obstacle.baseM}
              height={obstacle.heightM}
              endHeight={
                obstacle.kind === "ramp" ? obstacle.endHeightM : undefined
              }
              map={obstacle.kind === "ramp" ? concrete.floor : concrete.wall}
            />
          ))}
          {manifest.contextSpaces.map((space, index) => (
            <Line
              key={index}
              points={[...space.footprintXZ, space.footprintXZ[0]].map(
                ([x, z]) => [x, 0.035, z],
              )}
              color="#FFFFFF"
              lineWidth={1.8}
            />
          ))}
          {manifest.spaces.map((space) => {
            const x =
              space.footprintXZ.reduce((sum, point) => sum + point[0], 0) /
              space.footprintXZ.length;
            const z =
              space.footprintXZ.reduce((sum, point) => sum + point[1], 0) /
              space.footprintXZ.length;
            const selected = selectedId === space.id;
            return (
              <group
                key={space.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(space.id);
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                  document.body.style.cursor = "";
                }}
              >
                <MetricShape
                  points={space.footprintXZ}
                  base={0.017}
                  height={0.005}
                  color={selected ? "#E5CD86" : "#C9A558"}
                  transparent
                  selected={selected}
                />
                <Line
                  points={[...space.footprintXZ, space.footprintXZ[0]].map(
                    ([x, z]) => [x, 0.04, z],
                  )}
                  color={selected ? "#6D28FF" : "#C9A558"}
                  lineWidth={selected ? 2.7 : 1.8}
                />
                <GroundNumber number={space.displayNumber} x={x} z={z} />
                {selected ? (
                  <SelectionLabel
                    number={space.displayNumber}
                    position={[x, 1.3 / scale, z]}
                  />
                ) : null}
              </group>
            );
          })}
        </group>
      </group>
    </>
  );
}
