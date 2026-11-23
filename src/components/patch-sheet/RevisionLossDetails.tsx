"use client";

import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useI18n } from "@/i18n/provider";
import type { RevisionLossPrompt } from "@/hooks/use-account-patch-library";
import type { RevisionLoss } from "@/lib/patches/revision-loss";

/**
 * Body of the confirm dialog listing settings a newer synth revision has no control for.
 * "upgrade": the user asked to update an outdated patch. "save": a save ran into a revision that changed meanwhile.
 */
export function RevisionLossDetails({ prompt, synthName, mode }: { prompt: RevisionLossPrompt; synthName: string; mode: "upgrade" | "save" }) {
  const { t } = useI18n();
  const values = { patch: prompt.patchName, synth: synthName, from: prompt.fromRevision, to: prompt.toRevision };
  return (
    <>
      <Typography gutterBottom>{t(mode === "upgrade" ? "revisionLoss.upgradeIntro" : "revisionLoss.intro", values)}</Typography>
      <List dense aria-label={t("revisionLoss.listLabel")} sx={{ bgcolor: "action.hover", borderRadius: 1, my: 1.5 }}>
        {prompt.losses.map((loss) => (
          <ListItem key={`${loss.kind}:${loss.id}`}>
            <ListItemText
              primary={t("revisionLoss.item", { kind: t(`revisionLoss.kind.${loss.kind}`), label: loss.label })}
              secondary={valueText(loss, t)}
            />
          </ListItem>
        ))}
      </List>
      <Typography color="text.secondary" variant="body2">
        {t(mode === "upgrade" ? "revisionLoss.upgradeOutro" : "revisionLoss.outro", values)}
      </Typography>
    </>
  );
}

function valueText(loss: RevisionLoss, t: ReturnType<typeof useI18n>["t"]): string | undefined {
  if (loss.kind === "knob") return t("revisionLoss.value", { value: loss.value });
  if (loss.kind === "switch" || loss.kind === "led") return t(loss.value ? "revisionLoss.on" : "revisionLoss.off");
  return undefined;
}
