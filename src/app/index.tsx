import { Redirect } from "expo-router";

import { useAuthStore } from "@/features/auth/store/useAuthStore";

export default function Index() {
  const session = useAuthStore((state) => state.session);

  return <Redirect href={session ? "/(tabs)/kesfet" : "/(auth)/giris"} />;
}
