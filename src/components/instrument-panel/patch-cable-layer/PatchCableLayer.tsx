"use client";

import type { PatchData } from "@/lib/domain/types";
import { cableCurve } from "@/lib/instrument/geometry";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { useI18n } from "@/i18n/provider";
import styles from "../InstrumentPanel.module.scss";
import type { useInstrumentPanelInteractions } from "../useInstrumentPanelInteractions";

interface PatchCableLayerProps {
  data: PatchData;
  layout: InstrumentLayout;
  interactions: ReturnType<typeof useInstrumentPanelInteractions>;
}

export function PatchCableLayer({
  data,
  layout,
  interactions,
}: PatchCableLayerProps) {
  const { t } = useI18n();
  const portById = new Map(layout.ports.map((port) => [port.id, port]));
  const { preview, visibleCables } = interactions;

  return (
    <>
      {visibleCables.map((cable, index) => {
        const start = portById.get(cable.from);
        const end = portById.get(cable.to);
        if (!start || !end) return null;
        const cableIndex = data.cables.indexOf(cable);
        const path = cableCurve(start, end);
        return (
          <g key={`${cable.from}-${cable.to}-${index}`}>
            <path
              d={path}
              className={styles.cable}
              stroke={cable.color}
              strokeWidth={layout.geometry.cable.lineWidth}
            />
            <path
              d={path}
              className={styles.cableHitArea}
              strokeWidth={layout.geometry.cable.hitAreaWidth}
              aria-label={t("instrument.cableDrag")}
              onPointerDown={(event) =>
                interactions.beginFromCable(
                  event,
                  cable,
                  cableIndex,
                  start,
                  end,
                )
              }
            />
            {[start, end].map((port) => (
              <circle
                key={port.id}
                cx={port.x}
                cy={port.y}
                r={layout.geometry.port.endpointRadius}
                className={styles.cableEndpoint}
                data-cable-endpoint
                fill={cable.color}
                aria-label={t("instrument.cableEnd", { port: port.label })}
                onPointerDown={(event) =>
                  interactions.beginFromCableEndpoint(
                    event,
                    cable,
                    cableIndex,
                    port,
                  )
                }
              />
            ))}
          </g>
        );
      })}

      {preview && (
        <path
          d={preview.path}
          className={`${styles.cable} ${styles.cablePreview}`}
          stroke={preview.color}
          strokeWidth={layout.geometry.cable.lineWidth}
        />
      )}

    </>
  );
}
