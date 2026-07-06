export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Placeholder DB types — loopkit owns the `loopkit` schema in the shared
// Supabase project (schema-per-kit). Populate Tables/Views/Functions/Enums
// as the schema lands (see the `/supabase-migrate` skill); keep the schema
// key in sync with `db.schema` in src/lib/supabase/{client,server}.ts and
// src/lib/supabase/middleware.ts, or supabase-js queries degrade to `never`.
export interface Database {
  loopkit: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
