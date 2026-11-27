import type { Database } from "@/lib/db/client";
import { isAdmin, type Actor } from "@/lib/domain/policy";
import { listSamplesForAdmin } from "@/lib/repositories/samples-repository";
import { storagePublicUrl } from "@/lib/storage";
import type { Person } from "@/lib/users/person";

/** One sample file in the admin's overview. */
export interface SampleAdminItem {
  assetId: string;
  url: string;
  byteSize: number;
  /** ISO date of the upload. */
  createdAt: string;
  uploader: Person;
  /** Null when no patch uses the file anymore (e.g. its patch was deleted): it can potentially be removed. */
  sample: { title: string; license: string } | null;
  patch: { id: string; name: string; visibility: string; owner: Pick<Person, "name" | "deleted"> } | null;
}

/** Samples of one synth, or (synth null) the files no patch uses. */
export interface SampleGroup {
  synth: { slug: string; displayName: string; deleted: boolean } | null;
  samples: SampleAdminItem[];
}

/**
 * Every sample file, grouped by the synth of the patch that uses it; files no patch uses come first in their own
 * group. Admins only (null otherwise).
 */
export async function listSampleGroups(db: Database, actor: Actor | null): Promise<SampleGroup[] | null> {
  if (!isAdmin(actor)) return null;
  const groups = new Map<string, SampleGroup>();
  for (const row of await listSamplesForAdmin(db)) {
    const key = row.synth?.slug ?? "";
    const group = groups.get(key) ?? { synth: row.synth, samples: [] };
    group.samples.push({
      assetId: row.assetId,
      url: storagePublicUrl(row.storageKey),
      byteSize: row.byteSize,
      createdAt: row.createdAt.toISOString(),
      uploader: row.uploader,
      sample: row.sample,
      patch: row.patch,
    });
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    left.synth === null ? -1 : right.synth === null ? 1 : left.synth.displayName.localeCompare(right.synth.displayName),
  );
}
