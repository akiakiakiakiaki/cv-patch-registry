"use client";

import { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import { useI18n } from "@/i18n/provider";
import { MAX_TAGS_PER_PATCH, formatTagLabel, normalizeTag, type TagEntry } from "@/lib/domain/tags";

const SUGGESTION_DELAY_MS = 200;

/**
 * Adds typed or chosen tags to the current ones: known tags keep their spelling ("fx" → "FX"), new ones start
 * uppercase. Duplicates (same slug) and anything beyond the limit are left out; invalid entries are reported.
 */
export function addTags(
  current: readonly string[],
  added: readonly string[],
  known: readonly TagEntry[],
): { tags: string[]; invalid: string[]; tooMany: boolean } {
  const tags = [...current];
  const invalid: string[] = [];
  let tooMany = false;
  for (const raw of added) {
    const slug = normalizeTag(raw);
    const label = known.find((tag) => tag.slug === slug)?.label ?? formatTagLabel(raw);
    if (!slug || !label) {
      if (raw.trim()) invalid.push(raw.trim());
      continue;
    }
    if (tags.some((tag) => normalizeTag(tag) === slug)) continue;
    if (tags.length >= MAX_TAGS_PER_PATCH) {
      tooMany = true;
      continue;
    }
    tags.push(label);
  }
  return { tags, invalid, tooMany };
}

/** Tag field with suggestions: chosen tags become chips; Enter or a comma turns typed text into a chip. */
export function TagInput({ value, onChange }: { value: readonly string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<TagEntry[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/tags?q=${encodeURIComponent(input.trim())}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { tags: [] }))
        .then((body: { tags?: TagEntry[] }) => setSuggestions(body.tags ?? []))
        .catch(() => undefined);
    }, SUGGESTION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  function commit(added: readonly string[], replace?: readonly string[]) {
    const result = addTags(replace ?? value, added, suggestions);
    setProblem(
      result.invalid.length > 0
        ? t("patches.tagsInvalid", { tag: result.invalid[0]! })
        : result.tooMany
          ? t("patches.tagsMax", { max: MAX_TAGS_PER_PATCH })
          : null,
    );
    if (result.tags.length !== value.length || result.tags.some((tag, index) => tag !== value[index])) onChange(result.tags);
  }

  const chosen = new Set(value.map((tag) => normalizeTag(tag)));
  const options = suggestions.filter((tag) => !chosen.has(tag.slug)).map((tag) => tag.label);

  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      size="small"
      options={options}
      value={[...value]}
      inputValue={input}
      filterOptions={(items) => items}
      onInputChange={(_event, next, reason) => {
        if (reason === "reset") return setInput("");
        // A comma finishes the tags typed so far.
        if (next.includes(",")) {
          const parts = next.split(",");
          setInput(parts.pop() ?? "");
          commit(parts);
          return;
        }
        setInput(next);
      }}
      onChange={(_event, next, reason) => {
        if (reason === "removeOption" || reason === "clear") {
          setProblem(null);
          onChange([...next]);
          return;
        }
        const added = next.filter((tag) => !value.includes(tag));
        setInput("");
        commit(added);
      }}
      renderValue={(tags, getItemProps) =>
        tags.map((tag, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return <Chip key={key} size="small" label={tag} {...itemProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={t("patches.tags")}
          placeholder={value.length < MAX_TAGS_PER_PATCH ? t("patches.tagsPlaceholder") : undefined}
          error={problem !== null}
          helperText={problem ?? undefined}
        />
      )}
      sx={(theme) => ({
        minWidth: 260,
        maxWidth: 520,
        flex: "1 1 260px",
        // Typed text and the "Add tag" placeholder in the size of the tag chips (MUI's small chip label).
        // The input inherits its font from the input root, so the size is set there.
        "& .MuiInputBase-root": { fontSize: theme.typography.pxToRem(13) },
      })}
    />
  );
}
