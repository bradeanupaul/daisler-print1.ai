import { getSupabase, isSupabaseConfigured } from "../lib/supabase/client";
import type { FileAssetRow, FileGroupRow, FileSourceKind, Json } from "../lib/supabase/database.types";

export type FileHistoryAsset = FileAssetRow;
export type FileHistoryGroup = FileGroupRow & { assets: FileHistoryAsset[] };

const BUCKET = "print-files";

function sessionTitle(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "") || fileName;
  const d = new Date();
  const date = d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
  return `${base} · ${date}`;
}

function extFromMime(mime: string, fallback = "bin"): string {
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  return fallback;
}

export async function fetchGroupedFileHistory(userId: string): Promise<FileHistoryGroup[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: groups, error: gErr } = await sb
    .from("file_groups")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (gErr) {
    console.warn("file_groups fetch:", gErr.message, gErr);
    throw new Error(gErr.message);
  }
  if (!groups?.length) return [];

  const groupIds = groups.map((g) => g.id);
  const { data: assets, error: aErr } = await sb
    .from("file_assets")
    .select("*")
    .eq("user_id", userId)
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });

  if (aErr) {
    console.warn("file_assets fetch:", aErr.message);
    return groups.map((g) => ({ ...g, assets: [] }));
  }

  const byGroup = new Map<string, FileHistoryAsset[]>();
  for (const a of assets ?? []) {
    if (!a.group_id) continue;
    const list = byGroup.get(a.group_id) ?? [];
    list.push(a);
    byGroup.set(a.group_id, list);
  }

  return groups.map((g) => ({
    ...g,
    assets: byGroup.get(g.id) ?? [],
  }));
}

export async function createSessionGroup(
  userId: string,
  fileName: string,
  formatId: string,
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("file_groups")
    .insert({
      user_id: userId,
      title: sessionTitle(fileName),
      kind: "session",
      source_file_name: fileName,
      format_id: formatId,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("createSessionGroup:", error.message, error);
    throw new Error(error.message);
  }
  return data.id;
}

/** URL proaspăt semnat pentru încărcare în workspace (public_url poate expira). */
export async function getAssetDownloadUrl(
  asset: Pick<FileHistoryAsset, "storage_path" | "public_url">,
): Promise<string> {
  const sb = getSupabase();
  if (sb && asset.storage_path) {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(asset.storage_path, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  if (asset.public_url) return asset.public_url;
  throw new Error("URL indisponibil pentru acest fișier.");
}

async function touchGroup(groupId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("file_groups").update({ updated_at: new Date().toISOString() }).eq("id", groupId);
}

export async function registerFileAsset(params: {
  userId: string;
  groupId: string | null;
  fileName: string;
  sourceKind: FileSourceKind;
  formatId?: string;
  blob: Blob;
  metadata?: Record<string, unknown>;
}): Promise<FileHistoryAsset | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const assetId = crypto.randomUUID();
  const mime = params.blob.type || "application/octet-stream";
  const ext = extFromMime(mime, params.fileName.split(".").pop() ?? "bin");
  const storagePath = `${params.userId}/${params.groupId ?? "ungrouped"}/${assetId}.${ext}`;

  const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, params.blob, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    console.warn("storage upload:", upErr.message, upErr);
    throw new Error(upErr.message);
  }

  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  const { data, error } = await sb
    .from("file_assets")
    .insert({
      id: assetId,
      user_id: params.userId,
      group_id: params.groupId,
      file_name: params.fileName,
      storage_path: storagePath,
      public_url: signed?.signedUrl ?? null,
      source_kind: params.sourceKind,
      mime_type: mime,
      byte_size: params.blob.size,
      format_id: params.formatId ?? null,
      metadata: (params.metadata ?? {}) as Json,
    })
    .select("*")
    .single();

  if (error) {
    console.warn("file_assets insert:", error.message, error);
    throw new Error(error.message);
  }

  if (params.groupId) await touchGroup(params.groupId);
  return data;
}

export async function registerUpload(
  userId: string,
  file: File,
  formatId: string,
): Promise<{ groupId: string | null; asset: FileHistoryAsset | null }> {
  if (!isSupabaseConfigured()) return { groupId: null, asset: null };

  const groupId = await createSessionGroup(userId, file.name, formatId);
  const asset = await registerFileAsset({
    userId,
    groupId,
    fileName: file.name,
    sourceKind: "upload",
    formatId,
    blob: file,
  });
  return { groupId, asset };
}

export async function registerBlobExport(
  userId: string,
  groupId: string | null,
  fileName: string,
  sourceKind: FileSourceKind,
  blob: Blob,
  formatId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!isSupabaseConfigured() || !groupId) return;
  await registerFileAsset({
    userId,
    groupId,
    fileName,
    sourceKind,
    formatId,
    blob,
    metadata,
  });
}

/** Salvează o previzualizare procesată (data URL / blob URL / https) în grupul de sesiune. */
export async function registerProcessedImageFromUrl(
  userId: string,
  groupId: string,
  imageUrl: string,
  sourceKind: "upscale" | "generative_fill" | "processed_preview",
  fileName: string,
  formatId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error("Nu s-a putut citi imaginea procesată.");
  const blob = await res.blob();
  await registerFileAsset({
    userId,
    groupId,
    fileName,
    sourceKind,
    formatId,
    blob,
    metadata,
  });
}

export function sourceKindLabel(kind: FileSourceKind): string {
  const labels: Record<FileSourceKind, string> = {
    upload: "Încărcare",
    processed_preview: "Previzualizare",
    pdf_export: "PDF tipăribil",
    image_export: "Imagine",
    mockup: "Mockup",
    upscale: "Upscale AI",
    generative_fill: "Bleed AI",
    imposition: "Imposiție",
  };
  return labels[kind] ?? kind;
}

export function groupKindLabel(kind: FileHistoryGroup["kind"]): string {
  const labels = { session: "Lucrare", project: "Proiect", exports: "Exporturi" };
  return labels[kind] ?? kind;
}
