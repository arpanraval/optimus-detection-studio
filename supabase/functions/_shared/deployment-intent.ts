/** Explicit user intent must never be inferred from historical deployment records. */
export function deploymentIntent(requestedAction: unknown, vendorRuleId?: string) {
  const action = requestedAction ?? (vendorRuleId ? 'update' : 'create');
  if (action !== 'create' && action !== 'update') throw new Error('Choose Create new or Update existing');
  if (action === 'create' && vendorRuleId) throw new Error('Create new cannot target an existing rule ID');
  if (action === 'update' && !vendorRuleId) throw new Error('Update existing requires a rule ID');
  return { action, vendorRuleId: action === 'update' ? vendorRuleId : undefined };
}
