/**
 * useModelProbe
 *
 * Probes a list of provider/model pairs for real availability by sending a
 * minimal prompt and polling the session messages API for success or error.
 *
 * Results are cached in localStorage (key: opencode.modelProbe.v1) with a
 * configurable TTL (default 24 h) so the probe only re-runs on the first load
 * each day, or when the model list changes.
 */

import { ref } from 'vue';
import * as opencodeApi from '../utils/opencode';

// ── Types ─────────────────────────────────────────────────────────────────

export type ModelProbeEntry = {
  providerID: string;
  modelID: string;
};

type ProbeCache = {
  timestamp: number;
  modelHash: string;
  available: string[]; // providerID/modelID keys
};

// ── Constants ─────────────────────────────────────────────────────────────

const CACHE_KEY = 'opencode.modelProbe.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Polling interval for checking message results (ms).
const POLL_INTERVAL_MS = 300;

// Maximum time to wait for a probe result before assuming available (fail-open).
// Failures arrive in ~500ms, successes in ~3-5s. 10s gives ample headroom.
const PROBE_TIMEOUT_MS = 10_000;

// How many models to probe in parallel. High parallelism risks rate-limiting.
const PROBE_CONCURRENCY = 3;

// ── Helpers ───────────────────────────────────────────────────────────────

function modelKey(providerID: string, modelID: string) {
  return `${providerID}/${modelID}`;
}

function hashModels(models: ModelProbeEntry[]) {
  return models
    .map((m) => modelKey(m.providerID, m.modelID))
    .sort()
    .join('|');
}

function loadCache(): ProbeCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const c = parsed as Record<string, unknown>;
    if (
      typeof c.timestamp !== 'number' ||
      typeof c.modelHash !== 'string' ||
      !Array.isArray(c.available)
    )
      return null;
    return c as unknown as ProbeCache;
  } catch {
    return null;
  }
}

function saveCache(cache: ProbeCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage may be unavailable — silently ignore
  }
}

/** Sleep for `ms` milliseconds. */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Probe a single model by:
 *  1. Creating a temporary session
 *  2. Sending a 1-word prompt via prompt_async
 *  3. Polling GET /session/{id}/message every POLL_INTERVAL_MS
 *  4. Resolving:
 *     - false (unavailable): assistant message has info.error set
 *     - true  (available):   assistant message has parts (step-start/text) or info.finish
 *     - true  (timeout):     assume available after PROBE_TIMEOUT_MS (fail-open)
 *  5. Aborting & deleting the session
 *
 * Failure pattern: assistant message info.error contains
 * { name: 'APIError', data: { message: 'The requested model is not supported.', statusCode: 400 } }
 * Parts array is empty. Arrives in ~500ms.
 *
 * Success pattern: assistant message has parts with type 'step-start' or 'text',
 * and eventually info.finish is set. Arrives in ~3-5s.
 */
async function probeModel(entry: ModelProbeEntry): Promise<boolean> {
  // 1. Create a temporary session
  let sessionID: string | undefined;
  try {
    const result = (await opencodeApi.createSession()) as Record<string, unknown>;
    sessionID = typeof result.id === 'string' ? result.id : undefined;
    if (!sessionID) return false;
  } catch {
    return false;
  }

  const sid = sessionID;
  let available = false;

  try {
    // 2. Send a minimal prompt
    try {
      await opencodeApi.sendPromptAsync(sid, {
        directory: '',
        agent: 'build',
        model: { providerID: entry.providerID, modelID: entry.modelID },
        parts: [{ type: 'text', text: 'hi' }],
      });
    } catch {
      // Synchronous failure — model not accepted
      return false;
    }

    // 3. Poll for result
    // Each message from the REST API has shape: { info: { role, error?, finish?, ... }, parts: [...] }
    const deadline = Date.now() + PROBE_TIMEOUT_MS;
    let decided = false;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      let messages: unknown;
      try {
        messages = await opencodeApi.listSessionMessages(sid);
      } catch {
        // Network error — retry next poll
        continue;
      }

      // messages is an array of message objects
      if (!Array.isArray(messages)) continue;

      // Find the assistant message (role is inside `info`)
      const assistantMsg = messages.find(
        (m: any) => m?.info?.role === 'assistant',
      ) as Record<string, unknown> | undefined;

      if (!assistantMsg) continue;

      const info = assistantMsg.info as Record<string, unknown> | undefined;
      const parts = assistantMsg.parts as Array<Record<string, unknown>> | undefined;

      if (!info) continue;

      // Check for error (arrives ~500ms for unavailable models)
      if (info.error) {
        available = false;
        decided = true;
        break;
      }

      // Check for success: parts with step-start or text
      if (Array.isArray(parts) && parts.length > 0) {
        const hasContent = parts.some(
          (p) => p.type === 'step-start' || p.type === 'text' || p.type === 'step-finish',
        );
        if (hasContent) {
          available = true;
          decided = true;
          break;
        }
      }

      // Check for finish
      if (info.finish) {
        available = true;
        decided = true;
        break;
      }
    }

    // If we never got a definitive answer, assume available (fail-open).
    // Better to show a slow model than silently hide a working one.
    if (!decided) {
      available = true;
    }
  } finally {
    // 5. Clean up: abort then delete
    try {
      await opencodeApi.abortSession(sid);
    } catch {
      // ignore
    }
    try {
      await opencodeApi.deleteSession(sid);
    } catch {
      // ignore
    }
  }

  return available;
}

/**
 * Run probes in batches of PROBE_CONCURRENCY.
 */
async function probeAll(
  models: ModelProbeEntry[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Set<string>> {
  const available = new Set<string>();
  let completed = 0;

  for (let i = 0; i < models.length; i += PROBE_CONCURRENCY) {
    const batch = models.slice(i, i + PROBE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((entry) => probeModel(entry)),
    );
    batch.forEach((entry, idx) => {
      if (results[idx]) available.add(modelKey(entry.providerID, entry.modelID));
      completed++;
      onProgress?.(completed, models.length);
    });
  }

  return available;
}

// ── Composable ────────────────────────────────────────────────────────────

export function useModelProbe() {
  const isProbing = ref(false);
  const probeProgress = ref<{ completed: number; total: number } | null>(null);
  /** Set of `providerID/modelID` keys that are confirmed available. Null = not yet probed. */
  const availableModels = ref<Set<string> | null>(null);

  /**
   * Check cache validity and run probes if needed.
   * @param models       Full list of models to probe
   * @param forceFresh   Skip cache and re-probe
   */
  async function probe(
    models: ModelProbeEntry[],
    forceFresh = false,
  ): Promise<Set<string>> {
    const hash = hashModels(models);

    // Check cache
    if (!forceFresh) {
      const cached = loadCache();
      if (
        cached &&
        cached.modelHash === hash &&
        Date.now() - cached.timestamp < CACHE_TTL_MS
      ) {
        const set = new Set(cached.available);
        availableModels.value = set;
        console.log('[ModelProbe] Using cached results:', set.size, 'available models');
        return set;
      }
    }

    // Run probes
    isProbing.value = true;
    probeProgress.value = { completed: 0, total: models.length };
    console.log('[ModelProbe] Starting probes for', models.length, 'models');
    try {
      const set = await probeAll(models, (done, total) => {
        probeProgress.value = { completed: done, total };
        console.log(`[ModelProbe] Progress: ${done}/${total}`);
      });
      availableModels.value = set;
      saveCache({ timestamp: Date.now(), modelHash: hash, available: [...set] });
      console.log('[ModelProbe] Done. Available:', set.size, '/', models.length);
      return set;
    } finally {
      isProbing.value = false;
      probeProgress.value = null;
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
    availableModels.value = null;
  }

  return { isProbing, probeProgress, availableModels, probe, clearCache };
}
