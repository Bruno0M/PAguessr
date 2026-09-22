export interface Features {
  championships: boolean;
}

export async function getFeatures(): Promise<Features> {
  try {
    const res = await fetch('/api/features', { credentials: 'include' });
    if (!res.ok) {
      return { championships: false };
    }
    const data = await res.json();
    return {
      championships: Boolean(data?.championships),
    };
  } catch {
    return { championships: false };
  }
}
