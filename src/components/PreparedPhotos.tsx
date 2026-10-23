"use client";
import { useEffect, useState } from "react";
import SafePhoto from "./SafePhoto";

/** Keep decoded slides mounted for this gallery only; no persistent media cache. */
export default function PreparedPhotos({
  photos,
  index,
  alt,
  width,
  height,
  sizes,
}: {
  photos: string[];
  index: number;
  alt: string;
  width: number;
  height: number;
  sizes: string;
}) {
  const position = Math.max(0, index) % photos.length;
  const requested = photos[position];
  const [visited, setVisited] = useState<string[]>([]);
  const [ready, setReady] = useState<string[]>([]);
  const [displayed, setDisplayed] = useState(photos[0]);
  const [failed, setFailed] = useState<string[]>([]);
  const nearby = [
    requested,
    photos[(position + 1) % photos.length],
    photos[(position + photos.length - 1) % photos.length],
  ];
  const mounted = [...new Set([...visited, ...nearby])].filter((src) =>
    photos.includes(src),
  );
  const visible =
    ready.includes(requested) || !photos.includes(displayed)
      ? requested
      : displayed;
  useEffect(() => {
    setVisited((previous) => [...new Set([...previous, ...nearby])]);
  }, [
    requested,
    photos[(position + 1) % photos.length],
    photos[(position + photos.length - 1) % photos.length],
  ]);
  useEffect(() => {
    if (ready.includes(requested)) setDisplayed(requested);
  }, [ready, requested]);
  return (
    <div
      className="prepared-photos"
      aria-busy={!ready.includes(requested) && !failed.includes(requested)}
    >
      {mounted.map((src) => (
        <SafePhoto
          key={src}
          src={src}
          alt={src === visible ? alt : ""}
          aria-hidden={src !== visible}
          width={width}
          height={height}
          sizes={sizes}
          loading="eager"
          fetchPriority={src === requested ? "high" : "low"}
          style={{
            gridArea: "1 / 1",
            visibility: src === visible ? "visible" : "hidden",
          }}
          onLoad={(event) => {
            const img = event.currentTarget;
            void img
              .decode()
              .catch(() => {})
              .then(() =>
                setReady((previous) =>
                  previous.includes(src) ? previous : [...previous, src],
                ),
              );
          }}
          onError={() => setFailed((previous) => [...previous, src])}
        />
      ))}
      {failed.includes(requested) ? (
        <span className="prepared-photo-error" role="status">
          Cette photo est momentanément indisponible.
        </span>
      ) : null}
    </div>
  );
}
