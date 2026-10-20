import { describe, expect, it, vi } from "vitest";
import { geocodingApi } from "./api";
import { getCityData } from "./geocodingService";
import vercel from "../../vercel.json";

// Trimmed real responses from api-bdc.io/data/reverse-geocode-client.
const PARIS = {
  countryName: "France",
  countryCode: "FR",
  principalSubdivision: "Ile-de-France",
  city: "Paris",
  locality: "Saint-Merri",
};
const OPEN_SEA = {
  countryName: "",
  countryCode: "",
  principalSubdivision: "",
  city: "",
  locality: "Monumento Natural do Arquipelago de Sao Pedro e Sao Paulo",
};

describe("getCityData (BigDataCloud reverse geocoding)", () => {
  it("calls the documented endpoint and maps the response", async () => {
    const get = vi.spyOn(geocodingApi, "get").mockResolvedValue({ data: PARIS });

    await expect(getCityData("48.8566", "2.3522")).resolves.toEqual({
      cityName: "Paris",
      region: "Ile-de-France",
      country: "France",
      countryCode: "FR",
      position: { lat: 48.8566, lng: 2.3522 },
    });
    expect(get).toHaveBeenCalledWith("/reverse-geocode-client", {
      params: { latitude: "48.8566", longitude: "2.3522", localityLanguage: "en" },
    });
  });

  it("falls back to the locality when there is no city", async () => {
    vi.spyOn(geocodingApi, "get").mockResolvedValue({
      data: { ...PARIS, city: "", locality: "Montmartre" },
    });
    expect((await getCityData(48.88, 2.34)).cityName).toBe("Montmartre");
  });

  it("returns null for a point outside any country", async () => {
    vi.spyOn(geocodingApi, "get").mockResolvedValue({ data: OPEN_SEA });
    await expect(getCityData(0, -30)).resolves.toBeNull();
  });

  it("rejects when the provider can't be reached", async () => {
    vi.spyOn(geocodingApi, "get").mockRejectedValue(new Error("Network Error"));
    await expect(getCityData(1, 2)).rejects.toThrow("Network Error");
  });
});

describe("geocoding host and Content-Security-Policy", () => {
  const csp = vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === "Content-Security-Policy").value;
  const connectSrc = csp
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === "connect-src")
    .slice(1);

  it("calls BigDataCloud's api-bdc.io directly (api.bigdatacloud.net redirects there)", () => {
    expect(new URL(geocodingApi.defaults.baseURL).origin).toBe("https://api-bdc.io");
  });

  it("allows exactly that origin in connect-src, without wildcards for it", () => {
    expect(connectSrc).toContain(new URL(geocodingApi.defaults.baseURL).origin);
    expect(connectSrc).not.toContain("https://api.bigdatacloud.net");
    expect(connectSrc.filter((s) => s.includes("bdc") || s.includes("bigdatacloud"))).toEqual([
      "https://api-bdc.io",
    ]);
  });
});
