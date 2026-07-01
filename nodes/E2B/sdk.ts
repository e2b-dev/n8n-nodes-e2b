import type { E2BModule } from './types';

let e2bModule: E2BModule | undefined;

export async function loadE2B(): Promise<E2BModule> {
	e2bModule ??= await import('e2b');
	return e2bModule;
}
