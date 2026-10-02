import { Skeleton } from "@moonx/ui-web";
import { useEffect } from "react";
import { useGoTo } from "../lib/navigate";

/** Sends the person on to `to` as soon as it mounts, with a skeleton for the moment in between. */
export function Redirect({ to }: { to: string }) {
  const goTo = useGoTo();
  useEffect(() => {
    goTo(to, { replace: true });
  }, [goTo, to]);
  return <Skeleton shape="block" height="space-700" />;
}
