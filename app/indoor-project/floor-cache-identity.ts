const identities = new WeakMap<object, number>();
let next = 0;

/** Runtime identity only: face carriers can differ despite sharing source hashes
 * and scope. Never serialize this identity as geometry or package metadata. */
export function floorNativeFaceIdentity(value: object | undefined): number {
  if (!value) return 0;
  let identity = identities.get(value);
  if (identity === undefined) {
    identity = ++next;
    identities.set(value, identity);
  }
  return identity;
}
