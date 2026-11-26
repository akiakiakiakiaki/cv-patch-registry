"use client";

import { useId } from "react";
import type { FormEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import Dialog, { type DialogProps } from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "@/i18n/provider";

export interface AppDialogProps {
  open: boolean;
  /** Escape, the backdrop and the close button call this. */
  onClose: () => void;
  title: ReactNode;
  /** Shown left of the title, e.g. a warning sign. */
  icon?: ReactNode;
  /** Short line below the title, e.g. a count. */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Buttons at the bottom; omitted when the content has its own. */
  actions?: ReactNode;
  /** Default "sm". */
  maxWidth?: DialogProps["maxWidth"];
  /** Adds a close button (×) to the title; for dialogs without a cancel button. */
  closeButton?: boolean;
  /** The content describes the dialog (screen readers read it with the title), e.g. a question. */
  describedByContent?: boolean;
  /** Makes the dialog a form; a submit button in `actions` sends it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

/** The app's one dialog frame: title, content and buttons in the same layout everywhere. */
export function AppDialog({
  open,
  onClose,
  title,
  icon,
  subtitle,
  children,
  actions,
  maxWidth = "sm",
  closeButton = false,
  describedByContent = false,
  onSubmit,
}: AppDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const contentId = useId();
  const body = (
    <>
      {/* The title names the dialog; the subtitle below it is extra information. */}
      <DialogTitle id={titleId} sx={{ ...(closeButton ? { pr: 7 } : {}), ...(subtitle ? { pb: 0 } : {}) }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          {icon}
          <span>{title}</span>
        </Stack>
      </DialogTitle>
      {subtitle ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 3, pb: 1 }}>
          {subtitle}
        </Typography>
      ) : null}
      {closeButton ? (
        <IconButton aria-label={t("dialog.close")} onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      ) : null}
      <DialogContent id={contentId} dividers={Boolean(subtitle)}>
        {children}
      </DialogContent>
      {actions ? <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>{actions}</DialogActions> : null}
    </>
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={describedByContent ? contentId : undefined}
      maxWidth={maxWidth}
      fullWidth
    >
      {onSubmit ? (
        <Box component="form" onSubmit={onSubmit}>
          {body}
        </Box>
      ) : (
        body
      )}
    </Dialog>
  );
}
