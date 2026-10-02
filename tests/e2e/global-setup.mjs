import { startCloud, waitCloudReady, startSite } from './harness.mjs';

export default async function globalSetup() {
  startCloud();
  await waitCloudReady();
  await startSite();
}
