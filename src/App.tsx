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
  email: string;
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

type FactureSummary = {
  id: string;
  type: string;
  clientId: string;
  nom: string;
  adresse: string;
  totalHt: string;
  totalTva: string;
  totalTtc: string;
};

type FactureLine = {
  factureId: string;
  designation: string;
  quantite: string;
  prixBrut: string;
  remise: string;
  prixNet: string;
  payeurId: string;
  dateFacture: string;
  tauxTva: string;
  montant: string;
  totalTtc: string;
};

type FactureDetail = FactureSummary & {
  lignes: FactureLine[];
};

type ActiveTab = "profile" | "factures";
type FactureFilter = "F" | "D" | "I";

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
    email: String(raw.email ?? raw.EMAIL ?? ""),
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

function pickString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

function normalizeFactureSummary(payload: any): FactureSummary {
  return {
    id: pickString(payload, ["id", "factureId", "CLE"]),
    type: pickString(payload, ["type", "TYPE"]),
    clientId: pickString(payload, ["clientId", "CLIEN"]),
    nom: pickString(payload, ["nom", "NOM"]),
    adresse: pickString(payload, ["adresse", "ADRESSE"]),
    totalHt: pickString(payload, ["totalHt", "TOHT"]),
    totalTva: pickString(payload, ["totalTva", "TOTVA"]),
    totalTtc: pickString(payload, ["totalTtc", "TOTTC"])
  };
}

function normalizeFactureLine(payload: any): FactureLine {
  return {
    factureId: pickString(payload, ["factureId", "CLE"]),
    designation: pickString(payload, ["designation", "DESIG"]),
    quantite: pickString(payload, ["quantite", "QUANT"]),
    prixBrut: pickString(payload, ["prixBrut", "PRIBR"]),
    remise: pickString(payload, ["remise", "REMIS"]),
    prixNet: pickString(payload, ["prixNet", "PRINE"]),
    payeurId: pickString(payload, ["payeurId", "PAYEU"]),
    dateFacture: pickString(payload, ["dateFacture", "DATEF"]),
    tauxTva: pickString(payload, ["tauxTva", "TATVA"]),
    montant: pickString(payload, ["montant", "MONTA"]),
    totalTtc: pickString(payload, ["totalTtc", "TTC"])
  };
}

function normalizeFactures(payload: any): FactureSummary[] {
  const raw = payload?.data?.data ?? payload?.data ?? payload ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeFactureSummary(item));
}

function normalizeFactureDetail(payload: any): FactureDetail {
  const raw = payload?.data?.data ?? payload?.data ?? payload ?? {};
  const base = normalizeFactureSummary(raw);
  const linesRaw = Array.isArray(raw.lignes ?? raw.LIGNES) ? (raw.lignes ?? raw.LIGNES) : [];
  return {
    ...base,
    lignes: linesRaw.map((line: any) => normalizeFactureLine(line))
  };
}

function formatEuro(value: string): string {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return `${value || "0,00"} €`;
  return `${parsed.toFixed(2).replace(".", ",")} €`;
}

function factureTypeLabel(type: string): string {
  const upper = type.toUpperCase();
  if (upper === "F") return "Facture";
  if (upper === "D") return "Devis";
  if (upper === "I") return "Intervention";
  return type || "-";
}

export function App() {
  const [accessToken, setAccessToken] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [clientDetails, setClientDetails] = useState<ClientDetails | null>(null);
  const [factures, setFactures] = useState<FactureSummary[]>([]);
  const [selectedFacture, setSelectedFacture] = useState<FactureDetail | null>(null);
  const [facturesLoading, setFacturesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");
  const [factureFilter, setFactureFilter] = useState<FactureFilter>("F");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveProfileLoading, setSaveProfileLoading] = useState(false);
  const [apiLoadingCount, setApiLoadingCount] = useState(0);

  const canLogin = useMemo(() => !!username.trim() && !!password.trim(), [username, password]);
  const isApiLoading = apiLoadingCount > 0;

  async function callApi(path: string, init?: RequestInit, token?: string) {
    setApiLoadingCount((v) => v + 1);
    try {
      return await apiFetch(path, init, token);
    } finally {
      setApiLoadingCount((v) => Math.max(0, v - 1));
    }
  }

  async function loadMe(token: string) {
    const me = await callApi("/client/espace-client/auth/me", { method: "GET" }, token);
    const nextUser = me.user as User;
    setUser(nextUser);
    const details = await callApi(`/client/espace-client/client/${encodeURIComponent(nextUser.clientCode)}`, { method: "GET" }, token);
    setClientDetails(normalizeClientDetails(details));
    await loadFactures(token, nextUser.clientCode, "F");
  }

  async function loadFactures(token: string, clientCode: string, type: FactureFilter) {
    setFacturesLoading(true);
    try {
      const listPayload = await callApi(`/client/espace-client/client/${encodeURIComponent(clientCode)}/factures?type=${encodeURIComponent(type)}`, { method: "GET" }, token);
      const items = normalizeFactures(listPayload);
      setFactures(items);
      if (items.length > 0) {
        await selectFacture(token, items[0].id);
      } else {
        setSelectedFacture(null);
      }
    } finally {
      setFacturesLoading(false);
    }
  }

  async function selectFacture(token: string, factureId: string) {
    if (!factureId) return;
    const facturePayload = await callApi(`/client/espace-client/facture/${encodeURIComponent(factureId)}`, { method: "GET" }, token);
    setSelectedFacture(normalizeFactureDetail(facturePayload));
  }

  useEffect(() => {
    (async () => {
      if (!API_BASE_URL || !CLIENT_TOKEN) {
        setError("Variables VITE_OXYREST_API_URL ou VITE_CLIENT_TOKEN manquantes.");
        return;
      }
      try {
        const refreshed = await callApi("/client/espace-client/auth/refresh", { method: "POST" });
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
      const login = await callApi("/client/espace-client/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });
      setAccessToken(login.accessToken as string);
      const nextUser = login.user as User;
      setUser(nextUser);
      const details = await callApi(`/client/espace-client/client/${encodeURIComponent(nextUser.clientCode)}`, { method: "GET" }, login.accessToken as string);
      setClientDetails(normalizeClientDetails(details));
      await loadFactures(login.accessToken as string, nextUser.clientCode, "F");
    } catch (err) {
      captureMonitoringError(err, "login");
      setError(err instanceof Error ? err.message : "Connexion impossible");
      void callApi("/client/espace-client/monitoring/error", {
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
    await callApi("/client/espace-client/auth/logout", { method: "POST" }).catch(() => undefined);
    clearMonitoringUser();
    setAccessToken("");
    setUser(null);
    setClientDetails(null);
    setFactures([]);
    setSelectedFacture(null);
    setActiveTab("profile");
    setFactureFilter("F");
  }

  async function saveClientContact() {
    if (!user || !accessToken || !clientDetails) return;
    setSaveProfileLoading(true);
    setError("");
    try {
      await callApi(`/client/espace-client/client/${encodeURIComponent(user.clientCode)}`, {
        method: "PUT",
        body: JSON.stringify({
          email: clientDetails.email,
          telephoneDomicile: clientDetails.telephoneDomicile,
          telephonePortable: clientDetails.telephonePortable,
          telephoneTravail: clientDetails.telephoneTravail
        })
      }, accessToken);
      await loadMe(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de mise à jour du profil client");
    } finally {
      setSaveProfileLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "factures" || !user || !accessToken) return;
    void loadFactures(accessToken, user.clientCode, factureFilter);
  }, [activeTab, factureFilter, user, accessToken]);

  return (
    <div className="app-shell">
      {isApiLoading ? (
        <div className="api-loader-overlay" role="status" aria-live="polite" aria-label="Chargement API">
          <div className="api-loader-spinner" />
          <span>Chargement...</span>
        </div>
      ) : null}
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

          <div className="tabs">
            <button className={activeTab === "profile" ? "tab active" : "tab"} onClick={() => setActiveTab("profile")}>
              Profil client
            </button>
            <button className={activeTab === "factures" ? "tab active" : "tab"} onClick={() => setActiveTab("factures")}>
              Factures
            </button>
          </div>

          {activeTab === "profile" ? (
            <>
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
                    <label>
                      Email
                      <input
                        value={clientDetails.email}
                        onChange={(e) => setClientDetails((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
                      />
                    </label>
                    <label>
                      Domicile
                      <input
                        value={clientDetails.telephoneDomicile}
                        onChange={(e) => setClientDetails((prev) => (prev ? { ...prev, telephoneDomicile: e.target.value } : prev))}
                      />
                    </label>
                    <label>
                      Portable
                      <input
                        value={clientDetails.telephonePortable}
                        onChange={(e) => setClientDetails((prev) => (prev ? { ...prev, telephonePortable: e.target.value } : prev))}
                      />
                    </label>
                    <label>
                      Travail
                      <input
                        value={clientDetails.telephoneTravail}
                        onChange={(e) => setClientDetails((prev) => (prev ? { ...prev, telephoneTravail: e.target.value } : prev))}
                      />
                    </label>
                    <p><strong>Domicile:</strong> {clientDetails.telephoneDomicile || "-"}</p>
                    <p><strong>Portable:</strong> {clientDetails.telephonePortable || "-"}</p>
                    <p><strong>Travail:</strong> {clientDetails.telephoneTravail || "-"}</p>
                    <button onClick={() => void saveClientContact()} disabled={saveProfileLoading}>
                      {saveProfileLoading ? "Enregistrement..." : "Enregistrer"}
                    </button>
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
            </>
          ) : (
            <div className="facture-layout">
              <div>
                <h3>Liste des factures</h3>
                <div className="tabs tabs-small">
                  <button className={factureFilter === "F" ? "tab active" : "tab"} onClick={() => setFactureFilter("F")}>
                    Factures
                  </button>
                  <button className={factureFilter === "D" ? "tab active" : "tab"} onClick={() => setFactureFilter("D")}>
                    Devis
                  </button>
                  <button className={factureFilter === "I" ? "tab active" : "tab"} onClick={() => setFactureFilter("I")}>
                    Interventions gratuites
                  </button>
                </div>
                {facturesLoading ? <p>Chargement des factures...</p> : null}
                {factures.length === 0 && !facturesLoading ? <p>Aucune facture trouvée.</p> : null}
                <div className="facture-list">
                  {factures.map((facture) => (
                    <button
                      key={facture.id}
                      className={selectedFacture?.id === facture.id ? "facture-item active" : "facture-item"}
                      onClick={() => void selectFacture(accessToken, facture.id)}
                    >
                      <strong>{facture.id}</strong>
                      <span>{factureTypeLabel(facture.type)}</span>
                      <span>{formatEuro(facture.totalTtc)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="details-card">
                <h3>Détail facture</h3>
                {!selectedFacture ? (
                  <p>Sélectionne une facture.</p>
                ) : (
                  <>
                    <p><strong>ID:</strong> {selectedFacture.id}</p>
                    <p><strong>Type:</strong> {factureTypeLabel(selectedFacture.type)}</p>
                    <p><strong>Nom:</strong> {selectedFacture.nom || "-"}</p>
                    <p><strong>Adresse:</strong> {selectedFacture.adresse || "-"}</p>
                    <p><strong>Total HT:</strong> {formatEuro(selectedFacture.totalHt)}</p>
                    <p><strong>Total TVA:</strong> {formatEuro(selectedFacture.totalTva)}</p>
                    <p><strong>Total TTC:</strong> {formatEuro(selectedFacture.totalTtc)}</p>

                    <h4>Lignes (CORFA)</h4>
                    <div className="facture-lines">
                      {selectedFacture.lignes.length === 0 ? <p>Aucune ligne.</p> : null}
                      {selectedFacture.lignes.map((line, idx) => (
                        <div key={`${line.factureId}-${idx}`} className="facture-line">
                          <p><strong>Désignation:</strong> {line.designation || "-"}</p>
                          <p><strong>Quantité:</strong> {line.quantite || "-"}</p>
                          <p><strong>Prix brut:</strong> {formatEuro(line.prixBrut)}</p>
                          <p><strong>Remise:</strong> {line.remise || "-"}</p>
                          <p><strong>Prix net:</strong> {formatEuro(line.prixNet)}</p>
                          <p><strong>Payeur:</strong> {line.payeurId || "-"}</p>
                          <p><strong>Date facture:</strong> {line.dateFacture || "-"}</p>
                          <p><strong>TVA:</strong> {line.tauxTva || "-"} %</p>
                          <p><strong>Montant:</strong> {formatEuro(line.montant)}</p>
                          <p><strong>TTC:</strong> {formatEuro(line.totalTtc)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <p className="hint">Token access actif: {accessToken ? "oui" : "non"} (refresh token stocké en cookie HttpOnly).</p>
        </main>
      )}
    </div>
  );
}
