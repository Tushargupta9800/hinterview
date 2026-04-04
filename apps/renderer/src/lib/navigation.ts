import type { NavigateFunction } from "react-router-dom";

const NAV_STACK_KEY = "hinterview:navigation-stack";

const readStack = (): string[] => {
  try {
    const raw = window.sessionStorage.getItem(NAV_STACK_KEY);
    if (!raw) {
      return ["/"];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return ["/"];
    }

    return parsed.length ? parsed : ["/"];
  } catch {
    return ["/"];
  }
};

const writeStack = (stack: string[]) => {
  window.sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack));
};

export const syncNavigationStack = (pathname: string) => {
  const stack = readStack();

  if (pathname === "/") {
    writeStack(["/"]);
    return;
  }

  const existingIndex = stack.lastIndexOf(pathname);
  if (existingIndex >= 0) {
    writeStack(stack.slice(0, existingIndex + 1));
    return;
  }

  writeStack([...stack, pathname]);
};

export const navigateToLibraryBase = (navigate: NavigateFunction) => {
  const stack = readStack();
  if (stack.length > 1) {
    navigate(-(stack.length - 1));
    return;
  }

  navigate("/", { replace: true });
};
