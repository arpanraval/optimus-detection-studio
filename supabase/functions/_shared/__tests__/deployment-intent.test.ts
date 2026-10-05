import { expect, it } from 'vitest';
import { deploymentIntent } from '../deployment-intent';
import { deployRouteDecision } from '../siem-deploy-target';

it('honors create without selecting an old vendor identity', () => {
  expect(deploymentIntent('create')).toEqual({ action: 'create', vendorRuleId: undefined });
  expect(() => deploymentIntent('create', '458')).toThrow('cannot target');
});
it('requires an explicit target for update', () => {
  expect(deploymentIntent('update', '458')).toEqual({ action: 'update', vendorRuleId: '458' });
  expect(() => deploymentIntent('update')).toThrow('requires a rule ID');
  expect(() => deploymentIntent('delete', '458')).toThrow('Choose');
});
it('does not turn an explicit create into a reviewed native update', () => {
  expect(deployRouteDecision({ state: 'bound', binding: { id: 'b', detection_id: 'd', integration_id: 'i',
    vendor_rule_id: '458', binding_status: 'active' } },
  { requestedAction: 'create', expectedHash: 'reviewed', expectedVersion: 1 })).toMatchObject({ route: 'refuse' });
});
