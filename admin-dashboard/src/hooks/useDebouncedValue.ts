import { useEffect, useState } from 'react';

// Small shared helper to stop re-implementing the same
// useState+setTimeout debounce pair on every search box. Mirrors the
// pattern already used in reseller-dashboard's OrdersTable/CustomersPage
// and admin's MonitoringPage.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
