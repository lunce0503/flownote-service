import {test} from '@playwright/test';
import {registerReaderUpgrade} from './helpers/reader-upgrade';
test.use({browserName:'webkit',isMobile:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.3.0'});
registerReaderUpgrade('webkit',820);
