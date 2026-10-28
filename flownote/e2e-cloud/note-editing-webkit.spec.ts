import { devices, test } from '@playwright/test';
import { registerNoteEditing } from './helpers/note-editing';
test.use({ ...devices['iPad Pro 11'], browserName: 'webkit', userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.3.0' });
registerNoteEditing(820, 'webkit');
