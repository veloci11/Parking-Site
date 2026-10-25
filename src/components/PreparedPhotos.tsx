"use client";
import { useEffect, useReducer, useState } from "react";
import SafePhoto from "./SafePhoto";
import { photoLoadReducer } from "@/lib/photo-load-state";

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
  const position = photos.length ? Math.max(0, index) % photos.length : 0;
  const requested = photos[position];
  const [visited, setVisited] = useState<string[]>([]);
  const [loads, dispatchLoad] = useReducer(photoLoadReducer, {});
  const nearby = [
    requested,
    photos[(position + 1) % photos.length],
    photos[(position + photos.length - 1) % photos.length],
  ];
  const mounted = [...new Set([...visited, ...nearby])].filter((src) =>
    photos.includes(src),
  );
  const status = requested ? loads[requested]?.status || "loading" : "empty";
  useEffect(() => {
    setVisited((previous) => [...new Set([...previous, ...nearby])]);
  }, [
    requested,
    photos[(position + 1) % photos.length],
    photos[(position + photos.length - 1) % photos.length],
  ]);
  return (
    <div
      className="prepared-photos"
      aria-busy={status === "loading"}
      data-photo-state={status}
    >
      {mounted.map((src) => {
        const attempt = loads[src]?.attempt || 0;
        const visible = src === requested && status === "ready";
        return (
          <SafePhoto
            key={`${src}:${attempt}`}
            src={src}
            alt={visible ? alt : ""}
            aria-hidden={!visible}
            width={width}
            height={height}
            sizes={sizes}
            loading="eager"
            fetchPriority={src === requested ? "high" : "low"}
            style={{
              gridArea: "1 / 1",
              visibility: visible ? "visible" : "hidden",
            }}
            onLoad={(event) => {
              const img = event.currentTarget;
              void img
                .decode()
                .catch(() => {})
                .then(() => {
                  if (!img.isConnected) return;
                  dispatchLoad({
                    type: img.naturalWidth > 0 ? "ready" : "failed",
                    src,
                    attempt,
                  });
                });
            }}
            onError={() => dispatchLoad({ type: "failed", src, attempt })}
          />
        );
      })}
      {status !== "ready" ? (
        <div className="prepared-photo-status" role="status">
          <span>
            {status === "failed"
              ? "Cette photo est momentanément indisponible."
              : status === "empty"
                ? "Photos à venir"
                : "Chargement de la photo…"}
          </span>
          {status === "failed" ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => dispatchLoad({ type: "retry", src: requested })}
            >
              Réessayer cette photo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
