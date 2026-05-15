import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { groupKindLabel, sourceKindLabel } from "../services/fileHistory";
import type { FileHistoryAsset, FileHistoryGroup, HistoryItem } from "../types";

type FileHistoryDrawerProps = {
  groupedHistory: FileHistoryGroup[];
  legacyHistory: HistoryItem[];
  onClose: () => void;
  onSelectAsset?: (group: FileHistoryGroup, asset: FileHistoryAsset) => void;
  loadingAssetId?: string | null;
  selectedAssetId?: string | null;
};

export function FileHistoryDrawer({
  groupedHistory,
  legacyHistory,
  onClose,
  onSelectAsset,
  loadingAssetId,
  selectedAssetId,
}: FileHistoryDrawerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (groupedHistory.length > 0) {
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        return new Set([groupedHistory[0].id]);
      });
    }
  }, [groupedHistory]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[45] flex min-h-0 flex-col gap-3 overflow-hidden border-0 bg-[#0d1117]/98 p-4 backdrop-blur-sm lg:relative lg:inset-auto lg:z-auto lg:max-h-full lg:min-h-0 lg:w-[min(100%,17.5rem)] lg:max-w-[17.5rem] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-[var(--border)] lg:bg-transparent lg:p-0 lg:pr-4"
    >
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center justify-between gap-3 border-b border-[#2d333b] pb-4 lg:border-0 lg:pb-0"
      >
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Istoric fișiere</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-[#94a3b8] hover:bg-white/5 hover:text-white"
          aria-label="Închide istoricul"
        >
          <X className="h-5 w-5 lg:h-4 lg:w-4" />
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
        className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5"
      >
        {isSupabaseConfigured() ? (
          groupedHistory.length === 0 ? (
            <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
              Încarcă un fișier sau exportă un PDF — lucrările apar aici grupate pe sesiune.
            </p>
          ) : (
            groupedHistory.map((group) => {
              const isOpen = expanded.has(group.id);
              const updated = new Date(group.updated_at).toLocaleDateString("ro-RO", {
                day: "numeric",
                month: "short",
              });
              return (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden rounded-xl border border-[#2d333b] bg-[#1a1d23]"
                >
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    className="flex w-full items-start gap-2 p-3 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <ChevronDown
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-[#64748b] transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                    <motion.div
                      initial={false}
                      animate={{ opacity: 1 }}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-xs font-bold text-white">{group.title}</p>
                      <p className="mt-0.5 text-[10px] text-[#94a3b8]">
                        {groupKindLabel(group.kind)} · {group.assets.length} fișier
                        {group.assets.length === 1 ? "" : "e"} · {updated}
                      </p>
                    </motion.div>
                  </button>
                  {isOpen && group.assets.length > 0 && (
                    <ul className="space-y-1 border-t border-[#2d333b] px-2 py-2">
                      {[...group.assets]
                        .sort(
                          (a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                        )
                        .map((asset) => {
                        const isLoading = loadingAssetId === asset.id;
                        const isSelected = selectedAssetId === asset.id;
                        return (
                          <li key={asset.id}>
                            <div
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[10px] transition-colors",
                                isSelected
                                  ? "bg-amber-500/10 ring-1 ring-amber-500/30"
                                  : "hover:bg-white/5",
                              )}
                            >
                              <button
                                type="button"
                                disabled={!onSelectAsset || isLoading}
                                onClick={() => onSelectAsset?.(group, asset)}
                                className="min-w-0 flex-1 text-left disabled:cursor-wait disabled:opacity-60"
                              >
                                <p className="truncate font-medium text-[#e6edf3]">{asset.file_name}</p>
                                <p className="text-[#64748b]">{sourceKindLabel(asset.source_kind)}</p>
                              </button>
                              <motion.div
                                initial={false}
                                animate={{ opacity: 1 }}
                                className="flex shrink-0 items-center gap-1"
                              >
                                {onSelectAsset && (
                                  <button
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => onSelectAsset(group, asset)}
                                    className="rounded-md border border-[#2d333b] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400 hover:border-amber-500/40 disabled:opacity-50"
                                  >
                                    {isLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Încarcă"
                                    )}
                                  </button>
                                )}
                                {asset.public_url && (
                                  <a
                                    href={asset.public_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded-md border border-[#2d333b] p-1 text-[#94a3b8] hover:border-amber-500/40 hover:text-amber-400"
                                    title="Deschide în tab nou"
                                    aria-label="Deschide în tab nou"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </motion.div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </motion.div>
              );
            })
          )
        ) : (
          legacyHistory.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-1 rounded-xl border border-[#2d333b] bg-[#1a1d23] p-3"
            >
              <p className="truncate text-xs font-bold">{item.fileName}</p>
              <motion.div
                initial={false}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between text-[10px] text-[#94a3b8]"
              >
                <span>{item.format}</span>
                <span>
                  {item.timestamp?.toDate
                    ? new Date(item.timestamp.toDate()).toLocaleDateString()
                    : "Recent"}
                </span>
              </motion.div>
            </motion.div>
          ))
        )}
      </motion.div>
    </motion.div>
  );
}
