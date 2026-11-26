/**
 * One page-wide check before leaving work with unsaved changes from outside its component (e.g. signing out
 * from the header). The component holding the changes registers a guard; callers ask confirmLeave first.
 */
type LeaveGuard = () => Promise<boolean>;

let current: LeaveGuard | null = null;

/** Registers the guard; returns a function that removes it again (only if it is still the registered one). */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

/** Resolves true when leaving is fine: no guard, or the guard agreed (saved or discarded). */
export async function confirmLeave(): Promise<boolean> {
  return current ? current() : true;
}
