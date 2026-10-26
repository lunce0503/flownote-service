import { devices, test } from '@playwright/test';
import { registerLiveMarkdown } from './helpers/live-markdown';
test.use({ ...devices['iPad Pro 11'], browserName: 'webkit', userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.3.0' });
registerLiveMarkdown(820, 'webkit');
