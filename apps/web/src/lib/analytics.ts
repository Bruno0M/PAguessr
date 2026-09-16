export function track(event: string, data?: Record<string, unknown>) {
  window.umami?.track(event, data);
}
