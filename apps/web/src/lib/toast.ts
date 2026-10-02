import { createToastQueue } from "@moonx/ui-web";

/** The app's one toast queue; the root route mounts its `ToastRegion`. */
export const toasts = createToastQueue();
