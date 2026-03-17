-- ============================================================
-- 01_extensions.sql - Required PostgreSQL extensions
-- Run first on a fresh Supabase project
-- ============================================================
-- Note: Some extensions (plpgsql, uuid-ossp, pgcrypto, pg_graphql,
-- pg_stat_statements, supabase_vault) may already be enabled on
-- Supabase projects. These CREATE statements are idempotent.
-- ============================================================

-- UUID generation (used for default IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- Cryptographic functions (used for encryption)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- Trigram similarity (used for fuzzy text search)
CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA public;

-- Vector similarity search (used for AI embeddings)
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA extensions;

-- GraphQL support (Supabase built-in)
CREATE EXTENSION IF NOT EXISTS "pg_graphql" SCHEMA graphql;

-- Query statistics tracking
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" SCHEMA extensions;
