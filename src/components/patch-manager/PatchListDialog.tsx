"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import { AppDialog } from "@/components/app-dialog/AppDialog";
import type { PatchRecord } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";

/**
 * All patches of the synth, one row each, newest first, above the panel instead of pushing it down.
 * Opening a patch or creating one closes the list, so the patch is shown right away.
 * With `transfer`, the whole library can be downloaded and patch files imported here.
 */
export function PatchListDialog({
  open,
  onClose,
  patches,
  activeId,
  status,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  transfer,
}: {
  open: boolean;
  onClose: () => void;
  /** In display order. */
  patches: readonly PatchRecord[];
  activeId: string;
  status: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (patch: PatchRecord) => void;
  onDelete: (patch: PatchRecord) => void;
  transfer?: { onExport: () => void; onImport: (file: File) => void };
}) {
  const { locale, t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) transfer?.onImport(file);
    event.currentTarget.value = "";
  }

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={t("patch.list")}
      subtitle={`${patches.length} ${t(patches.length === 1 ? "patch.countOne" : "patch.countMany")} · ${status}`}
      maxWidth="md"
      closeButton
      actions={
        <>
          <Button
            variant="outlined"
            sx={{ mr: "auto" }}
            onClick={() => {
              onCreate();
              onClose();
            }}
          >
            + {t("patch.new")}
          </Button>
          {transfer ? (
            <>
              <Button variant="outlined" onClick={() => fileInput.current?.click()}>
                {t("patch.import")}
              </Button>
              <input ref={fileInput} hidden type="file" aria-label={t("patch.import")} accept=".json,application/json" onChange={importFile} />
              <Button variant="contained" onClick={transfer.onExport}>
                {t("patch.downloadAll")}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <List disablePadding aria-label={t("patch.list")}>
        {patches.map((patch) => {
          const active = patch.id === activeId;
          return (
            <ListItem
              key={patch.id}
              disablePadding
              divider
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => onRename(patch)} aria-label={t("patch.renameAria", { name: patch.name })}>
                    {t("patch.rename")}
                  </Button>
                  <Button size="small" color="error" onClick={() => onDelete(patch)} aria-label={t("patch.deleteAria", { name: patch.name })}>
                    {t("patch.delete")}
                  </Button>
                </Stack>
              }
              // Room for the two buttons on the right, also with long names.
              sx={{ "& .MuiListItemButton-root": { pr: 22 } }}
            >
              <ListItemButton
                selected={active}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  onSelect(patch.id);
                  onClose();
                }}
              >
                <ListItemText
                  primary={patch.name}
                  secondary={`${t("patch.lastChanged")} · ${formatTimestamp(patch.updatedAt, locale)}`}
                  slotProps={{ primary: { sx: { fontWeight: 700, overflowWrap: "anywhere" } } }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </AppDialog>
  );
}
