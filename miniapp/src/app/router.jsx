import HomePage from "../pages/HomePage";
import ServersPage from "../pages/ServersPage";
import PackagesPage from "../pages/PackagesPage";
import { TAB_KEYS } from "../constants/routes";

export function renderPage(tab, props) {
  switch (tab) {
    case TAB_KEYS.SERVERS:
      return <ServersPage {...props} />;
    case TAB_KEYS.PACKAGES:
      return <PackagesPage {...props} />;
    case TAB_KEYS.HOME:
    default:
      return <HomePage {...props} />;
  }
}