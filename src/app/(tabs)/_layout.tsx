import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { colors } from "@/shared/theme";

export default function TabsLayout() {
  const session = useAuthStore((state) => state.session);

  if (!session) {
    return <Redirect href="/(auth)/giris" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.backgroundElevated,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="kesfet"
        options={{
          title: "Keşfet",
          tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="harita"
        options={{
          title: "Harita",
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="etkinlikler"
        options={{
          title: "Etkinlikler",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="surus-kaydi"
        options={{
          title: "Sürüş Kaydı",
          tabBarIcon: ({ color, size }) => <Ionicons name="recording" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="forum"
        options={{
          title: "Forum",
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
