export type PortKind = "in" | "out" | "uni";

export interface PortEndpoint {
  id: string;
  kind: PortKind;
}

/** in↔out, uni↔in, uni↔out and uni↔uni are valid; in↔in and out↔out are not. */
export function canConnect(a: Pick<PortEndpoint, "kind">, b: Pick<PortEndpoint, "kind">): boolean {
  if (a.kind === "uni" || b.kind === "uni") return true;
  return a.kind !== b.kind;
}

/**
 * Stored cable order. Plain in/out pairs are always stored as out → in.
 * Cables that involve a uni port keep the direction in which the user dragged them.
 */
export function normalizeCableEndpoints(from: PortEndpoint, to: PortEndpoint): { from: string; to: string } {
  if (from.kind === "uni" || to.kind === "uni") return { from: from.id, to: to.id };
  const out = from.kind === "out" ? from : to;
  const input = from.kind === "in" ? from : to;
  return { from: out.id, to: input.id };
}
