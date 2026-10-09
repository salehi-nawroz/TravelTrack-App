import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { lazy, StrictMode, Suspense } from "react";

import { CitiesProvider } from "./contexts/CitiesContext";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectRoute from "./pages/ProtectRoute";

// Components
import CityList from "./components/CityList";
import City from "./components/City";
import CountryList from "./components/CountryList";
import TripList from "./components/TripList";
import Trash from "./components/Trash";
import Form from "./components/Form";
import SpinnerFullPage from "./components/SpinnerFullPage";
import Spinner from "./components/Spinner";

// Pages
const Homepage = lazy(() => import("./pages/Homepage"));
const Product = lazy(() => import("./pages/Product"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AppLayout = lazy(() => import("./pages/AppLayout"));
const PageNotFound = lazy(() => import("./pages/PageNotFound"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Profile = lazy(() => import("./components/Profile"));
const Admin = lazy(() => import("./pages/Admin"));

function App() {
  return (
    <AuthProvider>
      <CitiesProvider>
        <BrowserRouter>
          <Suspense fallback={<SpinnerFullPage />}>
            <Routes>
              {/* Public routes */}
              <Route
                path="/"
                element={
                  <StrictMode>
                    <Homepage />
                  </StrictMode>
                }
              />
              <Route
                path="pricing"
                element={
                  <StrictMode>
                    <Pricing />
                  </StrictMode>
                }
              />
              <Route
                path="product"
                element={
                  <StrictMode>
                    <Product />
                  </StrictMode>
                }
              />
              <Route
                path="login"
                element={
                  <StrictMode>
                    <Login />
                  </StrictMode>
                }
              />
              <Route
                path="signup"
                element={
                  <StrictMode>
                    <Signup />
                  </StrictMode>
                }
              />

              {/* Protected application */}
              <Route
                path="app"
                element={
                  <ProtectRoute>
                    <AppLayout />
                  </ProtectRoute>
                }
              >
                {/* /app */}
                <Route index element={<Navigate replace to="countries" />} />

                {/* /app/cities */}
                <Route path="cities" element={<CityList />} />

                {/* /app/cities/:id */}
                <Route path="cities/:id" element={<City />} />

                {/* /app/cities/:id/edit */}
                <Route path="cities/:id/edit" element={<Form />} />

                {/* /app/trash */}
                <Route path="trash" element={<Trash />} />

                {/* /app/countries */}
                <Route path="countries" element={<CountryList />} />

                {/* /app/trips */}
                <Route path="trips" element={<TripList />} />

                {/* /app/form */}
                <Route path="form" element={<Form />} />

                {/* /app/profile */}
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<Spinner />}>
                      <Profile />
                    </Suspense>
                  }
                />

                {/* /app/admin */}
                <Route
                  path="admin"
                  element={
                    <Suspense fallback={<Spinner />}>
                      <Admin />
                    </Suspense>
                  }
                />
              </Route>

              {/* 404 */}
              <Route
                path="*"
                element={
                  <StrictMode>
                    <PageNotFound />
                  </StrictMode>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CitiesProvider>
    </AuthProvider>
  );
}

export default App;
