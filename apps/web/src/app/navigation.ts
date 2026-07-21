import { useRoute, useRouter } from 'vue-router';

export function stringQuery(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function useObservabilityNavigation() {
  const route = useRoute();
  const router = useRouter();

  async function navigate(query: Record<string, string>): Promise<void> {
    const locationId = stringQuery(route.query.locationId);
    await router.push({ path: '/', query: { ...(locationId ? { locationId } : {}), ...query } });
  }

  return { navigate };
}
