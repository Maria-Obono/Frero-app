/**
 * Shared fast-check configuration for property-based tests.
 * Enforces minimum 100 iterations as per testing requirements (Requirement 18.5).
 */
import * as fc from 'fast-check';

/**
 * Default fast-check parameters with minimum 100 iterations.
 * Use this in all property tests to ensure consistent coverage.
 */
export const FC_PARAMS: fc.Parameters<unknown> = {
  numRuns: 100,
  verbose: fc.VerbosityLevel.None,
};

/**
 * Extended parameters for critical properties that need more coverage.
 */
export const FC_PARAMS_EXTENDED: fc.Parameters<unknown> = {
  numRuns: 200,
  verbose: fc.VerbosityLevel.None,
};

/**
 * Helper to run a property assertion with the standard configuration.
 */
export function assertProperty<Ts extends [unknown, ...unknown[]]>(
  ...args: [...arbitraries: { [K in keyof Ts]: fc.Arbitrary<Ts[K]> }, predicate: (...args: Ts) => boolean | void]
) {
  const predicate = args.pop() as (...a: Ts) => boolean | void;
  const arbitraries = args as unknown as { [K in keyof Ts]: fc.Arbitrary<Ts[K]> };
  fc.assert(
    (fc.property as Function)(...arbitraries, predicate),
    FC_PARAMS
  );
}
