import { redirect } from "next/navigation";

// The trend dashboard was removed — search is the home surface now. Unauthenticated users are sent to
// /login by the middleware; signed-in users land directly on /search.
export default function Home() {
  redirect("/search");
}
