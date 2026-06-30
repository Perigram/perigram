export const MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT = 'cutkit:mobile-transient-surfaces-close';

export function isMobileViewport() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches;
}

export function requestCloseMobileTransientSurfaces() {
  if (!isMobileViewport()) return false;
  window.dispatchEvent(new CustomEvent(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT));
  return true;
}
