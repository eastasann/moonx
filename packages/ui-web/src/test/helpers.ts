import { act } from "@testing-library/react";

/** Phone width: below `semantic.breakpoint.tablet`, where overlays become trays. */
export function setPhoneWidth() {
  act(() => window.happyDOM.setViewport({ width: 390, height: 844 }));
}

/** Tablet width: from `semantic.breakpoint.tablet` up to the desktop breakpoint. */
export function setTabletWidth() {
  act(() => window.happyDOM.setViewport({ width: 820, height: 1180 }));
}

/** Lets React Aria's timers and transitions settle. */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
