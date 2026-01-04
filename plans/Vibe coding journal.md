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
