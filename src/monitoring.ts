import LogRocket from "logrocket";

const logRocketId = String(import.meta.env.VITE_LOGROCKET_APP_ID || "").trim();
const isProd = import.meta.env.PROD;
const enabled = !!logRocketId && isProd;

export function initMonitoring() {
  if (!enabled) return;
  LogRocket.init(logRocketId);
}

export function identifyMonitoringUser(user: { id: string; username: string; clientCode: string }) {
  if (!enabled) return;
  LogRocket.identify(user.id, {
    name: user.username,
    clientCode: user.clientCode
  });
}

export function clearMonitoringUser() {
  if (!enabled) return;
  LogRocket.identify("anonymous");
}

export function captureMonitoringError(err: unknown, context: string) {
  if (!enabled) return;
  if (err instanceof Error) {
    LogRocket.captureException(err);
    return;
  }
  LogRocket.captureMessage(`[${context}] ${String(err)}`);
}

