'use client';

import { useState, useEffect } from 'react';

/**
 * Global cache to store presigned URLs by their S3 path.
 * Helps avoid redundant API calls for the same image in the same session.
 */
const urlCache = new Map<string, { url: string; expiry: number }>();

/**
 * Store for active promises to dedup concurrent requests for the same path.
 */
const inflightRequests = new Map<string, Promise<string>>();

/**
 * Hook to resolve an S3 path (object key) into a usable presigned URL.
 * Includes global caching and concurrent request deduplication.
 *
 * @param path - The S3 path (key) stored in the user's image field.
 * @returns { url: string | null; isLoading: boolean; error: Error | null }
 */
export function usePresignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // If no path or path is already a full URL (legacy), return it directly
    if (!path) {
      setUrl(null);
      return;
    }

    if (path.startsWith('http')) {
      setUrl(path);
      return;
    }

    // Check cache first
    const cached = urlCache.get(path);
    if (cached && cached.expiry > Date.now()) {
      setUrl(cached.url);
      return;
    }

    // Fetch new presigned URL with deduplication
    const fetchPresignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      // 1. Check if a request for this path is already in flight
      const inflight = inflightRequests.get(path);
      if (inflight) {
        try {
          const result = await inflight;
          setUrl(result);
          return;
        } catch (err) {
          // If the inflight request failed, we'll try again below
        }
      }

      // 2. Start a new request and track its promise
      const requestPromise = (async () => {
        try {
          const response = await fetch(`/api/s3/signed-url?path=${encodeURIComponent(path)}`);

          if (!response.ok) {
            throw new Error('Failed to fetch signed URL');
          }

          const data = await response.json();

          if (data.signedUrl) {
            // Cache successful results (default 50 minutes to be safe against 1h expiry)
            urlCache.set(path, {
              url: data.signedUrl,
              expiry: Date.now() + 50 * 60 * 1000,
            });
            return data.signedUrl;
          } else {
            throw new Error('Response did not contain signedUrl');
          }
        } finally {
          // Clean up inflight tracking once finished (success or fail)
          inflightRequests.delete(path);
        }
      })();

      inflightRequests.set(path, requestPromise);

      try {
        const result = await requestPromise;
        setUrl(result);
      } catch (err) {
        console.error('Error in usePresignedUrl:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPresignedUrl();
  }, [path]);

  return { url, isLoading, error };
}
