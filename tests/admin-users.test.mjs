import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/api/admin/users/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function route({ pages = [], denied = false, failPage = false } = {}) {
  const calls = [];
  class AuthError extends Error {}
  const exports = {};
  const db = {
    collection: (collection) => ({ doc: (id) => ({
      id,
      get: async () => ({ exists: collection === 'admins' && id === 'u0', data: () => undefined }),
    }) }),
    getAll: async (...refs) => refs.map(({ id }) => ({ id, data: () => ({ fullName: `Profile ${id}` }) })),
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'next/server') return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
      if (name === '@/lib/server/auth') return { AuthError, requireAdmin: async () => { if (denied) throw new AuthError('denied'); } };
      if (name === '@/lib/firebase/admin') return { adminFirestore: db, adminAuth: { listUsers: async (size, token) => {
        calls.push([size, token]);
        if (failPage && token) throw new Error('page failed');
        const index = token ? Number(token) : 0;
        return { users: pages[index] ?? [], pageToken: index + 1 < pages.length ? String(index + 1) : undefined };
      } } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { get: exports.GET, calls };
}
const user = (i) => ({ uid: `u${i}`, metadata: { creationTime: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() } });

test('loads every auth page and sorts all users newest first while retaining profiles and roles', async () => {
  const users = Array.from({ length: 1002 }, (_, i) => user(i));
  const { get, calls } = route({ pages: [users.slice(0, 1000), users.slice(1000)] });
  const result = await get({});
  assert.equal(result.status, 200);
  assert.equal(result.body.users.length, 1002);
  assert.deepEqual(calls, [[1000, undefined], [1000, '1']]);
  assert.equal(result.body.users[0].uid, 'u1001');
  assert.equal(result.body.users.at(-1).uid, 'u0');
  assert.equal(result.body.users.at(-1).displayName, 'Profile u0');
  assert.equal(result.body.users.at(-1).isAdmin, true);
});
test('handles an empty directory', async () => {
  const result = await route().get({});
  assert.equal(result.status, 200);
  assert.equal(result.body.users.length, 0);
});
test('rejects unauthorized access before listing accounts', async () => {
  const { get, calls } = route({ denied: true });
  assert.equal((await get({})).status, 403);
  assert.equal(calls.length, 0);
});
test('returns an error rather than a misleading partial list if another page fails', async () => {
  const result = await route({ pages: [[user(0)], [user(1)]], failPage: true }).get({});
  assert.equal(result.status, 500);
  assert.equal(result.body.users, undefined);
});
