/**
 * Controller board-online probe (attribute on #transport-route and mirrored #online-state).
 */
export function isControllerBoardOnlineInPage() {
  const route = document.getElementById('transport-route');
  if (route && route.getAttribute('data-board-online') === '1') {
    return true;
  }
  const online = document.getElementById('online-state');
  return Boolean(online && online.getAttribute('data-board-online') === '1');
}

export const CONTROLLER_BOARD_ONLINE_WAIT_JS = `(() => {
  const route = document.getElementById('transport-route');
  if (route && route.getAttribute('data-board-online') === '1') return true;
  const online = document.getElementById('online-state');
  return online && online.getAttribute('data-board-online') === '1';
})()`;
