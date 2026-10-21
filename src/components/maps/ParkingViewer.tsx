"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import {
  CanvasTexture,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  DoubleSide,
  RepeatWrapping,
  Shape,
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from "three";
import {
  Box,
  ChevronDown,
  Eye,
  ImageIcon,
  Layers3,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
} from "lucide-react";
import { areaLabel, type Listing, type Space } from "@/lib/types";
import "@/styles/maps.css";
import type { PublicScene } from "@/lib/scene-contract";
import ParkingPlan2D from "./ParkingPlan2D";

interface ParkingViewerProps {
  listing: Listing;
  onSpaceSelect?: (id: string) => void;
}
interface DisplaySpace {
  key: string;
  number: string;
  x: number;
  z: number;
  width: number;
  length: number;
  actual?: Space;
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function concreteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(256, 256);
  let seed = 417;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    // Fine pores plus broad tonal variation; no represented damage or defects.
    const x = (i / 4) % 256,
      y = Math.floor(i / 4 / 256);
    const broad = Math.sin(x * 0.043) * Math.cos(y * 0.031) * 8;
    const shade = 219 + ((seed >>> 24) / 255) * 25 + broad;
    image.data[i] = shade + 3;
    image.data[i + 1] = shade + 2;
    image.data[i + 2] = shade;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

function numberTexture(number: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, 256, 128);
  context.fillStyle = "#FFFFFF";
  context.font = "700 80px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(number, 128, 64);
  return new CanvasTexture(canvas);
}

function GroundNumber({
  number,
  position,
  flipped,
}: {
  number: string;
  position: [number, number, number];
  flipped?: boolean;
}) {
  const texture = useMemo(() => numberTexture(number), [number]);
  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );
  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, flipped ? Math.PI : 0]}
    >
      <planeGeometry args={[1.5, 0.75]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function Stall({
  slot,
  selected,
  active,
  onSelect,
}: {
  slot: DisplaySpace;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const w = slot.width / 2,
    l = slot.length / 2;
  const corners: [number, number, number][] = [
    [-w, 0.035, -l],
    [w, 0.035, -l],
    [w, 0.035, l],
    [-w, 0.035, l],
    [-w, 0.035, -l],
  ];
  return (
    <group position={[slot.x, 0, slot.z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.018, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[slot.width, slot.length]} />
        <meshStandardMaterial
          color={selected ? "#C9A558" : hovered ? "#E5E1F0" : "#FFFFFF"}
          transparent
          opacity={selected ? 0.28 : hovered ? 0.16 : 0}
          depthWrite={false}
          roughness={0.9}
          side={DoubleSide}
        />
      </mesh>
      <Line
        points={corners}
        color={selected ? "#6D28FF" : "#FFFFFF"}
        lineWidth={selected ? 2.3 : 2}
      />
      <GroundNumber
        number={slot.number}
        position={[0, 0.045, slot.z < 0 ? l - 0.65 : -l + 0.65]}
        flipped={slot.z > 0}
      />
    </group>
  );
}

function CameraControls({
  resetKey,
  zoom,
  extent,
}: {
  resetKey: number;
  zoom: number;
  extent?: number;
}) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    if (extent)
      camera.position
        .set(0.6, 0.85, 1)
        .normalize()
        .multiplyScalar(extent * 1.45);
    else camera.position.set(20, 24, 28);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [resetKey, camera, invalidate, extent]);
  const lastZoom = useRef(zoom);
  useEffect(() => {
    if (lastZoom.current === zoom) return;
    const factor = zoom > lastZoom.current ? 0.85 : 1.17;
    camera.position.multiplyScalar(factor);
    lastZoom.current = zoom;
    controls.current?.update();
    invalidate();
  }, [zoom, camera, invalidate]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={extent ? extent * 0.65 : 16}
      maxDistance={extent ? extent * 4 : 55}
      minPolarAngle={0.3}
      maxPolarAngle={Math.PI / 2.12}
      enableDamping
      dampingFactor={0.12}
    />
  );
}

function ParkingScene({
  slots,
  selection,
  active,
  onSelect,
  resetKey,
  zoom,
}: {
  slots: DisplaySpace[];
  selection: Set<string>;
  active: string | null;
  onSelect: (slot: DisplaySpace) => void;
  resetKey: number;
  zoom: number;
}) {
  const concrete = useMemo(concreteTexture, []);
  useEffect(
    () => () => {
      concrete?.dispose();
    },
    [concrete],
  );
  return (
    <>
      <color attach="background" args={["#F8F9FC"]} />
      <ambientLight intensity={0.32} />
      <hemisphereLight args={["#F3F5FF", "#9A9589", 0.65]} />
      <directionalLight
        position={[-8, 15, 10]}
        intensity={2.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-normalBias={0.025}
        shadow-bias={-0.0001}
        shadow-radius={3}
        shadow-camera-near={0.5}
        shadow-camera-far={65}
      />
      <directionalLight
        position={[10, 8, -9]}
        intensity={0.28}
        color="#ECEBFF"
      />
      <group>
        <mesh position={[0, -0.18, 0]} receiveShadow castShadow>
          <boxGeometry args={[21.5, 0.36, 18.4]} />
          <meshStandardMaterial
            color="#D0CDC6"
            map={concrete}
            bumpMap={concrete}
            bumpScale={0.035}
            roughness={0.95}
          />
        </mesh>
        <mesh position={[0, 1.4, -9.1]} receiveShadow castShadow>
          <boxGeometry args={[21.5, 2.8, 0.3]} />
          <meshStandardMaterial
            color="#D6D2C8"
            map={concrete}
            bumpMap={concrete}
            bumpScale={0.035}
            roughness={1}
          />
        </mesh>
        <mesh position={[-10.6, 1.4, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.3, 2.8, 18.4]} />
          <meshStandardMaterial
            color="#D6D2C8"
            map={concrete}
            bumpMap={concrete}
            bumpScale={0.035}
            roughness={1}
          />
        </mesh>
        <mesh position={[0, 0.43, 9.1]} receiveShadow castShadow>
          <boxGeometry args={[21.5, 0.86, 0.3]} />
          <meshStandardMaterial
            color="#D6D2C8"
            map={concrete}
            bumpMap={concrete}
            bumpScale={0.035}
            roughness={1}
          />
        </mesh>
        <mesh position={[10.6, 0.8, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.3, 1.6, 18.4]} />
          <meshStandardMaterial
            color="#D6D2C8"
            map={concrete}
            bumpMap={concrete}
            bumpScale={0.035}
            roughness={1}
          />
        </mesh>
        {[-10.15, -4.65, 0.9, 5.25].map((x) =>
          [-2.1, 2.1].map((z) => (
            <group key={`${x}:${z}`} position={[x, 0, z]}>
              <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.48, 3, 0.48]} />
                <meshStandardMaterial
                  color="#CECBC3"
                  map={concrete}
                  bumpMap={concrete}
                  bumpScale={0.035}
                  roughness={0.95}
                />
              </mesh>
              <mesh position={[0, 0.62, z < 0 ? 0.245 : -0.245]}>
                <boxGeometry args={[0.49, 0.95, 0.02]} />
                <meshStandardMaterial color="#C9A558" roughness={0.8} />
              </mesh>
              {[0.28, 0.53, 0.78].map((y) => (
                <mesh
                  key={y}
                  position={[0, y, z < 0 ? 0.262 : -0.262]}
                  rotation={[0, 0, -0.45]}
                >
                  <boxGeometry args={[0.5, 0.12, 0.02]} />
                  <meshStandardMaterial color="#30333B" roughness={0.9} />
                </mesh>
              ))}
            </group>
          )),
        )}
        {slots.map((slot) => (
          <Stall
            key={slot.key}
            slot={slot}
            selected={selection.has(slot.key)}
            active={active === slot.key}
            onSelect={() => onSelect(slot)}
          />
        ))}
        {[-7, -2, 3].map((x) => (
          <group key={`lamp${x}`}>
            <mesh position={[x, 2.3, -8.88]}>
              <boxGeometry args={[1.6, 0.12, 0.12]} />
              <meshStandardMaterial
                color="#FFFFFF"
                emissive="#FFF7E3"
                emissiveIntensity={2}
              />
            </mesh>
            <pointLight
              position={[x, 2.1, -7]}
              intensity={12}
              distance={6}
              decay={2}
              color="#FFF7E3"
            />
          </group>
        ))}
        <group position={[8, 0.8, -1.1]} rotation={[-0.1, 0, 0]}>
          <mesh receiveShadow castShadow>
            <boxGeometry args={[3.6, 0.25, 15.5]} />
            <meshStandardMaterial
              color="#B9B6B0"
              map={concrete}
              bumpMap={concrete}
              bumpScale={0.035}
              roughness={1}
            />
          </mesh>
          {[-1.85, 1.85].map((x) => (
            <group key={x}>
              <mesh position={[x, 0.6, 0]} castShadow>
                <boxGeometry args={[0.12, 1.2, 15.7]} />
                <meshStandardMaterial color="#D5D1C6" roughness={0.9} />
              </mesh>
              <mesh position={[x, 1.22, 0]}>
                <boxGeometry args={[0.06, 0.06, 15.7]} />
                <meshStandardMaterial
                  color="#8992A5"
                  metalness={0.65}
                  roughness={0.4}
                />
              </mesh>
            </group>
          ))}
        </group>
        <mesh
          position={[0, -0.41, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <shadowMaterial opacity={0.22} />
        </mesh>
      </group>
      <CameraControls resetKey={resetKey} zoom={zoom} />
    </>
  );
}

function DemoParkingViewer({ listing, onSpaceSelect }: ParkingViewerProps) {
  const levels = useMemo(
    () =>
      [...new Set(listing.spaces.map((space) => space.level))].sort(
        (a, b) => b - a,
      ),
    [listing.spaces],
  );
  const [level, setLevel] = useState(levels[0] ?? -1);
  const [active, setActive] = useState<string | null>(
    listing.spaces[0]?.id ?? null,
  );
  const [mode, setMode] = useState<"3d" | "plan" | "photo">("3d");
  const [resetKey, setResetKey] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [selectionVisible, setSelectionVisible] = useState(true);
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setLevel(levels[0] ?? -1);
    setActive(listing.spaces[0]?.id ?? null);
    setMessage("");
  }, [listing.id, listing.spaces, levels]);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setSupported(Boolean(gl));
      const extension = gl?.getExtension("WEBGL_lose_context");
      extension?.loseContext();
    } catch {
      setSupported(false);
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, []);
  const actualSpaces = useMemo(
    () => listing.spaces.filter((space) => space.level === level),
    [listing.spaces, level],
  );
  const slots = useMemo(() => {
    const positions: DisplaySpace[] = [];
    const usedNumbers = new Set(actualSpaces.map((space) => space.number));
    let contextNumber = 10;
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        const index = row * 4 + col;
        const actual =
          actualSpaces[
            index === 2
              ? 0
              : index === 5
                ? 1
                : index === 6
                  ? 2
                  : index === 7
                    ? 3
                    : 20
          ];
        while (usedNumbers.has(String(contextNumber))) contextNumber++;
        const number = actual?.number ?? String(contextNumber++);
        positions.push({
          key: actual?.id ?? `context-${row}-${col}`,
          number,
          x: -7.4 + col * 3.1,
          z: row === 0 ? -5.15 : 5.15,
          width: Math.min(actual?.widthM ?? 2.8, 2.9),
          length: Math.min(actual?.lengthM ?? 5, 5.5),
          actual,
        });
      }
    // Bundles larger than this schematic use the complete semantic view below.
    return positions;
  }, [actualSpaces]);
  const selection = useMemo(
    () =>
      new Set(selectionVisible ? actualSpaces.map((space) => space.id) : []),
    [actualSpaces, selectionVisible],
  );
  const select = (slot: DisplaySpace) => {
    if (slot.actual) {
      setActive(slot.actual.id);
      onSpaceSelect?.(slot.actual.id);
      setMessage(`Place ${slot.actual.number} sélectionnée`);
    } else {
      setMessage(
        "Place de contexte non proposée à la vente sur la plateforme.",
      );
    }
  };
  const schematicAllowed =
    listing.isDemo &&
    listing.sceneAvailable &&
    listing.locationPrecision === "exact_opt_in";
  const semanticPlan = (
    <div className="gp-semantic-plan">
      <div className="gp-semantic-header">
        <Layers3 size={24} />
        <h3>Places du niveau {level === 0 ? "extérieur" : level}</h3>
      </div>
      <p>
        Schéma indicatif, non coté. L’organisation de ce parking est fictive.
      </p>
      <div className="gp-semantic-spaces">
        {actualSpaces.map((space) => (
          <button
            type="button"
            key={space.id}
            className={`gp-semantic-space${active === space.id ? " is-selected" : ""}`}
            onClick={() => {
              setActive(space.id);
              onSpaceSelect?.(space.id);
            }}
          >
            <strong>Place {space.number}</strong>
            <span>{areaLabel([space])}</span>
          </button>
        ))}
      </div>
      <p className="gp-semantic-unknown">
        Les autres emplacements sont du contexte et ne sont pas proposés à la
        vente.
      </p>
    </div>
  );
  if (!schematicAllowed)
    return (
      <section className="gp-parking-unavailable">
        <ImageIcon size={32} />
        <h3>Le parking en photos</h3>
        <p>
          Un modèle intérieur sera disponible après contrôle du plan, des
          mesures et des correspondances avec les places.
        </p>
        {listing.photos[0] ? (
          <img
            src={listing.photos[0]}
            alt={`Vue du parking à ${listing.city}, ${listing.district}`}
          />
        ) : null}
      </section>
    );
  return (
    <section
      className="gp-parking-viewer"
      aria-label="Plan intérieur du parking de démonstration"
    >
      <div className="gp-viewer-heading">
        <div
          className="gp-viewer-tabs"
          role="group"
          aria-label="Mode de présentation"
        >
          <button
            type="button"
            className={mode === "3d" ? "is-active" : ""}
            onClick={() => setMode("3d")}
          >
            <Box size={18} />
            Plan 3D
          </button>
          <button
            type="button"
            className={mode === "plan" ? "is-active" : ""}
            onClick={() => setMode("plan")}
          >
            <Layers3 size={18} />
            Places
          </button>
          <button
            type="button"
            className={mode === "photo" ? "is-active" : ""}
            onClick={() => setMode("photo")}
          >
            <ImageIcon size={18} />
            Photos
          </button>
        </div>
        <label className="gp-level-select">
          Niveau{" "}
          <select
            aria-label="Choisir le niveau du parking"
            value={level}
            onChange={(event) => {
              setLevel(Number(event.target.value));
              setMessage("");
            }}
          >
            {levels.map((value) => (
              <option value={value} key={value}>
                {value === 0 ? "Extérieur" : value}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
      </div>
      <div className="gp-viewer-stage">
        {mode === "3d" && (
          <div className="gp-scene-selection" aria-live="polite">
            <strong>
              Place{" "}
              {actualSpaces.find((space) => space.id === active)?.number ||
                actualSpaces[0]?.number ||
                "—"}
            </strong>
            <span>Plan de démonstration</span>
          </div>
        )}
        {mode === "photo" ? (
          <div className="gp-viewer-photo">
            <img
              src={listing.photos[0] || "/demo/covered.png"}
              alt="Illustration du parking de démonstration"
            />
            <span>Illustration générée · bien fictif</span>
          </div>
        ) : mode === "plan" ||
          supported === false ||
          actualSpaces.length > 4 ? (
          semanticPlan
        ) : supported === null ? (
          <div className="gp-map-loading" role="status">
            Chargement du plan…
          </div>
        ) : (
          <SceneBoundary fallback={semanticPlan}>
            <Suspense
              fallback={
                <div className="gp-map-loading" role="status">
                  Chargement du plan…
                </div>
              }
            >
              <Canvas
                shadows
                camera={{
                  position: [20, 24, 28],
                  fov: 38,
                  near: 0.1,
                  far: 200,
                }}
                dpr={[1, 1.5]}
                frameloop="demand"
                gl={{
                  antialias: true,
                  alpha: true,
                  powerPreference: "default",
                }}
                onCreated={({ gl }) => {
                  gl.toneMapping = ACESFilmicToneMapping;
                  gl.toneMappingExposure = 0.95;
                  gl.domElement.setAttribute(
                    "aria-label",
                    "Vue 3D du parking. Les places sont aussi disponibles dans le mode Places.",
                  );
                  gl.domElement.addEventListener(
                    "webglcontextlost",
                    () => setSupported(false),
                    { once: true },
                  );
                }}
              >
                <ParkingScene
                  slots={slots}
                  selection={selection}
                  active={active}
                  onSelect={select}
                  resetKey={resetKey}
                  zoom={zoom}
                />
              </Canvas>
            </Suspense>
          </SceneBoundary>
        )}
        {mode === "3d" && supported && actualSpaces.length <= 4 ? (
          <>
            <div className="gp-viewer-tools" aria-label="Commandes du plan 3D">
              <button
                type="button"
                onClick={() => setZoom((value) => value + 1)}
                aria-label="Agrandir le plan"
              >
                <Plus size={20} />
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => value - 1)}
                aria-label="Réduire le plan"
              >
                <Minus size={20} />
              </button>
              <button
                type="button"
                onClick={() => setResetKey((value) => value + 1)}
                aria-label="Recentrer le plan"
              >
                <RotateCcw size={20} />
              </button>
              <button
                type="button"
                onClick={() => setSelectionVisible((value) => !value)}
                aria-label={
                  selectionVisible
                    ? "Masquer le voile de sélection"
                    : "Afficher le voile de sélection"
                }
                aria-pressed={selectionVisible}
              >
                <Eye size={20} />
              </button>
            </div>
            <span className="gp-viewer-gesture">
              <MousePointer2 size={14} />
              Glisser pour tourner · défiler pour zoomer
            </span>
          </>
        ) : null}
        <div className="gp-viewer-disclaimer">
          Plan 3D de démonstration · schéma indicatif, non coté
        </div>
      </div>
      <div className="gp-viewer-footer">
        <span className="gp-selection-key">
          <i aria-hidden="true" />
          {actualSpaces.length > 1
            ? `${actualSpaces.length} places dans ce lot`
            : `Place ${actualSpaces[0]?.number ?? ""}`}
        </span>
        <span role="status" aria-live="polite">
          {message || "Consultez les photos pour apprécier l’état réel."}
        </span>
      </div>
    </section>
  );
}

function MetricShape({
  points,
  base = 0,
  height = 0.2,
  endHeight,
  color = "#D0CDC6",
  transparent = false,
}: {
  points: [number, number][];
  base?: number;
  height?: number;
  endHeight?: number;
  color?: string;
  transparent?: boolean;
}) {
  const shape = useMemo(() => {
    const result = new Shape();
    points.forEach((point, index) => {
      if (index === 0) result.moveTo(point[0], -point[1]);
      else result.lineTo(point[0], -point[1]);
    });
    result.closePath();
    return result;
  }, [points]);
  const ramp = useMemo(() => {
    if (endHeight === undefined) return null;
    const vertices: number[] = [],
      indices: number[] = [];
    const min = Math.min(...points.map((p) => p[1])),
      range = Math.max(...points.map((p) => p[1])) - min || 1;
    for (const point of points) vertices.push(point[0], base, point[1]);
    for (const point of points)
      vertices.push(
        point[0],
        base + height + ((endHeight - height) * (point[1] - min)) / range,
        point[1],
      );
    const count = points.length;
    const triangles = ShapeUtils.triangulateShape(
      points.map((p) => new Vector2(p[0], p[1])),
      [],
    );
    for (const t of triangles)
      indices.push(t[0] + count, t[2] + count, t[1] + count, t[0], t[1], t[2]);
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
  return ramp ? (
    <mesh geometry={ramp} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.95} side={DoubleSide} />
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
      <meshStandardMaterial
        color={color}
        roughness={0.95}
        transparent={transparent}
        opacity={transparent ? 0.26 : 1}
        depthWrite={!transparent}
      />
    </mesh>
  );
}
function MeasuredParking({
  scene,
  listing,
  onSpaceSelect,
}: ParkingViewerProps & { scene: PublicScene }) {
  const [mode, setMode] = useState<"3d" | "places" | "photos">("3d"),
    [selected, setSelected] = useState(scene.manifest.spaces[0]?.id || ""),
    [reset, setReset] = useState(0),
    [zoom, setZoom] = useState(0),
    [showSelection, setShowSelection] = useState(true);
  const floor = scene.manifest.floor.footprintXZ;
  const center: [number, number] = [
    (Math.min(...floor.map((p) => p[0])) +
      Math.max(...floor.map((p) => p[0]))) /
      2,
    (Math.min(...floor.map((p) => p[1])) +
      Math.max(...floor.map((p) => p[1]))) /
      2,
  ];
  const size = Math.max(
    Math.max(...floor.map((p) => p[0])) - Math.min(...floor.map((p) => p[0])),
    Math.max(...floor.map((p) => p[1])) - Math.min(...floor.map((p) => p[1])),
  );
  const scale = Math.min(1, 18 / Math.max(size, 1));
  const selectMeasuredSpace = (id: string) => {
    setSelected(id);
    onSpaceSelect?.(id);
  };
  const alternative = (
    <div className="gp-semantic-plan">
      <h3>Niveau {scene.manifest.level} · plan métrique contrôlé</h3>
      <ParkingPlan2D
        manifest={scene.manifest}
        selectedId={selected}
        onSelect={selectMeasuredSpace}
      />
      <p>
        Relevé du{" "}
        {new Date(scene.manifest.provenance.observedAt).toLocaleDateString(
          "fr-FR",
        )}{" "}
        · précision déclarée ±
        {Math.round(scene.manifest.provenance.accuracyM * 100)} cm.
      </p>
      <div className="gp-semantic-spaces">
        {scene.manifest.spaces.map((space) => (
          <button
            key={space.id}
            className={`gp-semantic-space${selected === space.id ? " is-selected" : ""}`}
            onClick={() => {
              selectMeasuredSpace(space.id);
            }}
          >
            <strong>Place {space.displayNumber}</strong>
            <span>
              {space.dimensions.lengthM ?? "—"} ×{" "}
              {space.dimensions.widthM ?? "—"} m
            </span>
          </button>
        ))}
      </div>
      {scene.manifest.observations.map((note, i) => (
        <p key={i}>
          {note.category} : {note.description}
        </p>
      ))}
    </div>
  );
  return (
    <section
      className="gp-parking-viewer"
      aria-label="Plan métrique du parking"
    >
      <div className="gp-viewer-heading">
        <div className="gp-viewer-tabs">
          <button
            className={mode === "3d" ? "is-active" : ""}
            onClick={() => setMode("3d")}
          >
            <Box size={18} />
            Plan 3D
          </button>
          <button
            className={mode === "places" ? "is-active" : ""}
            onClick={() => setMode("places")}
          >
            <Layers3 size={18} />
            Places
          </button>
          <button
            className={mode === "photos" ? "is-active" : ""}
            onClick={() => setMode("photos")}
          >
            <ImageIcon size={18} />
            Photos
          </button>
        </div>
        <label className="gp-level-select">Niveau {scene.manifest.level}</label>
      </div>
      <div className="gp-viewer-stage">
        {mode === "3d" && (
          <div className="gp-scene-selection" aria-live="polite">
            <strong>
              Place{" "}
              {scene.manifest.spaces.find((space) => space.id === selected)
                ?.displayNumber || "—"}
            </strong>
            <span>Plan métrique contrôlé · choisir une place dans la vue</span>
          </div>
        )}
        {mode === "photos" ? (
          <div className="gp-viewer-photo">
            <img src={listing.photos[0]} alt="Photo du parking" />
          </div>
        ) : mode === "places" ||
          scene.manifest.spaces.length + scene.manifest.obstacles.length >
            100 ? (
          alternative
        ) : (
          <SceneBoundary fallback={alternative}>
            <Canvas
              shadows
              camera={{ position: [20, 24, 28], fov: 38, near: 0.1, far: 300 }}
              dpr={[1, 1.5]}
              frameloop="demand"
              gl={{ antialias: true }}
            >
              <color attach="background" args={["#F8F9FC"]} />
              <ambientLight intensity={1.4} />
              <hemisphereLight args={["#FFFFFF", "#B5B1A8", 1.3]} />
              <directionalLight
                position={[8, 20, 12]}
                intensity={2.4}
                castShadow
              />
              <group scale={scale}>
                <group position={[-center[0], 0, -center[1]]}>
                  <MetricShape
                    points={floor}
                    base={-scene.manifest.floor.thicknessM}
                    height={scene.manifest.floor.thicknessM}
                  />
                  {scene.manifest.obstacles.map((obstacle, i) => (
                    <MetricShape
                      key={i}
                      points={obstacle.footprintXZ}
                      base={obstacle.baseM}
                      height={obstacle.heightM}
                      endHeight={
                        obstacle.kind === "ramp"
                          ? obstacle.endHeightM
                          : undefined
                      }
                      color="#D6D2C8"
                    />
                  ))}
                  {scene.manifest.contextSpaces.map((space, i) => (
                    <Line
                      key={i}
                      points={[...space.footprintXZ, space.footprintXZ[0]].map(
                        (p) => [p[0], 0.03, p[1]],
                      )}
                      color="#FFFFFF"
                      lineWidth={2}
                    />
                  ))}
                  {scene.manifest.spaces.map((space) => {
                    const x =
                        space.footprintXZ.reduce((a, p) => a + p[0], 0) /
                        space.footprintXZ.length,
                      z =
                        space.footprintXZ.reduce((a, p) => a + p[1], 0) /
                        space.footprintXZ.length;
                    return (
                      <group
                        key={space.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectMeasuredSpace(space.id);
                        }}
                      >
                        <MetricShape
                          points={space.footprintXZ}
                          base={0.015}
                          height={0.005}
                          color={showSelection ? "#C9A558" : "#FFFFFF"}
                          transparent
                        />
                        <Line
                          points={[
                            ...space.footprintXZ,
                            space.footprintXZ[0],
                          ].map((p) => [p[0], 0.04, p[1]])}
                          color={showSelection ? "#6D28FF" : "#FFFFFF"}
                          lineWidth={2}
                        />
                        <GroundNumber
                          number={space.displayNumber}
                          position={[x, 0.05, z]}
                        />
                      </group>
                    );
                  })}
                </group>
              </group>
              <CameraControls
                resetKey={reset}
                zoom={zoom}
                extent={Math.max(size * scale, 1)}
              />
            </Canvas>
          </SceneBoundary>
        )}
        {mode === "3d" &&
        scene.manifest.spaces.length + scene.manifest.obstacles.length <=
          100 ? (
          <div className="gp-viewer-tools">
            <button
              onClick={() => setZoom((v) => v + 1)}
              aria-label="Agrandir le plan"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => setZoom((v) => v - 1)}
              aria-label="Réduire le plan"
            >
              <Minus size={20} />
            </button>
            <button
              onClick={() => setReset((v) => v + 1)}
              aria-label="Recentrer le plan"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={() => setShowSelection((v) => !v)}
              aria-label="Afficher ou masquer la sélection"
              aria-pressed={showSelection}
            >
              <Eye size={20} />
            </button>
          </div>
        ) : null}
        <div className="gp-viewer-disclaimer">
          Relevé du{" "}
          {new Date(scene.manifest.provenance.observedAt).toLocaleDateString(
            "fr-FR",
          )}{" "}
          · contrôlé le {new Date(scene.reviewedAt).toLocaleDateString("fr-FR")}{" "}
          · ±{Math.round(scene.manifest.provenance.accuracyM * 100)} cm
        </div>
      </div>
      <div className="gp-viewer-footer">
        <span>{scene.manifest.provenance.publicSummary}</span>
        <span>
          Le contrôle du plan ne constitue pas une expertise immobilière.
        </span>
      </div>
    </section>
  );
}
export default function ParkingViewer(props: ParkingViewerProps) {
  const [scene, setScene] = useState<PublicScene | null>(null),
    [level, setLevel] = useState(props.listing.spaces[0]?.level ?? -1);
  const firstLookup = useRef(true);
  const levels = [...new Set(props.listing.spaces.map((space) => space.level))];
  useEffect(() => {
    firstLookup.current = true;
    setLevel(props.listing.spaces[0]?.level ?? -1);
  }, [props.listing.id, props.listing.spaces]);
  useEffect(() => {
    const controller = new AbortController();
    setScene(null);
    if (props.listing.locationPrecision === "exact_opt_in")
      void (async () => {
        let response = await fetch(
          `/api/scenes?listingId=${encodeURIComponent(props.listing.id)}&level=${level}`,
          { signal: controller.signal },
        );
        if (!response.ok && firstLookup.current && levels.length > 1)
          response = await fetch(
            `/api/scenes?listingId=${encodeURIComponent(props.listing.id)}`,
            { signal: controller.signal },
          );
        firstLookup.current = false;
        if (!response.ok) return;
        const result = await response.json();
        if (result.data && !controller.signal.aborted) {
          setScene(result.data);
          if (result.data.manifest.level !== level)
            setLevel(result.data.manifest.level);
        }
      })().catch(() => {});
    return () => controller.abort();
  }, [props.listing.id, props.listing.locationPrecision, level]);
  return (
    <div
      className="gp-viewer-root"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      {levels.length > 1 && props.listing.sceneAvailable ? (
        <label className="gp-level-select">
          Niveau
          <select
            value={level}
            onChange={(event) => {
              firstLookup.current = false;
              setLevel(Number(event.target.value));
            }}
          >
            {levels.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {scene ? (
        <MeasuredParking {...props} scene={scene} key={scene.id} />
      ) : (
        <DemoParkingViewer {...props} />
      )}
    </div>
  );
}
