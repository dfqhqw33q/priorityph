import { getRequest } from "@tanstack/react-start/server";

export function getCurrentRequest() {
  return getRequest();
}
