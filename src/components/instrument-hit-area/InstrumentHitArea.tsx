import type {
  AriaRole,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
} from "react";

interface InstrumentHitAreaProps {
  shape: "circle" | "rect";
  x: number;
  y: number;
  radius?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
  className: string;
  tabIndex: number;
  role: AriaRole;
  ariaLabel: string;
  ariaPressed?: boolean;
  ariaChecked?: boolean;
  ariaValueMin?: number;
  ariaValueMax?: number;
  ariaValueNow?: number;
  onClick?: MouseEventHandler<SVGElement>;
  onPointerDown?: PointerEventHandler<SVGElement>;
  onPointerMove?: PointerEventHandler<SVGElement>;
  onPointerUp?: PointerEventHandler<SVGElement>;
  onKeyDown?: KeyboardEventHandler<SVGElement>;
}

export function InstrumentHitArea(props: InstrumentHitAreaProps) {
  const sharedProps = {
    className: props.className,
    tabIndex: props.tabIndex,
    role: props.role,
    "aria-label": props.ariaLabel,
    "aria-pressed": props.ariaPressed,
    "aria-checked": props.ariaChecked,
    "aria-valuemin": props.ariaValueMin,
    "aria-valuemax": props.ariaValueMax,
    "aria-valuenow": props.ariaValueNow,
    onClick: props.onClick,
    onPointerDown: props.onPointerDown,
    onPointerMove: props.onPointerMove,
    onPointerUp: props.onPointerUp,
    onKeyDown: props.onKeyDown,
  };

  if (props.shape === "circle") {
    return (
      <circle
        {...sharedProps}
        cx={props.x}
        cy={props.y}
        r={props.radius ?? 0}
      />
    );
  }

  const width = props.width ?? 0;
  const height = props.height ?? 0;
  return (
    <rect
      {...sharedProps}
      x={props.x - width / 2}
      y={props.y - height / 2}
      width={width}
      height={height}
      rx={props.cornerRadius ?? 0}
    />
  );
}
