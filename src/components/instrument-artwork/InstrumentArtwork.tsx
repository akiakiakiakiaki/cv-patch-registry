import { InlineSvgAsset } from "@/components/inline-svg-asset/InlineSvgAsset";
import { isUploadedAssetUrl } from "@/lib/storage/upload-url";

interface InstrumentArtworkProps {
  className: string | undefined;
  src: string;
  label: string;
  aspectRatio: string;
}

/**
 * Uploaded panels are always rendered as an image (scripts cannot run there), never inline.
 * Bundled project assets such as proton.svg keep the inline path.
 */
export function InstrumentArtwork({
  className,
  src,
  label,
  aspectRatio,
}: InstrumentArtworkProps) {
  if (isUploadedAssetUrl(src)) {
    return <img className={className} src={src} alt={label} style={{ aspectRatio, width: "100%", height: "auto", display: "block" }} />;
  }
  return (
    <InlineSvgAsset
      className={className}
      src={src}
      label={label}
      style={{ aspectRatio }}
    />
  );
}
