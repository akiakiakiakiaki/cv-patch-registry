"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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

/** A dialog asking for one line of text. Confirming is only possible with non-blank text. */
export interface PromptOptions extends Omit<ConfirmOptions, "alternativeLabel"> {
  label: string;
  initialValue?: string;
  maxLength?: number;
  /** Shown below the field while it is blank. */
  emptyHint?: string;
}

/** What the user chose. Escape and the backdrop count as "cancel". */
export type ConfirmChoice = "confirm" | "alternative" | "cancel";

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  /** Adds a text field; onConfirm then receives its trimmed value. */
  input?: Pick<PromptOptions, "label" | "initialValue" | "maxLength" | "emptyHint">;
  onConfirm: (value?: string) => void;
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
  input,
  onConfirm,
  onCancel,
  onAlternative,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const contentId = useId();
  const { color, Icon } = TONE[tone];
  const [value, setValue] = useState(input?.initialValue ?? "");
  const blank = Boolean(input) && !value.trim();
  const submit = () => {
    if (blank) return;
    onConfirm(input ? value.trim() : undefined);
  };
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby={titleId} aria-describedby={contentId} maxWidth="sm" fullWidth>
      <DialogTitle id={titleId}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Icon color={color} aria-hidden />
          <span>{title}</span>
        </Stack>
      </DialogTitle>
      <DialogContent id={contentId}>
        {content}
        {input ? (
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label={input.label}
            value={value}
            error={blank}
            helperText={blank ? input.emptyHint : undefined}
            slotProps={{ htmlInput: { maxLength: input.maxLength } }}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              submit();
            }}
          />
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
        {alternativeLabel && onAlternative ? (
          <Button onClick={onAlternative} sx={{ mr: "auto" }}>
            {alternativeLabel}
          </Button>
        ) : null}
        {/* Cancel has the initial focus, unless there is text to type. */}
        <Button onClick={onCancel} autoFocus={!input}>
          {cancelLabel ?? t("confirm.cancel")}
        </Button>
        <Button onClick={submit} disabled={blank} variant="contained" color={color}>
          {confirmLabel ?? t("confirm.ok")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type Request = { id: number; options: ConfirmOptions; input?: ConfirmDialogProps["input"] };
type Answer = { choice: ConfirmChoice; value?: string };

/**
 * Promise-based use of ConfirmDialog. `confirm` answers yes/no; `choose` also reports the alternative action;
 * `prompt` asks for text and resolves null on cancel. Render `dialog` once in the component.
 * A second request while one is open cancels the first.
 */
export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  choose: (options: ConfirmOptions) => Promise<ConfirmChoice>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((answer: Answer) => void) | null>(null);
  const nextId = useRef(0);

  const settle = useCallback((answer: Answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  const ask = useCallback((next: Omit<Request, "id">) => {
    resolver.current?.({ choice: "cancel" });
    nextId.current += 1;
    setRequest({ ...next, id: nextId.current });
    return new Promise<Answer>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const choose = useCallback((options: ConfirmOptions) => ask({ options }).then((answer) => answer.choice), [ask]);
  const confirm = useCallback((options: ConfirmOptions) => choose(options).then((choice) => choice === "confirm"), [choose]);
  const prompt = useCallback(
    ({ label, initialValue, maxLength, emptyHint, ...options }: PromptOptions) =>
      ask({ options, input: { label, initialValue, maxLength, emptyHint } }).then((answer) =>
        answer.choice === "confirm" ? (answer.value ?? null) : null,
      ),
    [ask],
  );

  const dialog = request ? (
    <ConfirmDialog
      // A new request starts with a fresh text field.
      key={request.id}
      open
      {...request.options}
      input={request.input}
      onConfirm={(value) => settle({ choice: "confirm", value })}
      onCancel={() => settle({ choice: "cancel" })}
      onAlternative={() => settle({ choice: "alternative" })}
    />
  ) : null;
  return { confirm, choose, prompt, dialog };
}
