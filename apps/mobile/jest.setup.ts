import type * as SafeAreaContext from "react-native-safe-area-context";

process.env.EXPO_PUBLIC_API_URL = "http://localhost:4000";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve())
}));

jest.mock(
  "react-native-safe-area-context",
  () =>
    jest.requireActual<{ default: typeof SafeAreaContext }>(
      "react-native-safe-area-context/jest/mock"
    ).default
);
