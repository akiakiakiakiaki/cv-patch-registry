"use client";

import Typography from "@mui/material/Typography";
import { useI18n } from "@/i18n/provider";
import { personName, type Person } from "@/lib/users/person";

/** An account in an admin list: its name, with the email address below; a deleted account shows only that it is. */
export function PersonCell({ person }: { person: Person }) {
  const { t } = useI18n();
  return (
    <>
      {person.deleted ? (
        <Typography component="span" variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
          {personName(t, person)}
        </Typography>
      ) : (
        person.name
      )}
      {person.deleted ? null : (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {person.email}
        </Typography>
      )}
    </>
  );
}
