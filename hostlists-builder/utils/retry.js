/* eslint-disable */

/**
 * Network error codes/signals that are worth retrying. Such errors are often
 * transient (e.g. a source host being briefly unreachable from a CI runner)
 * and a subsequent attempt succeeds.
 */
const TRANSIENT_ERROR_SIGNALS = [
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ECONNABORTED',
  'ESOCKETTIMEDOUT',
  'socket hang up',
];

/**
 * Delays (ms) between retry attempts. The number of entries defines how many
 * retries happen after the first attempt.
 */
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000];

/**
 * Checks whether the given error looks transient enough to be retried.
 *
 * @param {unknown} error - Error thrown by the operation.
 *
 * @returns {boolean} - True if the error is likely transient.
 */
const isTransientError = (error) => {
  if (!error) {
    return false;
  }

  // The filters-downloader wraps the original axios error in
  // `new Error("Failed to request url '...'", { cause })`, so inspect both the
  // wrapper and its cause.
  const parts = [
    error.code,
    error.message,
    error.cause?.code,
    error.cause?.message,
  ]
    .filter((part) => typeof part === 'string')
    .join('\n');

  if (TRANSIENT_ERROR_SIGNALS.some((signal) => parts.includes(signal))) {
    return true;
  }

  // The downloader surfaces non-200 responses as
  // "Response status for url ... is invalid: <status>". Retry server errors.
  return /is invalid: 5\d\d/.test(parts);
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * Runs an async operation, retrying it on transient network errors.
 *
 * @param {() => Promise<*>} fn - Operation to run.
 * @param {string} label - Human-readable label used in log messages.
 *
 * @returns {Promise<*>} - Result of `fn`.
 *
 * @throws {*} - Re-throws the last error if all attempts fail or the error is
 *   not transient.
 */
const withRetries = async (fn, label) => {
  const attempts = RETRY_DELAYS_MS.length + 1;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !isTransientError(error)) {
        throw error;
      }

      const delay = RETRY_DELAYS_MS[attempt - 1];
      console.warn(
        `Transient error for "${label}" on attempt ${attempt}/${attempts} `
        + `(${error.message || error}). Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
};

module.exports = {
  withRetries,
  isTransientError,
};
