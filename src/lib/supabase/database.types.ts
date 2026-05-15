export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      file_assets: {
        Row: {
          byte_size: number | null;
          created_at: string;
          file_name: string;
          format_id: string | null;
          group_id: string | null;
          id: string;
          metadata: Json;
          mime_type: string | null;
          public_url: string | null;
          source_kind: Database["public"]["Enums"]["file_source_kind"];
          storage_path: string | null;
          user_id: string;
        };
        Insert: {
          byte_size?: number | null;
          created_at?: string;
          file_name: string;
          format_id?: string | null;
          group_id?: string | null;
          id?: string;
          metadata?: Json;
          mime_type?: string | null;
          public_url?: string | null;
          source_kind: Database["public"]["Enums"]["file_source_kind"];
          storage_path?: string | null;
          user_id: string;
        };
        Update: {
          byte_size?: number | null;
          created_at?: string;
          file_name?: string;
          format_id?: string | null;
          group_id?: string | null;
          id?: string;
          metadata?: Json;
          mime_type?: string | null;
          public_url?: string | null;
          source_kind?: Database["public"]["Enums"]["file_source_kind"];
          storage_path?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "file_assets_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "file_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      file_groups: {
        Row: {
          created_at: string;
          format_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["file_group_kind"];
          source_file_name: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          format_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["file_group_kind"];
          source_file_name?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          format_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["file_group_kind"];
          source_file_name?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      file_group_kind: "session" | "project" | "exports";
      file_source_kind:
        | "upload"
        | "processed_preview"
        | "pdf_export"
        | "image_export"
        | "mockup"
        | "upscale"
        | "generative_fill"
        | "imposition";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type FileSourceKind = Database["public"]["Enums"]["file_source_kind"];
export type FileGroupKind = Database["public"]["Enums"]["file_group_kind"];
export type FileGroupRow = Database["public"]["Tables"]["file_groups"]["Row"];
export type FileAssetRow = Database["public"]["Tables"]["file_assets"]["Row"];
