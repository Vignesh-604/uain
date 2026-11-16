/* oxlint-disable typescript/no-useless-default-assignment -- Rule requires strictNullChecks; this pilot compiles with strict:false. */
/** IDs supported by the public central-task detail route. Not an authority write rule. */
export const CENTRAL_TASK_ID = /^T-[A-Za-z][A-Za-z0-9._-]{0,93}$/;
