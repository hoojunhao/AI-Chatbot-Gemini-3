# Vibe Coding Journal

## 2026-01-04

### Issue: URL Hash Residue after Login
**Problem**: After signing in with Google via Supabase, the browser URL contained a hash fragment (e.g., `/#` or `/#access_token=...`) which looked unclean.

**Solution**: 
Modified `contexts/AuthContext.tsx` to listen for auth state changes. When a session is established and a hash exists, we use the History API to silently replace the current URL with the clean pathname, removing the hash without triggering a reload.

```typescript
// contexts/AuthContext.tsx
if (session && window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
}
```

### Issue: URL Hash Persistence After Google OAuth (RESOLVED)
**Problem**: After signing in with Google via Supabase OAuth, a trailing `#` remained in the URL (`http://localhost:3000/#`), making it look unclean.

**Root Cause**: 
1. `window.location.hash` returns empty string `""` when URL ends with just `#`
2. Multiple attempted solutions created race conditions with Supabase's token processing
3. Earlier approaches either:
   - Removed tokens before Supabase could read them (broke login)
   - Used continuous polling (performance issue, 1000+ console logs)
   - Didn't check for the actual trailing `#` character

**Final Solution**:
Check `window.location.href.endsWith('#')` instead of just `window.location.hash`, with a single delayed cleanup:

```typescript
// contexts/AuthContext.tsx
useEffect(() => {
    const cleanupHash = () => {
        const hash = window.location.hash;
        const hasTrailingHash = window.location.href.endsWith('#');
        
        // Remove trailing # or non-auth hashes
        if (hasTrailingHash && !hash) {
            window.history.replaceState(null, '', window.location.href.slice(0, -1));
        } else if (hash && !hash.includes('access_token') && !hash.includes('refresh_token')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    };

    // Run cleanup 500ms after session changes
    const timeoutId = setTimeout(cleanupHash, 500);
    return () => clearTimeout(timeoutId);
}, [session]);
```

**Key insights:**
- Use `href.endsWith('#')` to detect trailing hash (not `hash` property)
- Delay cleanup by 500ms to let Supabase process tokens first
- Run only on session changes (not continuous polling)
- Preserve `access_token` and `refresh_token` hashes during OAuth flow

**Result**: Clean URL after Google OAuth login, no performance impact, login works correctly.

