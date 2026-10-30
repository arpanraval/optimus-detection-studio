import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; payload?: unknown; filters: unknown[][] };
const mocks = vi.hoisted(() => ({
  profiles: {} as Record<string, { role: string; email: string }>,
  authIds: [] as string[],
  calls: [] as Call[],
  rpc: vi.fn(),
  createUser: vi.fn(),
  inviteUserByEmail: vi.fn(),
  updateUserById: vi.fn(),
  signOut: vi.fn(),
  handler: null as null | ((req: Request) => Promise<Response>),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'caller', email: 'caller@example.test' } }, error: null }),
      admin: {
        createUser: mocks.createUser,
        inviteUserByEmail: mocks.inviteUserByEmail,
        updateUserById: mocks.updateUserById,
        signOut: mocks.signOut,
      },
    },
    rpc: mocks.rpc,
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      mocks.calls.push(call);
      const query = {
        select: () => query,
        insert: (payload: unknown) => Object.assign(call, { op: 'insert', payload }) && query,
        update: (payload: unknown) => Object.assign(call, { op: 'update', payload }) && query,
        delete: () => Object.assign(call, { op: 'delete' }) && query,
        eq: (...args: unknown[]) => { call.filters.push(['eq', ...args]); return query; },
        is: (...args: unknown[]) => { call.filters.push(['is', ...args]); return query; },
        ilike: (...args: unknown[]) => { call.filters.push(['ilike', ...args]); return query; },
        single: () => query,
        maybeSingle: () => query,
        then: (resolve: (value: unknown) => void) => {
          const id = call.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2] as string | undefined;
          const data = table === 'profiles' && call.op === 'select' ? (id && mocks.profiles[id] && { id, ...mocks.profiles[id] }) || null : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

const send = async (body: Record<string, unknown>) =>
  mocks.handler!(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify(body),
  }));

const strongPassword = 'Correct-Horse-42';

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.calls = [];
  mocks.authIds = [];
  mocks.profiles = {
    caller: { role: 'admin', email: 'caller@example.test' },
    owner: { role: 'owner', email: 'owner@example.test' },
    admin2: { role: 'admin', email: 'admin2@example.test' },
    analyst: { role: 'analyst', email: 'analyst@example.test' },
  };
  vi.stubGlobal('Deno', { env: { get: () => 'test-value' }, serve: (handler: (req: Request) => Promise<Response>) => { mocks.handler = handler; } });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'upsert_rate_limit') return { data: 1, error: null };
    if (name === 'issue_user_invitation') return { data: 'invitation-1', error: null };
    if (name === 'auth_user_ids_for_email') return { data: mocks.authIds, error: null };
    return { data: null, error: null };
  });
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
  mocks.inviteUserByEmail.mockResolvedValue({ data: {}, error: null });
  mocks.updateUserById.mockResolvedValue({ data: { user: { id: 'target', email_confirmed_at: 'now' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  await import('../../manage-users/index');
});

describe('manage-users setPassword', () => {
  it.each(['owner', 'admin2', 'caller'])('refuses an admin setting the password of %s', async (target) => {
    const response = await send({ action: 'setPassword', userId: target, password: strongPassword });
    expect(response.status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it('lets an admin set the password of someone below admin', async () => {
    const response = await send({ action: 'setPassword', userId: 'analyst', password: strongPassword });
    expect(response.status).toBe(200);
    expect(mocks.updateUserById).toHaveBeenCalledWith('analyst', { password: strongPassword });
  });

  it('lets an owner set an admin password, and refuses unknown targets', async () => {
    mocks.profiles.caller.role = 'owner';
    expect((await send({ action: 'setPassword', userId: 'admin2', password: strongPassword })).status).toBe(200);
    mocks.updateUserById.mockClear();
    expect((await send({ action: 'setPassword', userId: 'missing', password: strongPassword })).status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});

describe('manage-users invitations', () => {
  it('finds existing accounts through Supabase Auth, not the editable profile email', async () => {
    mocks.profiles.caller.role = 'owner';
    // A viewer has rewritten their profile email to this address; Auth knows no account for it.
    mocks.profiles.viewer = { role: 'viewer', email: 'future.admin@example.test' };
    const response = await send({ action: 'invite', email: 'Future.Admin@example.test', role: 'admin' });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('auth_user_ids_for_email', { p_email: 'future.admin@example.test' });
    expect(mocks.calls.some((c) => c.filters.some((f) => f[0] === 'ilike'))).toBe(false);
    expect(mocks.calls.some((c) => c.table === 'profiles' && c.op === 'update')).toBe(false);
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith('future.admin@example.test', expect.objectContaining({
      data: { invitation_id: 'invitation-1' },
    }));
  });

  it('changes the role of the Auth account an email belongs to, under the change-role rules', async () => {
    mocks.authIds = ['admin2'];
    const refused = await send({ action: 'invite', email: 'admin2@example.test', role: 'viewer' });
    expect(refused.status).toBe(403);

    mocks.authIds = ['analyst'];
    const allowed = await send({ action: 'invite', email: 'analyst@example.test', role: 'lead' });
    expect(allowed.status).toBe(200);
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: 'profiles', op: 'update', payload: expect.objectContaining({ role: 'lead' }), filters: [['eq', 'id', 'analyst']],
    }));
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('refuses to guess when several accounts sign in with one email', async () => {
    mocks.authIds = ['analyst', 'other'];
    expect((await send({ action: 'invite', email: 'analyst@example.test', role: 'viewer' })).status).toBe(403);
    expect(mocks.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('issues invitations in the database and binds the new account to that invitation', async () => {
    const response = await send({ action: 'create', email: ' New@Example.test ', password: strongPassword, role: 'viewer' });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('issue_user_invitation', {
      p_email: 'new@example.test', p_role: 'viewer', p_invited_by: 'caller',
    });
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.test', user_metadata: { invitation_id: 'invitation-1' },
    }));
    expect(mocks.calls.some((c) => c.table === 'user_invitations' && c.op === 'insert')).toBe(false);
  });

  it('withdraws only its own unused invitation when sending fails', async () => {
    mocks.inviteUserByEmail.mockResolvedValue({ data: null, error: new Error('smtp down') });
    expect((await send({ action: 'invite', email: 'new@example.test', role: 'viewer' })).status).toBe(500);
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: 'user_invitations', op: 'delete', filters: [['eq', 'id', 'invitation-1'], ['is', 'accepted_at', null]],
    }));
  });

  it('keeps admins from granting admin', async () => {
    expect((await send({ action: 'invite', email: 'new@example.test', role: 'admin' })).status).toBe(403);
    expect((await send({ action: 'create', email: 'new@example.test', password: strongPassword, role: 'admin' })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalledWith('issue_user_invitation', expect.anything());
  });
});
