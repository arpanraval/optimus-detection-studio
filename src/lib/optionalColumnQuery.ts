interface QueryError {
  code: string;
  message: string;
}

// Rolling deployments may serve the frontend before an additive migration.
// Retry only the named missing column; permission and other query failures remain errors.
export function optionalColumnQuery(column: string) {
  let available = true;
  return async function query<T extends { error: QueryError | null }>(
    execute: (includeColumn: boolean) => PromiseLike<T>,
  ): Promise<T> {
    const includeColumn = available;
    const result = await execute(includeColumn);
    if (includeColumn && result.error?.code === '42703' &&
      result.error.message.includes(`.${column} does not exist`)) {
      available = false;
      return await execute(false);
    }
    return result;
  };
}
