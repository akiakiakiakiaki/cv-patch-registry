"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useI18n } from "@/i18n/provider";

export type ConfirmTone = "default" | "warning" | "danger";

export interface ConfirmOptions {
  title: ReactNode;
  /** Body of the dialog: a sentence, a list, or any other content. */
  content: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colors the icon and the confirm button. "danger" is for destructive actions. */
  tone?: ConfirmTone;
  /** Optional third choice, shown left of cancel (e.g. "restore the last saved version"). */
  alternativeLabel?: string;
}

/** What the user chose. Escape and the backdrop count as "cancel". */
export type ConfirmChoice = "confirm" | "alternative" | "cancel";

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Required when `alternativeLabel` is set. */
  onAlternative?: () => void;
}

const TONE = {
  default: { color: "primary", Icon: HelpOutlineIcon },
  warning: { color: "warning", Icon: WarningAmberIcon },
  danger: { color: "error", Icon: ErrorOutlineIcon },
} as const;

/**
 * The app's one confirmation dialog. Escape and the backdrop count as cancel; cancel has the initial focus,
 * so an accidental Enter never confirms a destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  content,
  confirmLabel,
  cancelLabel,
  alternativeLabel,
  tone = "default",
  onConfirm,
  onCancel,
  onAlternative,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const contentId = useId();
  const { color, Icon } = TONE[tone];
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby={titleId} aria-describedby={contentId} maxWidth="sm" fullWidth>
      <DialogTitle id={titleId}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Icon color={color} aria-hidden />
          <span>{title}</span>
        </Stack>
      </DialogTitle>
      <DialogContent id={contentId}>{content}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
        {alternativeLabel && onAlternative ? (
          <Button onClick={onAlternative} sx={{ mr: "auto" }}>
            {alternativeLabel}
          </Button>
        ) : null}
        <Button onClick={onCancel} autoFocus>
          {cancelLabel ?? t("confirm.cancel")}
        </Button>
        <Button onClick={onConfirm} variant="contained" color={color}>
          {confirmLabel ?? t("confirm.ok")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Promise-based use of ConfirmDialog. `confirm` answers yes/no; `choose` also reports the alternative action.
 * Render `dialog` once in the component. A second request while one is open cancels the first.
 */
export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  choose: (options: ConfirmOptions) => Promise<ConfirmChoice>;
  dialog: ReactNode;
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((choice: ConfirmChoice) => void) | null>(null);

  const settle = useCallback((choice: ConfirmChoice) => {
    resolver.current?.(choice);
    resolver.current = null;
    setOptions(null);
  }, []);

  const choose = useCallback((next: ConfirmOptions) => {
    resolver.current?.("cancel");
    setOptions(next);
    return new Promise<ConfirmChoice>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => choose(next).then((choice) => choice === "confirm"), [choose]);

  const dialog = options ? (
    <ConfirmDialog
      open
      {...options}
      onConfirm={() => settle("confirm")}
      onCancel={() => settle("cancel")}
      onAlternative={() => settle("alternative")}
    />
  ) : null;
  return { confirm, choose, dialog };
}
