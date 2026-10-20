import { resolveApiBaseUrl } from './config';
import { ReceiveLogPage } from './receive-log-page';

export function App(): JSX.Element {
  const apiBase = resolveApiBaseUrl();
  return <ReceiveLogPage apiBaseUrl={apiBase} />;
}
