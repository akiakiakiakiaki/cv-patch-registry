"use client";

import { useEffect, useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ColorDot } from "@/components/synth-editor/CategorySettings";
import { fixedColorOf, shownCategoryIds } from "@/components/synth-editor/category-draft";
import type { EditorControl } from "@/components/synth-editor/draft-state";
import { CONTROL_KINDS, type ControlKind } from "@/lib/domain/control-ids";
import type { ControlCategory } from "@/lib/instrument/layout";
import { useI18n } from "@/i18n/provider";

/**
 * All controls of the synth, one collapsible group per kind. Groups start collapsed; the group of the focused
 * control opens so it is visible in the list.
 */
export function ControlGroupList({
  controls,
  categories,
  focusedId,
  onSelect,
  onRemove,
}: {
  controls: readonly EditorControl[];
  categories: readonly ControlCategory[];
  focusedId: string | undefined;
  onSelect: (control: EditorControl) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [openGroups, setOpenGroups] = useState<ReadonlySet<ControlKind>>(() => new Set());
  const focusedKind = focusedId ? controls.find((control) => control.id === focusedId)?.kind : undefined;
  useEffect(() => {
    if (focusedKind) setOpenGroups((current) => (current.has(focusedKind) ? current : new Set([...current, focusedKind])));
  }, [focusedKind, focusedId]);
  const toggleGroup = (kind: ControlKind, open: boolean) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(kind);
      else next.delete(kind);
      return next;
    });

  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t("synths.controls")} ({controls.length})</Typography>
      {CONTROL_KINDS.map((kind) => {
        const group = controls.filter((control) => control.kind === kind);
        if (group.length === 0) return null;
        return (
          <Accordion
            key={kind}
            disableGutters
            elevation={0}
            variant="outlined"
            expanded={openGroups.has(kind)}
            onChange={(_event, open) => toggleGroup(kind, open)}
            slotProps={{ transition: { unmountOnExit: true } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`controls-${kind}`} id={`controls-${kind}-header`}>
              <Typography variant="body2">{t("synths.controlGroup", { group: t(`synths.kindGroup.${kind}`), count: group.length })}</Typography>
            </AccordionSummary>
            <AccordionDetails id={`controls-${kind}`} sx={{ pt: 0 }}>
              <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
                {group.map((control) => {
                  const fixedColor = fixedColorOf(control);
                  return (
                    <Box component="li" key={control.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Button size="small" onClick={() => onSelect(control)} sx={{ justifyContent: "flex-start", flex: 1, textAlign: "left" }}>
                        {shownCategoryIds(control, controls).map((categoryId) => (
                          <ColorDot key={categoryId} categoryId={categoryId} color={categories.find((category) => category.id === categoryId)?.color} />
                        ))}
                        {fixedColor ? <ColorDot fixed color={fixedColor} /> : null}
                        {control.label} · {t(`synths.kind.${control.kind}`)}
                      </Button>
                      <IconButton size="small" aria-label={t("synths.removeAria", { label: control.label })} onClick={() => onRemove(control.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  );
                })}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
