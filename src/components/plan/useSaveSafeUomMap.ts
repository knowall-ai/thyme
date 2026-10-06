'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Identifies the current opening; initial loads and retries only apply results for it,
  // so a request still in flight when the modal closes can't mark a later opening ready
  const openingRef = useRef(0);

  // Only a non-empty map is usable: an empty one would make every conversion an identity
  const applyResult = useCallback((map: UOMConversionMap | null, opening: number) => {
    if (opening !== openingRef.current) return;
    const usableMap = map && map.size > 0 ? map : null;
    setFetchedMap(usableMap);
    setFetchFailed(usableMap === null);
  }, []);

  useEffect(() => {
    if (!isOpen || usingCache) return;
    const opening = ++openingRef.current;
    fetchUomMap().then((map) => applyResult(map, opening));
    return () => {
      // End this opening: in-flight initial and retry requests no longer apply, and the
      // next opening isn't treated as ready (able to save) with this opening's map
      openingRef.current += 1;
      setFetchedMap(null);
      setFetchFailed(false);
    };
  }, [isOpen, usingCache, applyResult]);

  const retryUomLoad = useCallback(() => {
    const opening = openingRef.current;
    fetchUomMap().then((map) => applyResult(map, opening));
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
