// Explicit adaptations applied in memory to pinned upstream sources.
// Copyright/license headers are preserved. Review these with the pool source.
export function adapt(path, original) {
  let source = original;
  const replaceOnce = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Unexpected pinned source shape: ' + path);
    source = source.replace(before, after);
  };
  if (path === 'zeto/lib/zeto_fungible.sol') {
    for (const name of ['deposit', 'withdraw']) {
      const start = source.indexOf('function ' + name + '(');
      const end = source.indexOf('{', start);
      const header = source.slice(start, end);
      if (!header.includes('public nonReentrant')) throw Error('Expected guarded ' + name);
      replaceOnce(header, header.replace('public nonReentrant', 'public virtual nonReentrant'));
    }
  }
  if (path === 'zeto/zeto_anon_nullifier.sol') {
    replaceOnce('function _authorizeUpgrade(address) internal override onlyOwner {}',
      'function _authorizeUpgrade(address) internal pure override { revert("NULLIS_UPGRADES_DISABLED"); }');
  }
  if (path === 'zeto/lib/zeto_lockable.sol') {
    replaceOnce('modifier onlySelf()', 'error NullisLockingDisabled();\n\n    modifier onlySelf()');
    const disabled = ['computeLockId', 'computeSpendHash', 'computeCancelHash', 'createLock', 'updateLock', 'delegateLock', 'spendLock', 'cancelLock', 'getLock', 'isLockActive', 'getLockContent', 'getLockedInputs', 'locked', 'zetoLockDoLockTransition', 'zetoLockTransferLocked'];
    for (const name of disabled) {
      const start = source.indexOf('function ' + name + '(');
      if (start < 0) throw Error('Missing lock function ' + name);
      const open = source.indexOf('{', start); let depth = 1, end = open + 1;
      for (; end < source.length && depth; end++) {
        if (source[end] === '{') depth++;
        if (source[end] === '}') depth--;
      }
      if (depth) throw Error('Unbalanced upstream body');
      source = source.slice(0, open) + '{ revert NullisLockingDisabled(); }' + source.slice(end);
    }
  }
  return source;
}
