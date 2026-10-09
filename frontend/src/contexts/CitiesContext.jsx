import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
} from "react";

import {
  getMyCities,
  getCity as getCityApi,
  createCity as createCityApi,
  updateCity as updateCityApi,
  trashCity as trashCityApi,
  restoreCity as restoreCityApi,
} from "../services/cityService";
import { useAuth } from "../contexts/AuthContext";
import { compareDates } from "../utils/compareDates";

const CitiesContext = createContext();

const initialState = {
  cities: [],
  isLoading: false,
  currentCity: {},
  error: "",
};

function reducer(state, action) {
  switch (action.type) {
    case "loading":
      return {
        ...state,
        isLoading: true,
        error: "",
      };

    case "cities/loaded":
      return {
        ...state,
        isLoading: false,
        cities: action.payload,
      };

    case "city/loaded":
      return {
        ...state,
        isLoading: false,
        currentCity: action.payload,
      };

    case "city/created":
      return {
        ...state,
        isLoading: false,
        cities: [...state.cities, action.payload],
        currentCity: action.payload,
      };

    case "cities/imported":
      return {
        ...state,
        cities: [...state.cities, ...action.payload],
      };

    // Back in its original spot: the list is ordered by created_at, like
    // getMyCities returns it.
    case "city/restored":
      return {
        ...state,
        cities: [...state.cities, action.payload].sort((a, b) =>
          compareDates(a.createdAt, b.createdAt),
        ),
      };

    case "city/updated":
      return {
        ...state,
        isLoading: false,
        cities: state.cities.map((city) =>
          city.id === action.payload.id ? action.payload : city,
        ),
        currentCity: action.payload,
      };

    case "city/deleted":
      return {
        ...state,
        isLoading: false,
        cities: state.cities.filter((city) => city.id !== action.payload),
        currentCity: {},
      };

    case "rejected":
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    default:
      throw new Error("Unknown action type");
  }
}

function CitiesProvider({ children }) {
  const [{ cities, isLoading, currentCity, error }, dispatch] = useReducer(
    reducer,
    initialState,
  );

  const { user } = useAuth();

  // GET ALL CITIES
  useEffect(() => {
    if (!user?.id) return;

    async function fetchCities() {
      dispatch({ type: "loading" });

      try {
        const data = await getMyCities();

        dispatch({
          type: "cities/loaded",
          payload: data,
        });
      } catch {
        dispatch({
          type: "rejected",
          payload: "There was an error loading data...",
        });
      }
    }

    fetchCities();
  }, [user?.id]);

  // GET ONE CITY
  const getCity = useCallback(
    async function getCity(id) {
      if (String(id) === String(currentCity.id)) return;

      dispatch({ type: "loading" });

      try {
        const data = await getCityApi(id);

        dispatch({
          type: "city/loaded",
          payload: data,
        });
      } catch {
        dispatch({
          type: "rejected",
          payload: "There was an error loading the city...",
        });
      }
    },
    [currentCity.id],
  );

  // CREATE CITY
  async function createCity(city) {
    dispatch({ type: "loading" });

    try {
      const data = await createCityApi(city);

      dispatch({
        type: "city/created",
        payload: data,
      });

      return data;
    } catch {
      dispatch({
        type: "rejected",
        payload: "There was an error creating the city...",
      });

      return null;
    }
  }

  // IMPORT CITIES (CSV) - inserts one by one through the same createCity
  // service (owner = signed-in user, enforced by RLS) so each row succeeds or
  // fails on its own. Deliberately no "loading" dispatch: that would swap
  // the city list for a spinner and unmount the import dialog mid-way.
  async function importCities(newCities) {
    const created = [];
    let failed = 0;

    for (const city of newCities) {
      try {
        created.push(await createCityApi(city));
      } catch (err) {
        console.error("Failed to import city:", err.message);
        failed++;
      }
    }

    if (created.length) {
      dispatch({ type: "cities/imported", payload: created });
    }

    return { imported: created.length, failed };
  }

  // UPDATE CITY
  async function updateCity(id, city) {
    dispatch({ type: "loading" });

    try {
      const data = await updateCityApi(id, city);

      dispatch({
        type: "city/updated",
        payload: data,
      });

      return data;
    } catch {
      dispatch({
        type: "rejected",
        payload: "There was an error updating the city...",
      });

      return null;
    }
  }

  // DELETE CITY - moves it to the Trash (soft delete); permanent deletion
  // only happens from the Trash page.
  async function deleteCity(id) {
    dispatch({ type: "loading" });

    try {
      await trashCityApi(id);

      dispatch({
        type: "city/deleted",
        payload: id,
      });
    } catch {
      dispatch({
        type: "rejected",
        payload: "There was an error deleting the city...",
      });
    }
  }

  // RESTORE CITY (from the Trash). Throws so the Trash page can show the
  // error next to the city; no "loading" dispatch, which would swap the
  // sidebar content for a spinner.
  async function restoreCity(id) {
    const data = await restoreCityApi(id);
    dispatch({ type: "city/restored", payload: data });
    return data;
  }

  return (
    <CitiesContext.Provider
      value={{
        cities,
        isLoading,
        error,
        getCity,
        currentCity,
        createCity,
        importCities,
        updateCity,
        deleteCity,
        restoreCity,
      }}
    >
      {children}
    </CitiesContext.Provider>
  );
}

function useCities() {
  const context = useContext(CitiesContext);

  if (context === undefined) {
    throw new Error("CitiesContext was used outside of the CitiesProvider");
  }

  return context;
}

export { CitiesProvider, useCities };
