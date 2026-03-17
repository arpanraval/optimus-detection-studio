# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 37 security vulnerabilities identified in the March 2026 audit across injection, auth, XSS, crypto, and configuration categories.

**Architecture:** Direct code fixes across frontend components, edge functions, SQL migrations, and configuration files. No new architectural patterns — fixes follow existing codebase conventions.

**Tech Stack:** React 19 + TypeScript, Supabase Edge Functions (Deno), PostgreSQL, Vite

---

## Chunk 1: Injection & Input Validation Fixes

### Task 1: Add shared `escapeLike` utility and fix PostgREST LIKE injection (3 locations)

**Files:**
- Create: `src/lib/sanitize.ts`
- Modify: `src/hooks/useAuditLog.ts:139-142`
- Modify: `src/hooks/useDetectionPacks.ts:50-51`
- Modify: `src/components/SigmaConverter.tsx:161-162`

- [ ] **Step 1: Create shared sanitize utility**

```typescript
// src/lib/sanitize.ts
/** Escape PostgREST LIKE wildcards and structural characters for safe .or() usage */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

/** Escape commas/parens that PostgREST interprets as filter structure in .or() */
export function escapePostgrestFilter(s: string): string {
  return escapeLike(s).replace(/[,()]/g, '');
}
```

- [ ] **Step 2: Fix useAuditLog.ts:139-142**

Replace:
```typescript
if (filters.search) {
  query = query.or(
    `entity_name.ilike.%${filters.search}%,user_email.ilike.%${filters.search}%,action.ilike.%${filters.search}%`
  );
}
```
With:
```typescript
if (filters.search) {
  const esc = escapePostgrestFilter(filters.search);
  query = query.or(
    `entity_name.ilike.%${esc}%,user_email.ilike.%${esc}%,action.ilike.%${esc}%`
  );
}
```

- [ ] **Step 3: Fix useDetectionPacks.ts:50-51**

Replace:
```typescript
if (filters.search) {
  query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
}
```
With:
```typescript
if (filters.search) {
  const esc = escapePostgrestFilter(filters.search);
  query = query.or(`name.ilike.%${esc}%,description.ilike.%${esc}%`);
}
```

- [ ] **Step 4: Fix SigmaConverter.tsx:161-162**

Replace:
```typescript
if (query.trim()) {
    q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
}
```
With:
```typescript
if (query.trim()) {
    const esc = escapePostgrestFilter(query);
    q = q.or(`name.ilike.%${esc}%,description.ilike.%${esc}%`);
}
```

### Task 2: Validate UUID in UserManagementPage `.or()` call

**Files:**
- Modify: `src/components/UserManagementPage.tsx:294`

- [ ] **Step 1: Add UUID validation before `.or()` call**

Replace:
```typescript
await supabase.from('detection_reviews').delete().or(`reviewer_id.eq.${deleteModal.userId},requested_by.eq.${deleteModal.userId}`);
```
With:
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(deleteModal.userId)) throw new Error('Invalid user ID');
await supabase.from('detection_reviews').delete().or(`reviewer_id.eq.${deleteModal.userId},requested_by.eq.${deleteModal.userId}`);
```

### Task 3: Validate sortBy column in useDetectionPacks

**Files:**
- Modify: `src/hooks/useDetectionPacks.ts:65`

- [ ] **Step 1: Add runtime validation**

Replace:
```typescript
query = query.order(filters.sortBy, { ascending: filters.sortOrder === 'asc' });
```
With:
```typescript
const VALID_SORT_COLUMNS = ['name', 'rule_count', 'created_at', 'updated_at'] as const;
const safeSortBy = VALID_SORT_COLUMNS.includes(filters.sortBy as any) ? filters.sortBy : 'created_at';
query = query.order(safeSortBy, { ascending: filters.sortOrder === 'asc' });
```

---

## Chunk 2: XSS & Output Encoding Fixes

### Task 4: Remove CSP `unsafe-inline` — externalize FOUC script

**Files:**
- Create: `public/theme-init.js`
- Modify: `index.html:7-33`

- [ ] **Step 1: Create external theme init script**

```javascript
// public/theme-init.js
if (localStorage.theme === 'light') {
  document.documentElement.classList.remove('dark');
} else {
  document.documentElement.classList.add('dark');
}
```

- [ ] **Step 2: Update index.html CSP and script tags**

Replace the inline script (lines 26-33) with:
```html
<script src="/theme-init.js"></script>
```

Update CSP (lines 7-19) — remove `'unsafe-inline'` from script-src, keep `'unsafe-inline'` in style-src (required by Tailwind runtime styles):
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://aistudiocdn.com https://esm.sh https://cdn.jsdelivr.net blob:;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: https: blob:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://r.jina.ai https://api.github.com https://raw.githubusercontent.com https://cdn.jsdelivr.net https://files.pythonhosted.org https://pypi.org;
  worker-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
">
```

### Task 5: Remove vulnerable xlsx from importmap

**Files:**
- Modify: `index.html:50`

- [ ] **Step 1: Remove xlsx importmap entry**

Delete line 50:
```
    "xlsx": "https://aistudiocdn.com/xlsx@^0.18.5",
```

### Task 6: Fix unvalidated sourceUrl in href

**Files:**
- Modify: `src/components/threatintel/ThreatIntelReportPage.tsx:2489`

- [ ] **Step 1: Add protocol validation**

Replace:
```tsx
href={sourceUrl}
```
With:
```tsx
href={/^https?:\/\//i.test(sourceUrl) ? sourceUrl : '#'}
```

### Task 7: Fix AI-controlled navigation

**Files:**
- Modify: `src/components/AIAgentChat.tsx:325-329`

- [ ] **Step 1: Replace window.location.href with safe regex validation**

Replace:
```typescript
case 'navigate':
    // Navigate to internal routes only — block external URLs
    if (action.payload?.route && action.payload.route.startsWith('/')) {
        window.location.href = action.payload.route;
    }
    break;
```
With:
```typescript
case 'navigate':
    // Navigate to internal routes only — strict regex blocks protocol-relative URLs
    if (action.payload?.route && /^\/[a-zA-Z0-9]/.test(action.payload.route)) {
        window.location.href = action.payload.route;
    }
    break;
```

---

## Chunk 3: Authentication & Session Fixes

### Task 8: Fix password change to verify current password

**Files:**
- Modify: `src/components/AccountSettingsPage.tsx:137-177`

- [ ] **Step 1: Add current password verification before update**

Replace handleChangePassword (lines 137-177) with version that verifies currentPassword first via `supabase.auth.signInWithPassword()`, then calls `updateUser`.

### Task 9: Add /reset-password route

**Files:**
- Create: `src/components/ResetPasswordPage.tsx`
- Modify: `src/router/AppRouter.tsx` — add route before authenticated router

- [ ] **Step 1: Create ResetPasswordPage component**

Simple form that listens for `PASSWORD_RECOVERY` auth event, shows new password form, calls `supabase.auth.updateUser({ password })`.

- [ ] **Step 2: Add route in AppRouter.tsx**

In the `AppRouter` component (line 248+), before the `if (!router)` check that renders `AuthPage`, handle the `/reset-password` path.

### Task 10: Fix user deactivation — invalidate sessions + fix ban_duration

**Files:**
- Modify: `supabase/functions/manage-users/index.ts:485-488`

- [ ] **Step 1: Fix ban_duration and add session invalidation**

Replace:
```typescript
await supabaseAdmin.auth.admin.updateUserById(userId, {
  ban_duration: 'none'  // 'none' = permanent ban in Supabase
});
```
With:
```typescript
await supabaseAdmin.auth.admin.updateUserById(userId, {
  ban_duration: '876000h'  // ~100 years permanent ban
});
// Invalidate all existing sessions immediately
await supabaseAdmin.auth.admin.signOut(userId, 'global');
```

### Task 11: Fix invite action — check existing user's role before demotion

**Files:**
- Modify: `supabase/functions/manage-users/index.ts:205-210`

- [ ] **Step 1: Add role hierarchy check for existing users**

After `if (existingUser) {` (line 205), fetch existing profile role and verify caller has higher role before updating.

### Task 12: Align default role with VALID_ROLES

**Files:**
- Modify: `supabase/functions/manage-users/index.ts:12`

- [ ] **Step 1: Add 'user' to VALID_ROLES and ROLE_HIERARCHY**

```typescript
const VALID_ROLES = ['owner', 'admin', 'lead', 'analyst', 'viewer', 'user'];
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 5, admin: 4, lead: 3, analyst: 2, viewer: 1, user: 0,
};
```

---

## Chunk 4: Edge Function Hardening

### Task 13: Remove auth error details leakage (2 locations)

**Files:**
- Modify: `supabase/functions/ai-generate/index.ts:468`
- Modify: `supabase/functions/integration-ops/index.ts:2331`

- [ ] **Step 1: Strip details from 401 responses**

Replace `{ error: 'Unauthorized', details: authError?.message }` with `{ error: 'Unauthorized' }` in both files.

### Task 14: Add content size limit to threat-intel-digest-v2

**Files:**
- Modify: `supabase/functions/threat-intel-digest-v2/index.ts:140-145`

- [ ] **Step 1: Add size check after content validation**

After line 145, add:
```typescript
const MAX_CONTENT_SIZE = 500_000;
if (content && content.length > MAX_CONTENT_SIZE) {
  return new Response(
    JSON.stringify({ success: false, error: `Content exceeds maximum size (${MAX_CONTENT_SIZE} chars)` }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### Task 15: Add content size limit to threat-intel-digest v1

**Files:**
- Modify: `supabase/functions/threat-intel-digest/index.ts` — near content validation

### Task 16: Limit client-supplied promptTemplates

**Files:**
- Modify: `supabase/functions/threat-intel-digest-v2/index.ts:126-127`

- [ ] **Step 1: Validate and cap promptTemplates field lengths**

After extracting `promptTemplates` from body, add:
```typescript
const MAX_TEMPLATE_LEN = 5000;
if (promptTemplates) {
  for (const [key, val] of Object.entries(promptTemplates)) {
    if (typeof val === 'string' && val.length > MAX_TEMPLATE_LEN) {
      return new Response(
        JSON.stringify({ success: false, error: `promptTemplates.${key} exceeds maximum length` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
}
```

### Task 17: Fix SSRF in V1 fetchContent()

**Files:**
- Modify: `supabase/functions/threat-intel-digest/index.ts:954-1009`

- [ ] **Step 1: Add URL validation and safe redirect handling**

Import `validateUrl` from shared module. At top of `fetchContent()`, validate URL before any fetch. Replace `redirect: 'follow'` with `redirect: 'manual'` and manually validate redirect targets.

### Task 18: Block dangerous ports in URL validator

**Files:**
- Modify: `supabase/functions/_shared/url-validator.ts:188-194`

- [ ] **Step 1: Replace warn-only with block for dangerous ports**

Replace the warn-only logic with:
```typescript
const BLOCKED_PORTS = [22, 25, 53, 110, 143, 445, 1433, 1521, 3306, 5432, 5984, 6379, 8500, 9200, 27017];
if (BLOCKED_PORTS.includes(port)) {
  return { valid: false, error: `Port ${port} is not permitted`, sanitizedUrl: null };
}
```

---

## Chunk 5: File Handling Fixes

### Task 19: Add ZIP file size limit in upload UI

**Files:**
- Modify: `src/components/bulk-import/steps/SourceSelectionStep.tsx:155-158`

- [ ] **Step 1: Add size check before accepting ZIP**

```typescript
const MAX_ZIP_SIZE = 200 * 1024 * 1024; // 200MB
if (zip.size > MAX_ZIP_SIZE) {
  setError(`ZIP file too large (${(zip.size / 1024 / 1024).toFixed(0)}MB). Maximum is 200MB.`);
  return;
}
```

### Task 20: Fix ZIP bomb detection and path traversal in ZipFetcher

**Files:**
- Modify: `src/services/bulk-import/fetchers/ZipFetcher.ts:68-104`

- [ ] **Step 1: Add path sanitization and compression ratio check**

Before the main loop, add path sanitizer. In loop, add ratio check. Replace raw `path` with sanitized version.

---

## Chunk 6: Configuration & Misc Fixes

### Task 21: Add SSRF protection to dev proxy

**Files:**
- Modify: `vite.config.ts:47-48`

- [ ] **Step 1: Add private IP blocking**

After `const parsed = new URL(targetUrl);` add validation blocking private IPs (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, ::1, metadata endpoints).

### Task 22: Fix widget ID generation

**Files:**
- Modify: `src/components/dashboard/enterprise/WidgetCatalog.tsx:32`

- [ ] **Step 1: Replace Math.random() with crypto.randomUUID()**

Replace:
```typescript
const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
```
With:
```typescript
const id = `w-${crypto.randomUUID()}`;
```

### Task 23: Clean up legacy dev credentials migration

**Files:**
- Modify: `src/lib/integrationService.ts:45-73`

- [ ] **Step 1: Add retry and explicit error logging to scrub**

Replace fire-and-forget Promise.resolve with proper async/await with retry.

### Task 24: Remove backup.ts from edge function directory

**Files:**
- Delete: `supabase/functions/threat-intel-digest/backup.ts`

---
