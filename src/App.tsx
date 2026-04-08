import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { captureMonitoringError, clearMonitoringUser, identifyMonitoringUser } from "./monitoring";

type User = {
  id: string;
  username: string;
  clientCode: string;
};

type ClientDetails = {
  clientId: string;
  prenom: string;
  nom: string;
  telephoneDomicile: string;
  telephonePortable: string;
  telephoneTravail: string;
  sousContrat: boolean;
  numeroRue: string;
  qualiteAdresse: string;
  rue: string;
  ville: string;
  codePostal: string;
  renouvellement: string;
};

const API_BASE_URL = (import.meta.env.VITE_OXYREST_API_URL || "").replace(/\/+$/, "");
const CLIENT_TOKEN = import.meta.env.VITE_CLIENT_TOKEN || "";

async function apiFetch(path: string, init?: RequestInit, accessToken?: string) {
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("x-client-token", CLIENT_TOKEN);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
  }
  return body;
}

function normalizeClientDetails(payload: any): ClientDetails {
  const raw = payload?.data?.data ?? payload?.data ?? payload ?? {};
  return {
    clientId: String(raw.clientId ?? raw.CLIEN ?? ""),
    prenom: String(raw.prenom ?? raw.PRENO ?? ""),
    nom: String(raw.nom ?? raw.NOM ?? ""),
    telephoneDomicile: String(raw.telephoneDomicile ?? raw.TELDO ?? ""),
    telephonePortable: String(raw.telephonePortable ?? raw.TELPO ?? ""),
    telephoneTravail: String(raw.telephoneTravail ?? raw.TELTR ?? ""),
    sousContrat: Boolean(raw.sousContrat ?? String(raw.CONTR || "").toUpperCase() === "O"),
    numeroRue: String(raw.numeroRue ?? raw.NUMRU ?? ""),
    qualiteAdresse: String(raw.qualiteAdresse ?? raw.QUARU ?? ""),
    rue: String(raw.rue ?? raw.RUE1 ?? ""),
    ville: String(raw.ville ?? raw.VILLE ?? ""),
    codePostal: String(raw.codePostal ?? raw.CODPO ?? ""),
    renouvellement: String(raw.renouvellement ?? raw.RENOU ?? "")
  };
}

export function App() {
  const [accessToken, setAccessToken] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [clientDetails, setClientDetails] = useState<ClientDetails | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canLogin = useMemo(() => !!username.trim() && !!password.trim(), [username, password]);

  async function loadMe(token: string) {
    const me = await apiFetch("/client/espace-client/auth/me", { method: "GET" }, token);
    setUser(me.user as User);
    const details = await apiFetch(`/client/espace-client/client/${encodeURIComponent(me.user.clientCode)}`, { method: "GET" }, token);
    setClientDetails(normalizeClientDetails(details));
  }

  useEffect(() => {
    (async () => {
      if (!API_BASE_URL || !CLIENT_TOKEN) {
        setError("Variables VITE_OXYREST_API_URL ou VITE_CLIENT_TOKEN manquantes.");
        return;
      }
      try {
        const refreshed = await apiFetch("/client/espace-client/auth/refresh", { method: "POST" });
        const token = refreshed.accessToken as string;
        setAccessToken(token);
        await loadMe(token);
      } catch (err) {
        captureMonitoringError(err, "initial_refresh");
        setError(err instanceof Error ? err.message : "Erreur initiale");
      }
    })();
  }, []);

  useEffect(() => {
    if (user) {
      identifyMonitoringUser(user);
      return;
    }
    clearMonitoringUser();
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canLogin) return;
    setError("");
    setLoading(true);
    try {
      const login = await apiFetch("/client/espace-client/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });
      setAccessToken(login.accessToken as string);
      setUser(login.user as User);
      const details = await apiFetch(`/client/espace-client/client/${encodeURIComponent(login.user.clientCode)}`, { method: "GET" }, login.accessToken as string);
      setClientDetails(normalizeClientDetails(details));
    } catch (err) {
      captureMonitoringError(err, "login");
      setError(err instanceof Error ? err.message : "Connexion impossible");
      void apiFetch("/client/espace-client/monitoring/error", {
        method: "POST",
        body: JSON.stringify({
          level: "error",
          message: "Login failure",
          stack: err instanceof Error ? err.stack : String(err),
          page: "/login",
          userAgent: navigator.userAgent
        })
      }).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiFetch("/client/espace-client/auth/logout", { method: "POST" }).catch(() => undefined);
    clearMonitoringUser();
    setAccessToken("");
    setUser(null);
    setClientDetails(null);
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Espace Client OXYDRIVER</h1>
      </header>

      {!user ? (
        <main className="card">
          <h2>Connexion</h2>
          <form onSubmit={onSubmit}>
            <label>
              Nom d'utilisateur
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label>
              Mot de passe
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button disabled={!canLogin || loading} type="submit">
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </main>
      ) : (
        <main className="card">
          <div className="row">
            <h2>Bienvenue {user.username}</h2>
            <button onClick={logout}>Déconnexion</button>
          </div>
          <p>Code client: {user.clientCode}</p>
          <h3>Informations client</h3>
          {clientDetails ? (
            <div className="details-grid">
              <div className="details-card">
                <h4>Identité</h4>
                <p><strong>ID:</strong> {clientDetails.clientId}</p>
                <p><strong>Prénom:</strong> {clientDetails.prenom}</p>
                <p><strong>Nom:</strong> {clientDetails.nom}</p>
                <p><strong>Sous contrat:</strong> {clientDetails.sousContrat ? "Oui" : "Non"}</p>
              </div>
              <div className="details-card">
                <h4>Téléphones</h4>
                <p><strong>Domicile:</strong> {clientDetails.telephoneDomicile || "-"}</p>
                <p><strong>Portable:</strong> {clientDetails.telephonePortable || "-"}</p>
                <p><strong>Travail:</strong> {clientDetails.telephoneTravail || "-"}</p>
              </div>
              <div className="details-card">
                <h4>Adresse</h4>
                <p>
                  <strong>Rue:</strong> {[clientDetails.qualiteAdresse, clientDetails.numeroRue, clientDetails.rue].filter(Boolean).join(" ")}
                </p>
                <p><strong>Ville:</strong> {clientDetails.ville || "-"}</p>
                <p><strong>Code postal:</strong> {clientDetails.codePostal || "-"}</p>
              </div>
              <div className="details-card">
                <h4>Renouvellement</h4>
                <p>{clientDetails.renouvellement || "-"}</p>
              </div>
            </div>
          ) : (
            <p>Aucune donnée client.</p>
          )}
          <p className="hint">Token access actif: {accessToken ? "oui" : "non"} (refresh token stocké en cookie HttpOnly).</p>
        </main>
      )}
    </div>
  );
}
