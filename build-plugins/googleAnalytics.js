// build-plugins/googleAnalytics.js
// Adds the Google Analytics (gtag.js) tag to index.html in production builds only, so
// `npm run dev` (and anyone running the app locally from source) sends no analytics events.
// The deployed site, `npm run preview` and the browser tests use the build and so have the
// tag; the browser tests stub out googletagmanager.com. trackEvent() in DrumSequencer.vue and
// ProjectControls.vue does nothing while window.gtag is missing.

export const GA_MEASUREMENT_ID = 'G-ZZ1T0XVYLJ';

/** @returns {import('vite').Plugin} */
export function googleAnalytics(id = GA_MEASUREMENT_ID) {
  return {
    name: 'google-analytics',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
          injectTo: 'head',
        },
        {
          tag: 'script',
          children: [
            'window.dataLayer = window.dataLayer || [];',
            'function gtag() { dataLayer.push(arguments); }',
            "gtag('js', new Date());",
            `gtag('config', '${id}');`,
          ].join('\n'),
          injectTo: 'head',
        },
      ];
    },
  };
}
