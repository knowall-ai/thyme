'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { bcClient } from '@/services/bc/bcClient';
import { buildUOMConversionMap, type UOMConversionMap } from '@/utils';

/**
 * Units of measure for a Plan modal that writes quantities back to BC.
 *
 * Uses the plan store's cached map when it has one, otherwise fetches strictly:
 * `uomReady` is false until a map is available, and if the fetch fails `uomLoadFailed`
 * is set; modals block saving (and loading existing lines) until it's ready —
 * an empty map would silently treat DAY-based resources' hours as days (#249).
 */
const EMPTY_UOM_MAP: UOMConversionMap = new Map();

// Fetch strictly; resolves to the map, or null if it couldn't be loaded
async function fetchUomMap(): Promise<UOMConversionMap | null> {
  try {
    return buildUOMConversionMap(await bcClient.getResourceUnitsOfMeasure({ strict: true }));
  } catch (error) {
    console.error('Failed to load resource units of measure', error);
    toast.error('Failed to load resource units of measure');
    return null;
  }
}

export function useSaveSafeUomMap(isOpen: boolean, cachedUomMap: UOMConversionMap) {
  const [fetchedMap, setFetchedMap] = useState<UOMConversionMap | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const usingCache = cachedUomMap.size > 0;

  const applyResult = useCallback((map: UOMConversionMap | null) => {
    setFetchedMap(map);
    setFetchFailed(map === null);
  }, []);

  useEffect(() => {
    if (!isOpen || usingCache) return;
    let cancelled = false;
    fetchUomMap().then((map) => {
      if (!cancelled) applyResult(map);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, usingCache, applyResult]);

  const retryUomLoad = useCallback(() => {
    fetchUomMap().then(applyResult);
  }, [applyResult]);

  return {
    uomMap: usingCache ? cachedUomMap : (fetchedMap ?? EMPTY_UOM_MAP),
    uomLoadFailed: !usingCache && fetchFailed,
    // Ready once a usable map exists (cached or fetched): until then existing quantities
    // can't be converted for display and nothing can be saved
    uomReady: usingCache || fetchedMap !== null,
    retryUomLoad,
  };
}
