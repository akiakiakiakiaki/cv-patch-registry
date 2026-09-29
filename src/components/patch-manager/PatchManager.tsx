"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { PatchRecord } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/utils/date-format";
import styles from "@/components/patch-manager/PatchManager.module.scss";
import { useI18n } from "@/i18n/provider";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { InlineSvgAsset } from "@/components/inline-svg-asset/InlineSvgAsset";

interface PatchManagerProps {
  instruments: readonly InstrumentDefinition[];
  instrumentId: string;
  onInstrumentChange: (instrumentId: string) => void;
  patches: readonly PatchRecord[];
  activeId: string;
  activeName: string;
  status: string;
  onNameChange: (name: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function PatchManager(props: PatchManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const patches = [...props.patches].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      setExpanded(true);
      props.onImport(file);
    }
    event.currentTarget.value = "";
  }

  function requestRename(patch: PatchRecord) {
    const name = window.prompt(t("patch.renamePrompt"), patch.name);
    if (name === null) return;
    if (!name.trim()) {
      window.alert(t("patch.emptyName"));
      return;
    }
    props.onRename(patch.id, name.trim());
  }

  function requestDelete(patch: PatchRecord) {
    if (window.confirm(t("patch.deleteConfirm", { name: patch.name })))
      props.onDelete(patch.id);
  }

  return (
    <>
      <header className={styles.toolbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <InlineSvgAsset
              className={styles.brandLogo}
              src="/logo.svg"
              ariaHidden
            />
          </span>
          <div>
            <strong>{t("brand.title")}</strong>
            <small>{t("brand.subtitle")}</small>
          </div>
        </div>
        <label className={styles.instrumentSelect}>
          {t("instrument.select")}
          <select
            value={props.instrumentId}
            aria-label={t("instrument.selectAria")}
            onChange={(event) =>
              props.onInstrumentChange(event.currentTarget.value)
            }
          >
            {props.instruments.map((instrument) => (
              <option
                key={instrument.id}
                value={instrument.id}
              >
                {instrument.displayName}
              </option>
            ))}
          </select>
        </label>
        <div
          className={styles.languageSwitch}
          role="group"
          aria-label={t("language.label")}
        >
          <button
            type="button"
            aria-pressed={locale === "de"}
            onClick={() => setLocale("de")}
          >
            DE
          </button>
          <button
            type="button"
            aria-pressed={locale === "en"}
            onClick={() => setLocale("en")}
          >
            EN
          </button>
        </div>
        <label className={styles.patchName}>
          {t("patch.active")}
          <input
            value={props.activeName}
            maxLength={60}
            aria-label={t("patch.nameAria")}
            onChange={(event) => props.onNameChange(event.currentTarget.value)}
          />
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="patchPanel"
            onClick={() => setExpanded((value) => !value)}
          >
            {t("patch.list")} <span aria-hidden="true">▾</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              props.onCreate();
            }}
          >
            + {t("patch.new")}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={props.onExport}
          >
            {t("patch.downloadAll")}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
          >
            {t("patch.import")}
          </button>
          <input
            ref={fileInput}
            className={styles.visuallyHidden}
            type="file"
            aria-label={t("patch.import")}
            accept=".json,application/json"
            onChange={importFile}
          />
        </div>
      </header>
      {expanded && (
        <section
          id="patchPanel"
          className={styles.patchPanel}
          aria-label={t("patch.libraryAria")}
        >
          <div className={styles.panelHeading}>
            <div>
              <strong>{t("patch.local")}</strong>
              <small>
                {patches.length}{" "}
                {t(patches.length === 1 ? "patch.countOne" : "patch.countMany")}{" "}
                · {props.status}
              </small>
            </div>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setExpanded(false)}
            >
              {t("patch.close")} ×
            </button>
          </div>
          <div className={styles.patchList}>
            {patches.map((patch) => (
              <article
                key={patch.id}
                className={`${styles.patchEntry}${patch.id === props.activeId ? ` ${styles.active}` : ""}`}
              >
                <button
                  type="button"
                  className={styles.patchSelect}
                  aria-current={
                    patch.id === props.activeId ? "true" : undefined
                  }
                  onClick={() => props.onSelect(patch.id)}
                >
                  <strong>{patch.name}</strong>
                  <small>
                    {t("patch.lastChanged")} ·{" "}
                    {formatTimestamp(patch.updatedAt, locale)}
                  </small>
                </button>
                <div className={styles.patchActions}>
                  <button
                    type="button"
                    className={styles.iconAction}
                    aria-label={t("patch.renameAria", { name: patch.name })}
                    onClick={() => requestRename(patch)}
                  >
                    {t("patch.rename")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconAction} ${styles.deleteAction}`}
                    aria-label={t("patch.deleteAria", { name: patch.name })}
                    onClick={() => requestDelete(patch)}
                  >
                    {t("patch.delete")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
