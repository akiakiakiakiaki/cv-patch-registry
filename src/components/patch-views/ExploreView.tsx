"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useI18n } from "@/i18n/provider";
import { CURATED_TAGS } from "@/lib/domain/tags";
import type { PatchSummary } from "@/lib/patches/patch-service";

interface Props {
  patches: readonly PatchSummary[];
  activeTag: string | null;
  activeSynth: string | null;
  synths: readonly { slug: string; displayName: string }[];
}

export function ExploreView({ patches, activeTag, activeSynth, synths }: Props) {
  const { t } = useI18n();
  const query = (next: { tag?: string | null; synth?: string | null }) => {
    const params = new URLSearchParams();
    const tag = next.tag === undefined ? activeTag : next.tag;
    const synth = next.synth === undefined ? activeSynth : next.synth;
    if (tag) params.set("tag", tag);
    if (synth) params.set("synth", synth);
    const text = params.toString();
    return text ? `/explore?${text}` : "/explore";
  };

  return (
    <Box component="main" sx={{ maxWidth: 1000, mx: "auto", p: { xs: 2, md: 3 } }}>
      <Typography variant="h1" sx={{ fontSize: "1.5rem", mb: 2 }}>{t("patches.explore")}</Typography>

      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} aria-label={t("patches.filterTag")}>
          <Chip component={NextLink} href={query({ tag: null })} clickable label={t("patches.allTags")} color={activeTag ? "default" : "primary"} />
          {CURATED_TAGS.map((tag) => (
            <Chip key={tag.slug} component={NextLink} href={query({ tag: tag.slug })} clickable label={tag.label} color={activeTag === tag.slug ? "primary" : "default"} />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} aria-label={t("patches.filterSynth")}>
          <Chip component={NextLink} href={query({ synth: null })} clickable label={t("patches.allSynths")} color={activeSynth ? "default" : "primary"} />
          {synths.map((synth) => (
            <Chip key={synth.slug} component={NextLink} href={query({ synth: synth.slug })} clickable label={synth.displayName} color={activeSynth === synth.slug ? "primary" : "default"} />
          ))}
        </Stack>
      </Stack>

      {patches.length === 0 ? (
        <Typography color="text.secondary">{t("patches.noPublic")}</Typography>
      ) : (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
          {patches.map((patch) => (
            <Box component="li" key={patch.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
              <Link component={NextLink} href={`/patches/${encodeURIComponent(patch.id)}`} underline="hover" sx={{ fontWeight: 600 }}>
                {patch.name}
              </Link>
              <Typography variant="body2" color="text.secondary">{patch.synth.displayName}</Typography>
              {patch.tags.map((tag) => <Chip key={tag} size="small" label={tag} />)}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
