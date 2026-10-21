import Image, { type ImageProps } from "next/image";
/** Only static demonstration assets use the public optimizer cache.
 * Listing photos retain the API authorization check on every request, including
 * responsive variants, so withdrawing a publication also withdraws its media.
 */
export default function SafePhoto(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  if (!src.startsWith("/api/media/")) return <Image {...props} />;
  const {
    fill,
    priority,
    unoptimized,
    quality,
    placeholder,
    blurDataURL,
    loader,
    onLoadingComplete,
    ...imageProps
  } = props;
  return (
    <img
      {...imageProps}
      src={src}
      srcSet={[480, 960, 1920]
        .map((width) => `${src}?w=${width} ${width}w`)
        .join(", ")}
      style={{
        ...props.style,
        ...(fill
          ? { position: "absolute", height: "100%", width: "100%", inset: 0 }
          : {}),
      }}
      loading={props.loading || (priority ? "eager" : "lazy")}
    />
  );
}
