import CircularProgress from "@mui/material/CircularProgress";

/**
 * Next to a control that waits for the server. Keeps its space, so nothing moves when it appears; shown only when
 * saving takes a moment (200 ms), so a quick save does not flash it, and gone at once afterwards.
 */
export function SavingSpinner({ saving }: { saving: boolean }) {
  return (
    <CircularProgress
      size={16}
      aria-hidden
      data-testid="saving-switch-spinner"
      sx={{ visibility: saving ? "visible" : "hidden", transition: saving ? "visibility 0s linear 200ms" : "none" }}
    />
  );
}
