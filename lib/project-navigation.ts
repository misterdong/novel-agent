export function currentProjectId() {
  return typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("projectId") ?? "";
}

export function projectHref(path: string, projectId: string | null | undefined) {
  return projectId ? `${path}?projectId=${encodeURIComponent(projectId)}` : path;
}

export function rememberProjectInUrl(projectId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("projectId", projectId);
  window.history.replaceState({}, "", url);
}
