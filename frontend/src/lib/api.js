import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

const token = localStorage.getItem("strykos_token");
if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

export function setAuthToken(t) {
  if (t) {
    localStorage.setItem("strykos_token", t);
    api.defaults.headers.common["Authorization"] = `Bearer ${t}`;
  } else {
    localStorage.removeItem("strykos_token");
    delete api.defaults.headers.common["Authorization"];
  }
}

export function apiError(e) {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Une erreur est survenue";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
  if (d.message) return d.message;
  return JSON.stringify(d);
}

export default API;
