/**
 * Central URL resolver for the researcher application.
 * Existing web fetch calls intentionally remain unchanged in Phase 1; the
 * next phase will migrate them through this adapter incrementally.
 */

import { getRuntime } from './environment.js';

export const RESEARCHER_APP_ORIGIN = 'https://app.sidjil.org';

export function resolveAppUrl(path = '') {
  const value = String(path || '');
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (getRuntime() === 'capacitor') {
    return new URL(value || '/', RESEARCHER_APP_ORIGIN).toString();
  }
  return value || '/';
}


