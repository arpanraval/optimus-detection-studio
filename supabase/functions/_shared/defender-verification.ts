/** A successful write/read-by-ID can disagree with Defender's rule inventory.
 * Inventory visibility verifies persistence, not query execution or alert delivery. */
export async function verifyDefenderInventory(
  request: (path: string) => Promise<Record<string, unknown>>,
  id: string,
): Promise<void> {
  if (!id) throw new Error('Defender returned no rule ID; deployment cannot be verified');
  const filter = encodeURIComponent(`id eq '${id.replaceAll("'", "''")}'`);
  const page = await request(`rules/detectionRules?$filter=${filter}&$select=id`);
  if (!Array.isArray(page.value)) throw new Error('Defender returned an invalid rule inventory');
  if (!page.value.some(rule => rule && String(rule.id) === id)) {
    const error = new Error(`Defender rule ${id} is not visible in its rule inventory. Deployment is unverified; reconcile before retrying.`);
    error.name = 'DefenderInventoryPending';
    throw error;
  }
}
