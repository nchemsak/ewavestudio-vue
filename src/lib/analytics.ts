export function trackEvent(action: string, params?: Record<string, any>) {
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', action, params || {});
}