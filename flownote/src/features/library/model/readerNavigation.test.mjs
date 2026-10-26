import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readerPages,stepReaderPage,createWheelPager,swipePageDirection} from './readerNavigation.ts';
test('spreads retain the requested page and clamp odd last pages without duplicates',()=>{
 assert.deepEqual(readerPages(2,7,'spread'),[1,2]);assert.deepEqual(readerPages(7,7,'spread'),[7]);assert.deepEqual(readerPages(4,7,'single'),[4]);
 assert.equal(stepReaderPage(2,7,'spread',1),3);assert.equal(stepReaderPage(7,7,'spread',1),7);assert.equal(stepReaderPage(7,7,'spread',-1),5);assert.equal(stepReaderPage(1,7,'spread',-1),1);
});
test('wheel momentum turns once per burst, allows a new gesture and reverses predictably',()=>{
 const w=createWheelPager();assert.equal(w.move(30,0),0);assert.equal(w.move(60,20),1);assert.equal(w.move(200,45),0);assert.equal(w.move(160,130),0);assert.equal(w.move(100,400),1);
 assert.equal(w.move(-110,650),-1);w.reset();assert.equal(w.move(-90,900),-1);
});
test('touch page flips are deliberate horizontal swipes, never long selection, zoom or pinch',()=>{
 const sample={dx:-90,dy:12,duration:220,contacts:1,zoom:1,selected:false};assert.equal(swipePageDirection(sample),1);assert.equal(swipePageDirection({...sample,dx:90}),-1);
 for(const patch of [{dx:10},{dy:100},{duration:700},{contacts:2},{zoom:1.5},{selected:true}])assert.equal(swipePageDirection({...sample,...patch}),0);
});

test('a turned page consumes remaining momentum even if the next page can scroll internally',()=>{const w=createWheelPager();assert.equal(w.move(100,0),1);assert.equal(w.move(900,40,false),0);assert.equal(w.isLatched(80),true);assert.equal(w.move(900,80),0);assert.equal(w.isLatched(300),false);assert.equal(w.move(100,300),1);});
