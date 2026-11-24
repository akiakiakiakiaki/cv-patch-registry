"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import RemoveIcon from "@mui/icons-material/Remove";
import { dependentsOf, moveItem, switchRole, type SwitchRole } from "@/components/synth-editor/category-draft";
import type { EditorControl } from "@/components/synth-editor/draft-state";
import { useI18n } from "@/i18n/provider";
import type { CategoryIssue } from "@/lib/domain/switch-categories";
import type { ControlCategory } from "@/lib/instrument/layout";

type Translate = ReturnType<typeof useI18n>["t"];

const NONE = "";

/** The synth's color categories: add, rename, recolor, reorder and remove. */
export function CategoryList({
  categories,
  onAdd,
  onRename,
  onRecolor,
  onMove,
  onRemove,
}: {
  categories: readonly ControlCategory[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (category: ControlCategory) => void;
}) {
  const { t } = useI18n();
  return (
    <Box component="section" aria-labelledby="synth-categories-heading">
      <Typography id="synth-categories-heading" variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
        {t("synths.categories")}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {t("synths.categoriesHint")}
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
        {categories.map((category, index) => (
          <Box component="li" key={category.id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              component="input"
              type="color"
              value={category.color}
              aria-label={t("synths.categoryColor", { name: category.name })}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onRecolor(category.id, event.target.value)}
              sx={{ width: 36, height: 36, p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", flexShrink: 0 }}
            />
            <TextField
              size="small"
              label={t("synths.categoryName")}
              value={category.name}
              onChange={(event) => onRename(category.id, event.target.value)}
              error={!category.name.trim()}
              slotProps={{ htmlInput: { maxLength: 40 } }}
              sx={{ flex: 1 }}
            />
            <IconButton size="small" aria-label={t("synths.categoryUp", { name: category.name })} disabled={index === 0} onClick={() => onMove(category.id, -1)}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={t("synths.categoryDown", { name: category.name })}
              disabled={index === categories.length - 1}
              onClick={() => onMove(category.id, 1)}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label={t("synths.categoryRemove", { name: category.name })} onClick={() => onRemove(category)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} onClick={onAdd} sx={{ mt: 1 }}>
        {t("synths.categoryAdd")}
      </Button>
    </Box>
  );
}

/** Category of a knob, or the role of a switch with its category, selector categories or parent. */
export function ControlCategoryFields({
  control,
  controls,
  categories,
  onSetCategory,
  onSetRole,
  onSetSelectorCategories,
  onSetDependsOn,
}: {
  control: EditorControl;
  controls: readonly EditorControl[];
  categories: readonly ControlCategory[];
  onSetCategory: (id: string, categoryId: string | undefined) => void;
  onSetRole: (id: string, role: SwitchRole) => void;
  onSetSelectorCategories: (id: string, selects: readonly string[]) => void;
  onSetDependsOn: (id: string, parentId: string) => void;
}) {
  const { t } = useI18n();
  if (control.kind !== "knob" && control.kind !== "switch") return null;

  const categorySelect = (
    <TextField
      select
      size="small"
      label={t("synths.category")}
      value={control.category ?? NONE}
      onChange={(event) => onSetCategory(control.id, event.target.value || undefined)}
    >
      <MenuItem value={NONE}>{t("synths.categoryNone")}</MenuItem>
      {categories.map((category) => (
        <MenuItem key={category.id} value={category.id}>
          <ColorDot color={category.color} />
          {category.name}
        </MenuItem>
      ))}
    </TextField>
  );
  if (control.kind === "knob") return categorySelect;

  const role = switchRole(control);
  const selectors = controls.filter((item) => item.id !== control.id && item.kind === "switch" && item.selects);
  return (
    <Stack spacing={1}>
      <TextField
        select
        size="small"
        label={t("synths.switchRole")}
        value={role}
        onChange={(event) => onSetRole(control.id, event.target.value as SwitchRole)}
        helperText={selectors.length === 0 && role !== "selector" ? t("synths.dependentNeedsSelector") : undefined}
      >
        <MenuItem value="plain">{t("synths.role.plain")}</MenuItem>
        <MenuItem value="selector">{t("synths.role.selector")}</MenuItem>
        <MenuItem value="dependent" disabled={selectors.length === 0}>
          {t("synths.role.dependent")}
        </MenuItem>
      </TextField>
      {role === "plain" ? categorySelect : null}
      {role === "selector" ? (
        <SelectorCategories control={control} controls={controls} categories={categories} onChange={(selects) => onSetSelectorCategories(control.id, selects)} />
      ) : null}
      {role === "dependent" ? (
        <>
          <TextField
            select
            size="small"
            label={t("synths.dependsOn")}
            value={control.dependsOn ?? NONE}
            onChange={(event) => onSetDependsOn(control.id, event.target.value)}
          >
            {selectors.map((selector) => (
              <MenuItem key={selector.id} value={selector.id}>
                {selector.label}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            {t("synths.dependentHint")}
          </Typography>
        </>
      ) : null}
    </Stack>
  );
}

/** Ordered categories a selector cycles through, with add (+), remove (−) and reorder. */
function SelectorCategories({
  control,
  controls,
  categories,
  onChange,
}: {
  control: EditorControl;
  controls: readonly EditorControl[];
  categories: readonly ControlCategory[];
  onChange: (selects: readonly string[]) => void;
}) {
  const { t } = useI18n();
  const selects = control.selects ?? [];
  const remaining = categories.filter((category) => !selects.includes(category.id));
  const [toAdd, setToAdd] = useState<string>(NONE);
  const addable = remaining.some((category) => category.id === toAdd) ? toAdd : (remaining[0]?.id ?? NONE);
  const nameOf = (id: string) => categories.find((category) => category.id === id)?.name ?? id;
  const colorOf = (id: string) => categories.find((category) => category.id === id)?.color;
  const dependents = dependentsOf(controls, control.id).length;

  if (categories.length < 2) {
    return (
      <Typography variant="caption" color="warning.main" role="status">
        {t("synths.selectorNeedsCategories")}
      </Typography>
    );
  }
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0, mb: 0.5 }}>
        {t("synths.selectorCategories")}
      </Typography>
      <Stack component="ol" spacing={0.5} sx={{ pl: 0, m: 0, listStyle: "none" }}>
        {selects.map((id, index) => (
          <Box component="li" key={id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2" sx={{ flex: 1, display: "flex", alignItems: "center" }}>
              <ColorDot color={colorOf(id)} />
              {index + 1}. {nameOf(id)}
            </Typography>
            <IconButton size="small" aria-label={t("synths.selectorUp", { name: nameOf(id) })} disabled={index === 0} onClick={() => onChange(moveItem(selects, index, -1))}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={t("synths.selectorDown", { name: nameOf(id) })}
              disabled={index === selects.length - 1}
              onClick={() => onChange(moveItem(selects, index, 1))}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={t("synths.selectorRemove", { name: nameOf(id) })}
              onClick={() => onChange(selects.filter((categoryId) => categoryId !== id))}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>
      {remaining.length > 0 ? (
        <Stack direction="row" spacing={0.5} sx={{ mt: 1, alignItems: "center" }}>
          <TextField select size="small" label={t("synths.selectorAddSelect")} value={addable} onChange={(event) => setToAdd(event.target.value)} sx={{ flex: 1 }}>
            {remaining.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                <ColorDot color={category.color} />
                {category.name}
              </MenuItem>
            ))}
          </TextField>
          <IconButton aria-label={t("synths.selectorAdd")} disabled={!addable} onClick={() => onChange([...selects, addable])}>
            <AddIcon />
          </IconButton>
        </Stack>
      ) : null}
      <Typography variant="caption" color={selects.length < 2 ? "warning.main" : "text.secondary"} sx={{ display: "block", mt: 0.5 }}>
        {t("synths.selectorHint")}
        {dependents > 0 ? ` ${t("synths.selectorDependents", { count: dependents })}` : ""}
      </Typography>
    </Box>
  );
}

function ColorDot({ color }: { color: string | undefined }) {
  return <Box component="span" aria-hidden sx={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", bgcolor: color ?? "transparent", border: 1, borderColor: "divider", mr: 1, flexShrink: 0 }} />;
}

/** Readable sentence for a configuration problem, naming controls and categories by their labels. */
export function categoryIssueText(
  issue: CategoryIssue,
  controls: readonly EditorControl[],
  categories: readonly ControlCategory[],
  t: Translate,
): string {
  const labelOf = (id: string) => controls.find((control) => control.id === id)?.label ?? id;
  const nameOf = (id: string) => categories.find((category) => category.id === id)?.name ?? id;
  switch (issue.code) {
    case "duplicate-category":
      return t("synths.issue.duplicate-category", { category: nameOf(issue.categoryId) });
    case "unknown-category":
      return t("synths.issue.unknown-category", { control: labelOf(issue.controlId) });
    case "selector-too-few":
      return t("synths.issue.selector-too-few", { control: labelOf(issue.controlId) });
    case "selector-duplicate":
      return t("synths.issue.selector-duplicate", { control: labelOf(issue.controlId), category: nameOf(issue.categoryId) });
    case "selector-with-parent":
      return t("synths.issue.selector-with-parent", { control: labelOf(issue.controlId) });
    case "selector-with-category":
      return t("synths.issue.selector-with-category", { control: labelOf(issue.controlId) });
    case "dependent-with-category":
      return t("synths.issue.dependent-with-category", { control: labelOf(issue.controlId) });
    case "parent-missing":
      return t("synths.issue.parent-missing", { control: labelOf(issue.controlId) });
    case "parent-not-selector":
      return t("synths.issue.parent-not-selector", { control: labelOf(issue.controlId), parent: labelOf(issue.parentId) });
  }
}
