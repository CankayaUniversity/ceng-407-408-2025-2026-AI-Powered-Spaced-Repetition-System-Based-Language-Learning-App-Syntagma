export function resolveInitialRouteFromAuthError(hasToken, errorStatus) {
  if (!hasToken) {
    return 'Login';
  }

  if (errorStatus === 401 || errorStatus === 403) {
    return 'Login';
  }

  // Network/offline/unknown server errors should keep last signed-in users in app.
  return 'MainTabs';
}
