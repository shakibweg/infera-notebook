/**
 * Dynamic Model Router with Intelligent Fallback Chains, In-Memory Cooldown,
 * and Bounded Syntax-Based Task Classification.
 *
 * Configured based on Google AI Studio limits and documentation:
 * - Text/Chat Models: High-throughput free limits (up to 500 RPD on 3.5 & 3.1 Flash Lite)
 * - Deep Reasoning Models: Flagship Flash 3.8 / 3.6 for complex analysis & code
 * - Title Generation: High-volume Gemma 4 models (14,400 RPD / 30 RPM)
 * - Multi-speaker TTS Models: 10 RPD / 3 RPM per model, distributed across 4 models (40 RPD total)
 * - Gemini Live API Models: Low-latency bidirectional real-time audio interaction
 */

/**
 * Primary Core Gemini Models supporting native Tool Calling and JSON Schema
 */
export const GEMINI_CORE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

export type GeminiCoreModel = (typeof GEMINI_CORE_MODELS)[number];

/**
 * Fallback chain for general text generation & interactive chat.
 * Gemini Flash models are prioritized first, with high-capacity Gemma models at the very end as safety fallbacks.
 * Priority order:
 * 1. gemini-3.5-flash-lite (15 RPM / 250K TPM / 500 RPD) - High capacity default
 * 2. gemini-3.1-flash-lite (15 RPM / 250K TPM / 500 RPD) - High capacity secondary
 * 3. gemini-3.8-flash      (5 RPM  / 250K TPM / 20 RPD)  - Flagship Flash reasoning
 * 4. gemini-3.6-flash      (5 RPM  / 250K TPM / 20 RPD)  - Stable Flash
 * 5. gemini-2.5-flash      (5 RPM  / 250K TPM / 20 RPD)  - Legacy Flash fallback
 * 6. gemini-2.5-flash-lite (10 RPM / 250K TPM / 20 RPD)  - Legacy Flash-Lite fallback
 * 7. gemma-4-26b           (30 RPM / 16K TPM / 14.4K RPD) - High volume text safety net at the end
 * 8. gemma-4-31b           (30 RPM / 16K TPM / 14.4K RPD) - High volume secondary safety net at the end
 */
export const CHAT_ROUTER_MODELS = [
  ...GEMINI_CORE_MODELS,
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
] as const;

export type ChatRouterModel = (typeof CHAT_ROUTER_MODELS)[number];

/**
 * Fallback chain for Deep Reasoning & Synthesis tasks:
 * Code generation, debugging, stack traces, structured notes, briefings,
 * mindmaps, slide decks, podcasts, and complex analytical prompts.
 * Priority order:
 * 1. gemini-3.8-flash      - Flagship Flash reasoning engine
 * 2. gemini-3.6-flash      - High-performance stable Flash
 * 3. gemini-3.5-flash-lite - High-throughput fallback
 * 4. gemini-3.1-flash-lite - Secondary high-throughput fallback
 * 5. gemini-2.5-flash      - Proven multimodal reasoning fallback
 * 6. gemini-2.5-flash-lite - Final structured fallback
 */
export const REASONING_ROUTER_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

export type ReasoningRouterModel = (typeof REASONING_ROUTER_MODELS)[number];

/**
 * Fallback chain for lightweight title generation (chat titles and note titles).
 * Prioritizes high-volume Gemma models (14,400 RPD / 30 RPM) to conserve main Gemini quotas,
 * followed by the complete CHAT_ROUTER_MODELS fallback chain.
 * Priority order:
 * 1. gemma-4-26b           (30 RPM / 16K TPM / 14.4K RPD) - Ultra high quota title workhorse
 * 2. gemma-4-31b           (30 RPM / 16K TPM / 14.4K RPD) - Ultra high quota title secondary
 * 3. gemini-3.5-flash-lite (15 RPM / 250K TPM / 500 RPD)  - Chat router default
 * 4. gemini-3.1-flash-lite (15 RPM / 250K TPM / 500 RPD)  - Chat router secondary
 * 5. gemini-3.8-flash      (5 RPM  / 250K TPM / 20 RPD)   - Flagship Flash reasoning
 * 6. gemini-3.6-flash      (5 RPM  / 250K TPM / 20 RPD)   - Stable Flash
 * 7. gemini-2.5-flash      (5 RPM  / 250K TPM / 20 RPD)   - Legacy Flash fallback
 * 8. gemini-2.5-flash-lite (10 RPM / 250K TPM / 20 RPD)  - Legacy Flash-Lite fallback
 */
export const TITLE_ROUTER_MODELS = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  ...GEMINI_CORE_MODELS,
] as const;

export type TitleRouterModel = (typeof TITLE_ROUTER_MODELS)[number];

/**
 * Fallback chain for Multi-speaker Text-to-Speech (TTS) audio generation.
 * Each active model has 3 RPM / 10K TPM / 10 RPD in Google AI Studio.
 * By cascading through all 4 available models, total capacity is multiplied to 40 RPD.
 * Priority order:
 * 1. gemini-3.8-flash-tts      - Flagship creative studio-grade audio fidelity
 * 2. gemini-3.8-flash-lite-tts - High-volume, fast production audio
 * 3. gemini-3.1-flash-tts-preview - Proven legacy preview model
 * 4. gemini-2.5-flash-preview-tts - Legacy controllable TTS fallback
 */
export const TTS_ROUTER_MODELS = [
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
] as const;

export type TTSRouterModel = (typeof TTS_ROUTER_MODELS)[number];

/**
 * Fallback chain for Interactive Live Host (Gemini Live API WebSockets).
 * Priority order:
 * 1. gemini-3.8-live                   - Best default low-latency live audio model
 * 2. gemini-3.8-live-extended-thinking - High-reasoning Live API model
 * 3. gemini-3.1-flash-live-preview     - Legacy preview Live API model
 * 4. gemini-2.5-flash-native-audio-preview-12-2025 - Legacy native audio fallback
 */
export const LIVE_ROUTER_MODELS = [
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
] as const;

export type LiveRouterModel = (typeof LIVE_ROUTER_MODELS)[number];

/**
 * Fallback chain for Embeddings.
 * Prioritizes high-capability multimodal embedding model, followed by preview endpoint,
 * then stable high-dimensional text embeddings, and legacy text-embedding-004.
 *
 * All models in this router support MRL (Matryoshka Representation Learning)
 * with outputDimensionality configured to 768.
 *
 * Priority order:
 * 1. gemini-embedding-2         (100 RPM / 30K TPM / 1K RPD) - Multimodal embedding flagship
 * 2. gemini-embedding-2-preview (100 RPM / 30K TPM / 1K RPD) - Preview alias
 * 3. gemini-embedding-001       (100 RPM / 30K TPM / 1K RPD) - Stable high-dimensional vector model
 * 4. text-embedding-004         (100 RPM / 30K TPM / 1K RPD) - Battle-tested text embedding model
 */
export const EMBEDDING_ROUTER_MODELS = [
  'gemini-embedding-2',
  'gemini-embedding-2-preview',
  'gemini-embedding-001',
  'text-embedding-004',
] as const;

export type EmbeddingRouterModel = (typeof EMBEDDING_ROUTER_MODELS)[number];

// ============================================================================
// 1. BOUNDED SYNTAX-BASED TASK CLASSIFIER
// ============================================================================

/**
 * Bounded scan character window. Avoids regex slowdowns on huge documents.
 */
const MAX_SCAN_CHARS = 4000;

/**
 * Syntax markers that reliably indicate code or technical reasoning.
 * Matches concrete syntax structures rather than casual English words
 * to eliminate false positives.
 */
const CODE_SYNTAX_MARKERS: readonly RegExp[] = [
  // Fenced code block (with or without language tag)
  /```/,
  // Shell prompt followed by command
  /^[ \t]*\$[ \t]+[a-z][\w./-]*(?=[ \t]|$)/m,
  // Variable declarations (JS/TS)
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/,
  // Function definitions (JS/TS/Go/Rust)
  /\b(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(/,
  /\b(?:func|fn)\s+[A-Za-z_$][\w$]*\s*\(.*?\)/,
  // Python def / async def
  /^[ \t]*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/m,
  // Class declarations
  /^[ \t]*class\s+[A-Za-z_$][\w$]*\s*[({:]/m,
  /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+[A-Za-z_$][\w$]*/,
  // Module imports and requires
  /\bimport\s*\{/,
  /\bimport\s[^\n;]{0,200}?\bfrom\s*['"][^'"\n]+['"]/,
  /^[ \t]*from\s+[A-Za-z_.][\w.]*\s+import\s+\S/m,
  /\brequire\s*\(\s*['"]/,
  /^[ \t]*#\s*include\s*[<"]/m,
  // Source file paths with line numbers (e.g., router.ts:42, app.py:100)
  /\b[\w./-]+\.(?:[jt]sx?|mjs|cjs|py|rb|go|rs|java|kt|swift|php|cs|cpp|cc|hpp|sh|sql|css|scss|html|vue|svelte|ya?ml|json|toml)\s*:\s*\d+/,
  /\b[A-Za-z_][\w./-]*\.[ch]\s*:\s*\d+/,
  // Stack traces & error backtraces
  /^\s*at\s+\S.*\(.*:\d+:\d+\)/m,
  /^\s*File\s+"[^"\n]+",\s*line\s+\d+/m,
  /\bTraceback\s+\(most recent call last\)/,
  // SQL clauses
  /\b(?:SELECT\s+.*?\s+FROM|INSERT\s+INTO\s+.*?\s+VALUES|UPDATE\s+.*?\s+SET|DELETE\s+FROM)\b/i,
];

/**
 * Checks whether text contains unambiguous code or error stack syntax.
 */
export function isCodePrompt(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, MAX_SCAN_CHARS);
  return CODE_SYNTAX_MARKERS.some((regex) => regex.test(sample));
}

/**
 * Checks whether text demands deep analytical reasoning or code synthesis.
 */
export function isAnalyticalPrompt(text: string): boolean {
  if (!text) return false;
  if (isCodePrompt(text)) return true;

  const lower = text.slice(0, MAX_SCAN_CHARS).toLowerCase();
  const triggers = [
    'compare and contrast',
    'comprehensive analysis',
    'detailed breakdown',
    'deep dive',
    'step-by-step proof',
    'architectural review',
    'in-depth explanation',
    'synthesize the following',
    'study guide',
    'curriculum',
    'write an essay',
    'debug the following',
    'explain this error',
    'fix this bug',
    'find the issue in',
  ];
  return triggers.some((t) => lower.includes(t));
}

// ============================================================================
// 2. IN-MEMORY MODEL COOLDOWN & CIRCUIT BREAKER ENGINE
// ============================================================================

interface ModelCooldownRecord {
  cooldownUntil: number;
  consecutiveFailures: number;
  lastReason: string;
  lastFailedAt: number;
}

// Global in-memory cooldown cache per model across requests
const modelCooldownMap = new Map<string, ModelCooldownRecord>();

/**
 * Cooldown ladder (inspired by freellmapi rate limit recovery):
 * 1st rate limit: 60s
 * 2nd consecutive: 5m
 * 3rd+ consecutive: 15m
 */
const RATE_LIMIT_LADDER_MS = [60_000, 300_000, 900_000];
const SERVER_OVERLOAD_COOLDOWN_MS = 30_000; // 503 / 500 / Unavailable: 30s
const GENERAL_FAILURE_COOLDOWN_MS = 15_000; // 15s

/**
 * Record a successful model invocation to reset consecutive failure counters.
 */
export function recordModelSuccess(model: string): void {
  const existing = modelCooldownMap.get(model);
  if (existing) {
    modelCooldownMap.delete(model);
    console.log(`[Model Router] Model "${model}" recovered and cleared from cooldown.`);
  }
}

/**
 * Record a model failure and bench it on a temporary cooldown.
 */
export function recordModelFailure(model: string, error: unknown): void {
  const now = Date.now();
  const existing = modelCooldownMap.get(model);
  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;

  let cooldownMs = GENERAL_FAILURE_COOLDOWN_MS;
  let reason = 'transient_error';

  if (isRateLimitError(error)) {
    const ladderIndex = Math.min(consecutiveFailures - 1, RATE_LIMIT_LADDER_MS.length - 1);
    cooldownMs = RATE_LIMIT_LADDER_MS[ladderIndex];
    reason = 'rate_limit_exceeded';
  } else if (isServerOverloadError(error)) {
    cooldownMs = SERVER_OVERLOAD_COOLDOWN_MS;
    reason = 'server_overloaded';
  }

  const cooldownUntil = now + cooldownMs;
  modelCooldownMap.set(model, {
    cooldownUntil,
    consecutiveFailures,
    lastReason: reason,
    lastFailedAt: now,
  });

  const durationSec = Math.round(cooldownMs / 1000);
  console.warn(
    `[Model Router] Model "${model}" failed (${reason}). Benched for ${durationSec}s (streak: ${consecutiveFailures}).`
  );
}

/**
 * Checks whether a model is currently resting in cooldown.
 */
export function isModelOnCooldown(model: string): boolean {
  const record = modelCooldownMap.get(model);
  if (!record) return false;
  if (Date.now() >= record.cooldownUntil) {
    modelCooldownMap.delete(model);
    return false;
  }
  return true;
}

/**
 * Returns remaining cooldown in milliseconds (0 if healthy).
 */
export function getModelCooldownRemainingMs(model: string): number {
  const record = modelCooldownMap.get(model);
  if (!record) return 0;
  const remaining = record.cooldownUntil - Date.now();
  if (remaining <= 0) {
    modelCooldownMap.delete(model);
    return 0;
  }
  return remaining;
}

/**
 * Re-orders a model fallback chain so healthy models are attempted first,
 * with benched models placed at the end sorted by soonest cooldown recovery.
 */
export function orderChainByHealth(chain: readonly string[]): string[] {
  const healthy: string[] = [];
  const onCooldown: { model: string; remainingMs: number }[] = [];

  for (const model of chain) {
    const remainingMs = getModelCooldownRemainingMs(model);
    if (remainingMs > 0) {
      onCooldown.push({ model, remainingMs });
    } else {
      healthy.push(model);
    }
  }

  // Sort benched models by soonest expiry
  onCooldown.sort((a, b) => a.remainingMs - b.remainingMs);

  return [...healthy, ...onCooldown.map((item) => item.model)];
}

/**
 * Reset all model cooldowns (useful for tests or diagnostics).
 */
export function clearAllCooldowns(): void {
  modelCooldownMap.clear();
}

// ============================================================================
// 3. ERROR CLASSIFIER
// ============================================================================

/**
 * Determine if an error is an AbortError from client cancellation.
 */
export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
  ) {
    return true;
  }
  return false;
}

/**
 * Determine if an error is an authentication / invalid API key failure.
 * Non-retryable: all models sharing this key will fail identically.
 */
export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = typeof (err as any)?.status === 'number' ? (err as any).status : 0;
  return (
    status === 401 ||
    msg.includes('401') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key') ||
    msg.includes('unauthenticated')
  );
}

/**
 * Determine if an error is a Rate Limit or Quota Exhaustion (429 / RESOURCE_EXHAUSTED).
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = typeof (err as any)?.status === 'number' ? (err as any).status : 0;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  );
}

/**
 * Determine if an upstream server is temporarily overloaded or unavailable (503 / 500 / 504).
 */
export function isServerOverloadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = typeof (err as any)?.status === 'number' ? (err as any).status : 0;
  return (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

/**
 * Determine if an error is retryable by failing over to another model in the chain.
 */
export function isRetryableModelError(err: unknown): boolean {
  if (!err) return false;
  if (isAbortError(err) || isAuthError(err)) return false;
  return isRateLimitError(err) || isServerOverloadError(err);
}

// ============================================================================
// 4. SMART RESOLUTION
// ============================================================================

export interface SmartRoutingContext {
  task?: 'title' | 'complex' | 'chat' | 'structured_note';
  hasTools?: boolean;
  requiresJson?: boolean;
  messageLength?: number;
  content?: string;
  prioritizeHealthy?: boolean;
}

/**
 * Smart Task-Aware Model Selector with Cooldown Prioritization
 * Dynamically resolves the optimal model sequence based on:
 * - Specific task type (title vs complex reasoning vs structured notes vs everyday chat)
 * - Presence of tools or JSON schema constraints (automatically filters out Gemma for native tools)
 * - Message syntax (bounded scan detecting code, definitions, and stack traces)
 * - Active model cooldowns (healthy models prioritized first to eliminate 429 hanging latency)
 */
export function resolveModelChain(context: SmartRoutingContext = {}): readonly string[] {
  let baseChain: readonly string[];

  // 1. Tool execution or JSON Schema requires Gemini native engine
  if (context.hasTools || context.requiresJson) {
    if (context.task === 'complex' || context.task === 'structured_note') {
      baseChain = REASONING_ROUTER_MODELS;
    } else {
      baseChain = GEMINI_CORE_MODELS;
    }
  } else if (context.task === 'title') {
    // 2. Lightweight titling tasks: Gemma models first (14,400 RPD)
    baseChain = TITLE_ROUTER_MODELS;
  } else if (
    context.task === 'complex' ||
    context.task === 'structured_note' ||
    (context.messageLength && context.messageLength > 2000) ||
    (context.content && isAnalyticalPrompt(context.content))
  ) {
    // 3. Deep analytical prompts / code / complex study tasks: Reasoning models first
    baseChain = REASONING_ROUTER_MODELS;
  } else {
    // 4. Default standard chat: high speed Gemini Flash models first, Gemma at the very end
    baseChain = CHAT_ROUTER_MODELS;
  }

  // 5. Prioritize healthy models over ones currently on cooldown
  if (context.prioritizeHealthy !== false) {
    return orderChainByHealth(baseChain);
  }

  return baseChain;
}

/**
 * Check if a model belongs to the Gemini 3 or newer family
 * (used for conditional feature flags like thinkingConfig)
 */
export function isGemini3OrNewer(model: string): boolean {
  return model.startsWith('gemini-3') || model.startsWith('gemini-4');
}
