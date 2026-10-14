import {test} from 'node:test';import assert from 'node:assert/strict';import {validateBaseUrls} from '../scripts/check-business-displays.mjs';
test('rejects production browser targets',()=>{for(const url of ['https://app.novanetmm.com','http://localhost.evil.test','https://user:pass@localhost','file:///tmp/test','http://192.168.1.10'])assert.throws(()=>validateBaseUrls([url]),/loopback/);});
test('accepts only explicit loopback app origins',()=>assert.doesNotThrow(()=>validateBaseUrls(['http://127.0.0.1:3001','http://localhost:3002','http://[::1]:3003'])));
