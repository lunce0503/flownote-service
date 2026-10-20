import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceTree } from './workspaceTree.ts';
test('actual categories and folders include empty folders, orphan notes and no fabricated nesting', () => {
  const tree = workspaceTree([{id:'a',title:'긴 한글.md'}, {id:'b',title:'b'}], [
    {id:'f',category:' Work ',name:'folder/name',noteIds:['a','deleted','a']},
    {id:'g',category:'',name:'empty',noteIds:[]},
  ]);
  assert.equal(tree.categories[0][0], 'Work');
  assert.equal(tree.categories[0][1][0].folder.name, 'folder/name');
  assert.deepEqual(tree.categories[0][1][0].notes.map(n=>n.id), ['a']);
  assert.equal(tree.categories[1][1][0].notes.length, 0);
  assert.deepEqual(tree.unfiled.map(n=>n.id), ['b']);
});
