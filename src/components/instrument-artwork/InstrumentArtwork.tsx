import { InlineSvgAsset } from "@/components/inline-svg-asset/InlineSvgAsset";

interface InstrumentArtworkProps {
  className: string | undefined;
  src: string;
  label: string;
  aspectRatio: string;
}

export function InstrumentArtwork({
  className,
  src,
  label,
  aspectRatio,
}: InstrumentArtworkProps) {
  return (
    <InlineSvgAsset
      className={className}
      src={src}
      label={label}
      style={{ aspectRatio }}
    />
  );
}
