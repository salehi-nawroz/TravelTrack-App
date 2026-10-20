import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Form from "./Form";
import { useCities } from "../contexts/CitiesContext";
import { getCityData } from "../services/geocodingService";

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/CitiesContext", () => ({ useCities: vi.fn() }));
vi.mock("../services/geocodingService", async (importOriginal) => ({
  ...(await importOriginal()),
  getCityData: vi.fn(),
}));

const createCity = vi.fn();

beforeEach(() => {
  createCity.mockReset().mockImplementation(async (city) => ({ id: "new", ...city }));
  useCities.mockReturnValue({
    createCity,
    updateCity: vi.fn(),
    getCity: vi.fn(),
    currentCity: {},
    isLoading: false,
    error: "",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(cleanup);

function renderForm(lat, lng) {
  return render(
    <MemoryRouter initialEntries={[`/app/form?lat=${lat}&lng=${lng}`]}>
      <Routes>
        <Route path="/app/form" element={<Form />} />
        <Route path="/app/cities" element={<p>cities list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const cityInput = () => screen.getByLabelText("City name");
const add = () => fireEvent.click(screen.getByRole("button", { name: "Add" }));

describe("adding a city from a map click", () => {
  it("fills the city from reverse geocoding and saves it", async () => {
    getCityData.mockResolvedValue({
      cityName: "Paris",
      region: "Ile-de-France",
      country: "France",
      countryCode: "FR",
      position: { lat: 48.85, lng: 2.35 },
    });
    renderForm(48.85, 2.35);

    expect(await screen.findByDisplayValue("Paris")).toBeTruthy();
    expect(screen.queryByLabelText("Country")).toBeNull();
    add();

    expect(await screen.findByText("cities list")).toBeTruthy();
    expect(createCity).toHaveBeenCalledWith(
      expect.objectContaining({
        cityName: "Paris",
        country: "France",
        countryCode: "FR",
        region: "Ile-de-France",
        position: { lat: 48.85, lng: 2.35 },
      }),
    );
  });

  it("lets the user enter the city by hand when the provider fails, keeping the pin", async () => {
    getCityData.mockRejectedValue(new Error("Network Error"));
    renderForm(34.5553, 69.2075);

    expect(await screen.findByText(/couldn't look up this place/)).toBeTruthy();
    expect(cityInput().value).toBe("");

    // A city name alone isn't enough: the country is required.
    fireEvent.change(cityInput(), { target: { value: "  Kabul " } });
    add();
    expect(await screen.findByText("Please choose the country.")).toBeTruthy();
    expect(createCity).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "AF" } });
    add();

    expect(await screen.findByText("cities list")).toBeTruthy();
    expect(createCity).toHaveBeenCalledWith(
      expect.objectContaining({
        cityName: "Kabul",
        country: "Afghanistan",
        countryCode: "AF",
        region: null,
        position: { lat: 34.5553, lng: 69.2075 },
      }),
    );
  });

  it("also offers manual entry when the point isn't a city", async () => {
    getCityData.mockResolvedValue(null);
    renderForm(0, -30);

    expect(await screen.findByText(/doesn't match a city/)).toBeTruthy();
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });
});
