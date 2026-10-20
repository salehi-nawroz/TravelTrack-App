import axios from "axios";

// BigDataCloud's free client-side reverse geocoding. Its documented host,
// api.bigdatacloud.net, now answers this endpoint with a 307 redirect to
// api-bdc.io (BigDataCloud's own domain), and the browser checks the
// redirect target against the CSP. Calling api-bdc.io directly saves the
// hop and keeps connect-src (frontend/vercel.json) to a single host.
export const geocodingApi = axios.create({
  baseURL: "https://api-bdc.io/data",
  timeout: 10000,
});

export const locationSearchApi = axios.create({
  baseURL: "https://nominatim.openstreetmap.org",
  headers: {
    "Accept-Language": "en",
  },
});
