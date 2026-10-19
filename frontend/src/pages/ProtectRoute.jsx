import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useEffect } from "react";
import SpinnerFullPage from "../components/SpinnerFullPage";

// Signed-out visitors (a direct link, or a session that has ended) go to the
// login page, which brings them back here afterwards. `replace` keeps the
// protected URL out of the history so Back doesn't bounce them again.
function ProtectRoute({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated)
      navigate("/login", {
        replace: true,
        state: { from: location.pathname + location.search },
      });
  }, [isAuthenticated, isLoading, navigate, location]);

  if (isLoading) return <SpinnerFullPage />;

  return isAuthenticated ? children : null;
}

export default ProtectRoute;
