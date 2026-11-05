import { describe, it, expect } from 'vitest';
import { googleAnalytics, GA_MEASUREMENT_ID } from '../../build-plugins/googleAnalytics.js';

describe('Google Analytics tag', () => {
	it('is added by builds only, so `npm run dev` sends no analytics events', () => {
		const plugin = googleAnalytics();
		expect(plugin.apply).toBe('build');
		const tags = (plugin.transformIndexHtml as any)() as any[];
		expect(tags[0].attrs.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
		expect(tags[1].children).toContain(`gtag('config', '${GA_MEASUREMENT_ID}')`);
		expect(tags.every((t) => t.injectTo === 'head')).toBe(true);
	});
});
