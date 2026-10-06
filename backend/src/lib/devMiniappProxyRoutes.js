export function isBackendRoute(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/k" ||
    pathname.startsWith("/k/") ||
    pathname === "/open-key"
  );
}
