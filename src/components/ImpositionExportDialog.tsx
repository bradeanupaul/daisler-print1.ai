import { LayoutGrid, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { ImpositionGridPlan } from "../lib/impositionLayout";
import { IMPOSITION_SHEETS, type ProcessingSettings } from "../types";

export type ImpositionExportDialogProps = {
  open: boolean;
  onClose: () => void;
  settings: ProcessingSettings;
  onSettingsChange: (next: ProcessingSettings) => void;
  plan: ImpositionGridPlan;
  previewUrl: string | null;
  fileName?: string;
  onExport: () => void;
  exporting: boolean;
  canExport: boolean;
};

function ImpositionSheetPreview({
  plan,
  imageUrl,
}: {
  plan: ImpositionGridPlan;
  imageUrl: string | null;
}) {
  if (plan.total <= 0) {
    return (
      <div className="flex min-h-[min(50vh,20rem)] flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-deep)] p-6 text-center">
        <p className="max-w-xs text-sm text-[var(--text-muted)]">
          Grid invalid sau articol prea mare. Ajustează setările din stânga.
        </p>
      </div>
    );
  }

  const { sheetWidthMm: sw, sheetHeightMm: sh, itemWidthMm: iw, itemHeightMm: ih, spacingMm: gap } =
    plan;
  const sheetR = sw / sh;

  const gridW = plan.cols * iw + (plan.cols - 1) * gap;
  const gridH = plan.rows * ih + (plan.rows - 1) * gap;
  const offsetXmm = Math.max(0, (sw - gridW) / 2);
  const offsetYmm = Math.max(0, (sh - gridH) / 2);

  const pct = (mm: number, base: number) => (mm / base) * 100;
  const cellWpct = pct(iw, sw);
  const cellHpct = pct(ih, sh);
  const gapXpct = pct(gap, sw);
  const gapYpct = pct(gap, sh);
  const offsetXpct = pct(offsetXmm, sw);
  const offsetYpct = pct(offsetYmm, sh);

  const cells: { key: number; left: number; top: number }[] = [];
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      cells.push({
        key: r * plan.cols + c,
        left: offsetXpct + c * (cellWpct + gapXpct),
        top: offsetYpct + r * (cellHpct + gapYpct),
      });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-2 sm:p-4">
      <div className="relative flex min-h-[min(40vh,22rem)] w-full min-w-0 flex-1 items-center justify-center overflow-hidden [container-type:size]">
        <div
          className="relative overflow-hidden rounded-lg bg-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          style={{
            aspectRatio: `${sw} / ${sh}`,
            width: `min(100cqw, calc(100cqh * ${sheetR}))`,
            height: `min(100cqh, calc(100cqw / ${sheetR}))`,
          }}
        >
          {cells.map(({ key, left, top }) => (
            <div
              key={key}
              className="absolute overflow-hidden border border-black/15 bg-neutral-50"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${cellWpct}%`,
                height: `${cellHpct}%`,
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-100">
                  <LayoutGrid className="h-3 w-3 text-neutral-300" aria-hidden />
                </div>
              )}
            </div>
          ))}
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/10" />
        </div>
      </div>
      <p className="mt-3 shrink-0 text-center text-[10px] tabular-nums text-[var(--text-muted)]">
        Coală {sw}×{sh} mm · piesă {Math.round(iw * 10) / 10}×{Math.round(ih * 10) / 10} mm ·
        grid {Math.round(gridW * 10) / 10}×{Math.round(gridH * 10) / 10} mm
      </p>
    </div>
  );
}

function ImpositionSettingsPanel({
  settings,
  onSettingsChange,
  plan,
}: {
  settings: ProcessingSettings;
  onSettingsChange: (next: ProcessingSettings) => void;
  plan: ImpositionGridPlan;
}) {
  const set = (patch: Partial<ProcessingSettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <div className="custom-scrollbar space-y-3 overflow-y-auto pr-1">
      <div className="space-y-1.5">
        <label className="sidebar-label" htmlFor="imposition-sheet-dialog">
          Coală tipar
        </label>
        <select
          id="imposition-sheet-dialog"
          value={settings.impositionSheetId ?? "a3"}
          onChange={(e) => {
            const id = e.target.value;
            const preset = IMPOSITION_SHEETS.find((s) => s.id === id);
            set({
              impositionSheetId: id,
              ...(preset && preset.id !== "custom"
                ? {
                    customSheetWidth: preset.width,
                    customSheetHeight: preset.height,
                  }
                : {}),
            });
          }}
          className="workspace-input w-full cursor-pointer"
        >
          {IMPOSITION_SHEETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {(settings.impositionSheetId ?? "a3") === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="sidebar-label">Lățime coală (mm)</label>
            <input
              type="number"
              value={settings.customSheetWidth === null ? "" : settings.customSheetWidth}
              onChange={(e) =>
                set({
                  customSheetWidth: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="workspace-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="sidebar-label">Înălțime coală (mm)</label>
            <input
              type="number"
              value={settings.customSheetHeight === null ? "" : settings.customSheetHeight}
              onChange={(e) =>
                set({
                  customSheetHeight: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="workspace-input"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="sidebar-label">Mod placare</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set({ impositionSizeMode: "actual" })}
            className="dpi-pill text-[10px]"
            data-active={(settings.impositionSizeMode ?? "actual") === "actual" ? "true" : "false"}
          >
            Dimensiune reală
          </button>
          <button
            type="button"
            onClick={() =>
              set({
                impositionSizeMode: "fit",
                autoMaximize: false,
              })
            }
            className="dpi-pill text-[10px]"
            data-active={settings.impositionSizeMode === "fit" ? "true" : "false"}
          >
            Fit
          </button>
        </div>
        <p className="text-[9px] leading-snug text-[var(--text-subtle)]">
          {(settings.impositionSizeMode ?? "actual") === "fit"
            ? "Alege câte bucăți — imaginea se scalează în fiecare celulă."
            : "Piesa la dimensiunea formatului; calculezi câte încap pe coală."}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="sidebar-label">Spațiu între piese (mm)</label>
        <input
          type="number"
          placeholder={`Implicit ${(settings.bleed ?? 3) * 2} (2× bleed)`}
          value={settings.impositionSpacing === null ? "" : settings.impositionSpacing}
          onChange={(e) =>
            set({
              impositionSpacing: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className="workspace-input"
        />
      </div>

      {(settings.impositionSizeMode ?? "actual") === "actual" && (
        <div className="sidebar-toggle">
          <span className="text-[var(--text-muted)]">Umple coală automat</span>
          <button
            type="button"
            onClick={() => set({ autoMaximize: !settings.autoMaximize })}
            className="sidebar-toggle-switch"
            data-on={settings.autoMaximize !== false ? "true" : "false"}
            aria-pressed={settings.autoMaximize !== false}
          />
        </div>
      )}

      {((settings.impositionSizeMode ?? "actual") === "fit" ||
        settings.autoMaximize === false) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="sidebar-label">Rânduri</label>
            <input
              type="number"
              min={1}
              placeholder="—"
              value={
                settings.impositionRows == null ? "" : String(settings.impositionRows)
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  set({ impositionRows: null });
                  return;
                }
                const n = Number(raw);
                set({
                  impositionRows: Number.isFinite(n) ? n : null,
                });
              }}
              className="workspace-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="sidebar-label">Coloane</label>
            <input
              type="number"
              min={1}
              placeholder="—"
              value={
                settings.impositionCols == null ? "" : String(settings.impositionCols)
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  set({ impositionCols: null });
                  return;
                }
                const n = Number(raw);
                set({
                  impositionCols: Number.isFinite(n) ? n : null,
                });
              }}
              className="workspace-input"
            />
          </div>
        </div>
      )}

      <p
        className={cn(
          "rounded-lg border px-2.5 py-2 text-[10px] leading-snug tabular-nums",
          plan.total > 0
            ? "border-amber-500/25 bg-amber-500/10 text-amber-200/90"
            : "border-red-500/30 bg-red-500/10 text-red-300/90",
        )}
      >
        {plan.total > 0 ? (
          <>
            <span className="font-semibold text-amber-400">
              {plan.rows}×{plan.cols} = {plan.total} bucăți
            </span>
            <span className="mt-0.5 block text-[var(--text-muted)]">
              {plan.sizeMode === "fit" ? (
                <>
                  Celulă {Math.round(plan.itemWidthMm * 10) / 10}×
                  {Math.round(plan.itemHeightMm * 10) / 10} mm · nativ{" "}
                  {Math.round(plan.nativeItemWidthMm * 10) / 10}×
                  {Math.round(plan.nativeItemHeightMm * 10) / 10} mm
                </>
              ) : (
                <>
                  Piesă {Math.round(plan.itemWidthMm * 10) / 10}×
                  {Math.round(plan.itemHeightMm * 10) / 10} mm
                  {plan.auto ? " · auto" : " · manual"}
                </>
              )}
            </span>
          </>
        ) : settings.impositionRows == null ||
          settings.impositionCols == null ? (
          "Completează rânduri și coloane (minim 1)."
        ) : (settings.impositionSizeMode ?? "actual") === "fit" ? (
          "Grid invalid — verifică rânduri, coloane și coală."
        ) : (
          "Articolul nu încape — mărește coală sau micșorează formatul."
        )}
      </p>
    </div>
  );
}

export function ImpositionExportDialog({
  open,
  onClose,
  settings,
  onSettingsChange,
  plan,
  previewUrl,
  fileName,
  onExport,
  exporting,
  canExport,
}: ImpositionExportDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="imposition-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose();
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <LayoutGrid className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <h2 id="imposition-dialog-title" className="text-sm font-bold text-[var(--text)]">
                Export imposiție
              </h2>
              <p className="truncate text-[11px] text-[var(--text-muted)]">
                {fileName ? fileName : "Mai multe exemplare pe o coală"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="shrink-0 rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="custom-scrollbar shrink-0 border-b border-[var(--border)] bg-[var(--bg-deep)]/40 p-4 lg:w-[min(100%,18rem)] lg:border-b-0 lg:border-r xl:w-80">
            <p className="sidebar-kicker mb-3">Setări</p>
            <ImpositionSettingsPanel
              settings={settings}
              onSettingsChange={onSettingsChange}
              plan={plan}
            />
          </aside>

          <div className="flex min-h-[min(40vh,22rem)] min-w-0 flex-1 flex-col bg-[var(--bg-deep)] lg:min-h-0">
            <p className="shrink-0 border-b border-[var(--border)]/60 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Previzualizare coală
            </p>
            <ImpositionSheetPreview plan={plan} imageUrl={previewUrl} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/60 px-4 py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            Anulează
          </button>
          <button
            type="button"
            disabled={!canExport || exporting}
            onClick={onExport}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold transition-colors",
              canExport && !exporting
                ? "border-amber-500 bg-amber-500 text-black hover:bg-amber-400"
                : "cursor-not-allowed border-[var(--border)] bg-[var(--card)]/40 text-[var(--text-muted)] opacity-50",
            )}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LayoutGrid className="h-4 w-4" aria-hidden />
            )}
            Descarcă PDF imposiție
          </button>
        </div>
      </div>
    </div>
  );
}
