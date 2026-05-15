#!/usr/bin/env python3
"""Replace main editor column layout in PrintWorkspace.tsx."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "src" / "features" / "print-workspace" / "PrintWorkspace.tsx"
t = path.read_text(encoding="utf-8")

start = t.find(
    '          <div className="mx-auto flex min-h-0 w-full max-w-[88rem] flex-1 flex-col-reverse gap-4 lg:flex-col lg:gap-5">'
)
if start == -1:
    raise SystemExit("start marker not found")

main_close = t.find("\n        </div>\n      </main>", start)
if main_close == -1:
    raise SystemExit("editor/main close not found")

old = t[start:main_close]

key_open = '                <div className="relative flex flex-1 items-center justify-center overflow-y-auto overflow-hidden rounded-2xl border border-[#2d333b] bg-[#0d1117] p-3 sm:p-8">'
key_agent = '\n              <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">'
i0 = old.find(key_open)
i1 = old.find(key_agent, i0)
if i0 == -1 or i1 == -1:
    raise SystemExit("could not extract preview block")
preview_canvas = old[i0:i1]
preview_canvas = preview_canvas.replace(
    "rounded-2xl border border-[#2d333b] bg-[#0d1117] p-3 sm:p-8",
    "min-h-[min(52vh,36rem)] rounded-lg border border-[var(--border)] bg-[#0d1117] p-3 sm:p-6",
)

top_analysis_open = '              <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 sm:gap-4 sm:p-4">'
top_grid_end = '            </div>\n\n            {/* Bottom Row: Preview & Tools */}'
i2 = old.find(top_analysis_open)
i3 = old.find(top_grid_end, i2)
if i2 == -1 or i3 == -1:
    raise SystemExit("could not extract analysis card")
analysis_card = old[i2:i3]

i4 = old.find(key_agent)
bottom_close = "\n            </div>\n          </div>"
i5 = old.rfind(bottom_close)
if i4 == -1 or i5 == -1:
    raise SystemExit("could not extract agent card")
agent_card = old[i4:i5]

head = """          <div className="mx-auto flex min-h-0 w-full max-w-[100rem] flex-1 flex-col gap-6 px-2 pb-4 sm:px-3 lg:px-4">
            <div className="flex w-full shrink-0 justify-center">
              <div className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 shadow-sm sm:p-4">
                {!file ? (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "flex min-h-[min(40vh,22rem)] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-4 py-10 transition-all",
                      isDragActive
                        ? "border-amber-500 bg-amber-500/5"
                        : "border-[var(--border)] hover:border-amber-500/40 hover:bg-amber-500/[0.03]",
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card)]">
                      <Upload className="h-7 w-7 text-[var(--text-muted)]" />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-white">Trage fișierul aici</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">PDF, PNG, JPG, WebP sau SVG</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-col gap-3 border-b border-[var(--border)] pb-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                          <Eye className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text)]">Previzualizare tipăribil</h3>
                          <p className="text-[10px] text-[var(--text-muted)]">Bleed, safe, ghidaje</p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]" title={file?.name}>{file?.name}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setSettings((prev) => ({ ...prev, showGuides: !prev.showGuides }))}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                            settings.showGuides
                              ? "border-amber-500 bg-amber-500 text-black"
                              : "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text-muted)]",
                          )}
                        >
                          Guides
                        </button>
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                        >
                          <Download className="h-4 w-4" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => open()}
                          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:border-amber-500/40"
                        >
                          Schimbă fișierul
                        </button>
                        <button
                          type="button"
                          onClick={clearWorkspaceFile}
                          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" />
                          Șterge
                        </button>
                      </div>
                    </div>
                    <div
                      {...getRootProps({
                        className: cn(
                          "relative rounded-lg",
                          isDragActive && "ring-2 ring-amber-500/50 ring-offset-2 ring-offset-[var(--surface-elevated)]",
                        ),
                      })}
                    >
                      <input {...getInputProps()} />
"""

tail = """
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:justify-end lg:gap-6">
              <div className="hidden lg:block lg:min-h-0 lg:flex-1" aria-hidden="true" />
              <div className="flex w-full min-h-0 flex-col gap-4 lg:w-[min(100%,420px)] lg:shrink-0">
"""

foot = """
              </div>
            </div>
          </div>"""

new = head + preview_canvas + tail + agent_card + "\n" + analysis_card + foot

path.write_text(t[:start] + new + t[main_close:], encoding="utf-8")
print("patched", path)
