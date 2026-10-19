import { useState, useEffect, useMemo } from 'react';

/**
 * Hook to resolve S3 paths into signed URLs on-demand.
 * Supports both single path and multiple paths.
 */
export function useSignedUrls(paths: string | string[], expiresIn: number = 3600) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stabilize the dependency using a primitive string key
  const pathsKey = useMemo(() => {
    const p = Array.isArray(paths) ? paths.filter(Boolean) : [paths].filter(Boolean);
    return p.sort().join('|');
  }, [paths]);

  // Internal memoized paths for the fetch logic
  const memoizedPaths = useMemo(() => {
    return pathsKey ? pathsKey.split('|') : [];
  }, [pathsKey]);

  useEffect(() => {
    if (memoizedPaths.length === 0) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchUrls = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch signed URLs via PATCH batch endpoint
        const response = await fetch('/api/s3/signed-url', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: memoizedPaths, expiresIn }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch signed URLs');
        }

        const data = await response.json();
        const urlMap: Record<string, string> = {};

        if (data.urls && Array.isArray(data.urls)) {
          data.urls.forEach((item: { path: string; signedUrl: string }) => {
            urlMap[item.path] = item.signedUrl;
          });
        } else if (data.signedUrl && !Array.isArray(paths)) {
          urlMap[paths as string] = data.signedUrl;
        }

        setUrls(urlMap);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useSignedUrls ERROR]', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchUrls();

    return () => controller.abort();
  }, [pathsKey, expiresIn, memoizedPaths]);

  const getUrl = (path: string) => urls[path] || '';

  return { urls, getUrl, loading, error };
}
