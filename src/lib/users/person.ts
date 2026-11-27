import type { MessageKey, MessageValues } from "@/i18n/messages";

type Translate = (key: MessageKey, values?: MessageValues) => string;

/** An account as lists show it, e.g. the owner of a patch; `deleted` once its account was deleted for good. */
export interface Person {
  name: string;
  email: string;
  deleted: boolean;
}

/** The name the app shows for an account: a deleted one has none left (see deleteUserData), so it is named as such. */
export function personName(t: Translate, person: Pick<Person, "name" | "deleted">): string {
  return person.deleted ? t("admin.deletedUser") : person.name;
}
