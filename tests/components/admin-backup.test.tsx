import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupAdminPanel } from "@/components/admin/BackupAdminPanel";
import { I18nProvider } from "@/i18n/provider";
import { BACKUP_FORMAT, BACKUP_TABLES, packBackup, type BackupManifest, type BackupTables } from "@/lib/backup/backup-format";

const KEY = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png";
const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, [] as Record<string, unknown>[]])) as BackupTables;
tables.user = [{ id: "ada" }];
const manifest: BackupManifest = {
  format: BACKUP_FORMAT,
  formatVersion: 1,
  createdAt: "2026-11-27T10:00:00.000Z",
  migrations: 8,
  rows: Object.fromEntries(BACKUP_TABLES.map((table) => [table, table === "user" ? 1 : 0])) as BackupManifest["rows"],
  files: [KEY],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let calls: Array<{ url: string; method: string }>;
let restoreAnswer: Response;
let downloads: string[];

beforeEach(() => {
  calls = [];
  downloads = [];
  restoreAnswer = json({ ok: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "/api/admin/backup") return json({ manifest, tables, fileUrls: { [KEY]: `/assets/uploads/${KEY}` } });
      if (url === `/assets/uploads/${KEY}`) return new Response(new Uint8Array([1, 2, 3]));
      if (url === "/api/admin/backup/upload-targets") return json({ targets: { [KEY]: { url: `/api/admin/backup/files/${KEY}`, method: "PUT", headers: {} } } });
      if (url === `/api/admin/backup/files/${KEY}`) return new Response(null, { status: 204 });
      if (url === "/api/admin/backup/restore") return restoreAnswer;
      return json({}, 404);
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:backup");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel() {
  return render(
    <I18nProvider locale="en">
      <BackupAdminPanel />
    </I18nProvider>,
  );
}

const backupFile = (changes: Partial<BackupManifest> = {}) =>
  new File([packBackup({ manifest: { ...manifest, ...changes }, tables, files: new Map([[KEY, new Uint8Array([1, 2, 3])]]) }) as BlobPart], "backup.zip", { type: "application/zip" });

async function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText("Choose backup file"), { target: { files: [file] } });
}

describe("Import/Export", () => {
  it("downloads a backup with the data and every file", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByText("The backup has been downloaded.")).toBeInTheDocument();
    expect(downloads).toEqual(["cv-patch-registry-backup-2026-11-27T10-00-00-000Z.zip"]);
    expect(calls.map((call) => call.url)).toEqual(["/api/admin/backup", `/assets/uploads/${KEY}`]);
  });

  it("still downloads the backup when storage lost a file, and lists it", async () => {
    const user = userEvent.setup();
    const base = vi.mocked(fetch).getMockImplementation()!;
    // Supabase answers a missing object with 400 "Object not found".
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input) === `/assets/uploads/${KEY}` ? json({ statusCode: "404", error: "not_found" }, 400) : base(input, init),
    );
    let packed: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      packed = blob;
      return "blob:backup";
    });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByText(new RegExp(`1 file\\(s\\) the database refers to were missing in storage and are not in it: ${KEY}`))).toBeInTheDocument();
    expect(downloads).toHaveLength(1);
    const { unpackBackup } = await import("@/lib/backup/backup-format");
    const backup = unpackBackup(new Uint8Array(await packed!.arrayBuffer()));
    expect(backup.manifest).toMatchObject({ files: [], missingFiles: [KEY] });
  });

  it("stops when storage fails for another reason", async () => {
    const user = userEvent.setup();
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => (String(input) === `/assets/uploads/${KEY}` ? new Response("down", { status: 503 }) : base(input, init)));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByText(`A file could not be loaded: ${KEY}`)).toBeInTheDocument();
    expect(downloads).toEqual([]);
  });

  it("notes files a backup was already missing", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Choose backup file"), {
      target: { files: [new File([packBackup({ manifest: { ...manifest, files: [], missingFiles: [KEY] }, tables, files: new Map() }) as BlobPart], "b.zip")] },
    });
    expect(await screen.findByText("1 file(s) were already missing when this backup was made.")).toBeInTheDocument();
  });

  it("refuses a file that is not a backup", async () => {
    renderPanel();
    await chooseFile(new File(["hello"], "notes.zip"));
    expect(await screen.findByText("This file is not a backup of this app.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore this backup" })).not.toBeInTheDocument();
  });

  it("restores after a warning: safety backup first, then the files, then the data", async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile(backupFile());
    expect(await screen.findByTestId("backup-summary")).toHaveTextContent("1 file(s), database version 8");

    await user.click(screen.getByRole("button", { name: "Restore this backup" }));
    const dialog = await screen.findByRole("dialog", { name: "Replace all data?" });
    expect(dialog).toHaveTextContent("everyone, you included, has to sign in again");
    await user.click(within(dialog).getByRole("button", { name: "Replace all data" }));

    expect(await screen.findByText(/The backup has been restored/)).toBeInTheDocument();
    expect(downloads).toHaveLength(1);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /api/admin/backup",
      `GET /assets/uploads/${KEY}`,
      "POST /api/admin/backup/upload-targets",
      `PUT /api/admin/backup/files/${KEY}`,
      "POST /api/admin/backup/restore",
    ]);
  });

  it("changes nothing when the restore is cancelled, and explains a backup from a newer app", async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile(backupFile({ migrations: 99 }));
    await user.click(await screen.findByRole("button", { name: "Restore this backup" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(calls).toEqual([]);

    restoreAnswer = json({ ok: false, error: "newer-backup" }, 409);
    await user.click(screen.getByRole("button", { name: "Restore this backup" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace all data" }));
    await waitFor(() => expect(screen.getByText(/from a newer version of the app/)).toBeInTheDocument());
  });
});
