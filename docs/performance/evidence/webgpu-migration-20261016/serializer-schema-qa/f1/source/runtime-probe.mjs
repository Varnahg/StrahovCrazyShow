import assert from 'node:assert/strict';
import {MaterialDefines} from '@babylonjs/core/Materials/materialDefines.js';
assert.ok(MaterialDefines.prototype.toString.toString().includes('defineSchemas'));
console.log(JSON.stringify({schemaRuntime:true}));
