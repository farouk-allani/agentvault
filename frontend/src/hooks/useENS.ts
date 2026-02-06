/**
 * React Hooks for ENS Integration
 *
 * Provides easy-to-use hooks for ENS resolution in React components.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  resolveENSOrAddress,
  loadENSConstraintProfile,
  loadENSProfile,
  isValidENSName,
  isValidAddress,
  isValidSuiAddress,
  type ENSResolutionResult,
  type ENSConstraintProfile,
  type ENSProfile,
} from '../services/ensService';

// ============================================================================
// USE ENS RESOLUTION HOOK
// ============================================================================

interface UseENSResolutionOptions {
  debounceMs?: number;
  autoResolve?: boolean;
}

interface UseENSResolutionReturn {
  result: ENSResolutionResult | null;
  isLoading: boolean;
  error: string | null;
  resolve: (input: string) => Promise<void>;
  clear: () => void;
}

/**
 * Hook for resolving ENS names or addresses
 * Supports debouncing for real-time input fields
 */
export function useENSResolution(
  input: string,
  options: UseENSResolutionOptions = {}
): UseENSResolutionReturn {
  const { debounceMs = 500, autoResolve = true } = options;

  const [result, setResult] = useState<ENSResolutionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async (value: string) => {
    if (!value || value.trim().length < 3) {
      setResult(null);
      setError(null);
      return;
    }

    const trimmed = value.trim();

    // SUI addresses: accept directly without ENS resolution
    if (isValidSuiAddress(trimmed)) {
      setResult({ success: true, address: trimmed, ensName: null, avatar: null, error: null });
      setError(null);
      setIsLoading(false);
      return;
    }

    // Skip if it's not a valid ENS name or address format
    if (!isValidENSName(trimmed) && !isValidAddress(trimmed)) {
      // But if it looks like a partial address or ENS name, don't show error yet
      if (trimmed.includes('.') || trimmed.startsWith('0x')) {
        setResult(null);
        setError(null);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const resolution = await resolveENSOrAddress(trimmed);
      setResult(resolution);
      if (!resolution.success && resolution.error) {
        setError(resolution.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  // Auto-resolve with debouncing
  useEffect(() => {
    if (!autoResolve) return;

    const timer = setTimeout(() => {
      if (input) {
        resolve(input);
      } else {
        clear();
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [input, debounceMs, autoResolve, resolve, clear]);

  return { result, isLoading, error, resolve, clear };
}

// ============================================================================
// USE ENS CONSTRAINT PROFILE HOOK
// ============================================================================

interface UseENSProfileReturn {
  profile: ENSConstraintProfile | null;
  isLoading: boolean;
  error: string | null;
  load: (ensName: string) => Promise<void>;
  clear: () => void;
}

/**
 * Hook for loading AgentVault constraint profiles from ENS
 */
export function useENSConstraintProfile(): UseENSProfileReturn {
  const [profile, setProfile] = useState<ENSConstraintProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ensName: string) => {
    if (!ensName || !isValidENSName(ensName)) {
      setError('Invalid ENS name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loadedProfile = await loadENSConstraintProfile(ensName);
      setProfile(loadedProfile);

      if (!loadedProfile.isValid) {
        setError('No valid constraint profile found in this ENS name');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setProfile(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { profile, isLoading, error, load, clear };
}

// ============================================================================
// USE ENS PROFILE HOOK (Full profile with avatar)
// ============================================================================

interface UseFullENSProfileReturn {
  profile: ENSProfile | null;
  isLoading: boolean;
  error: string | null;
  load: (ensName: string) => Promise<void>;
}

/**
 * Hook for loading full ENS profiles with avatar
 */
export function useFullENSProfile(): UseFullENSProfileReturn {
  const [profile, setProfile] = useState<ENSProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ensName: string) => {
    if (!ensName) return;

    setIsLoading(true);
    setError(null);

    try {
      const loadedProfile = await loadENSProfile(ensName);
      setProfile(loadedProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { profile, isLoading, error, load };
}

// ============================================================================
// USE ENS BATCH RESOLUTION HOOK
// ============================================================================

interface BatchResolutionResult {
  [address: string]: {
    ensName: string | null;
    avatar: string | null;
  };
}

/**
 * Hook for batch reverse resolution of multiple addresses
 * Useful for displaying ENS names in lists
 */
export function useENSBatchResolution(addresses: string[]): {
  results: BatchResolutionResult;
  isLoading: boolean;
} {
  const [results, setResults] = useState<BatchResolutionResult>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!addresses || addresses.length === 0) {
      setResults({});
      return;
    }

    const resolveAll = async () => {
      setIsLoading(true);
      const newResults: BatchResolutionResult = {};

      await Promise.all(
        addresses.map(async (address) => {
          if (!address || !isValidAddress(address)) return;

          try {
            const resolution = await resolveENSOrAddress(address);
            newResults[address] = {
              ensName: resolution.ensName,
              avatar: resolution.avatar,
            };
          } catch {
            newResults[address] = { ensName: null, avatar: null };
          }
        })
      );

      setResults(newResults);
      setIsLoading(false);
    };

    resolveAll();
  }, [addresses.join(',')]); // Dependency on serialized addresses

  return { results, isLoading };
}
