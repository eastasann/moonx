import { useEffect, useRef } from "react";

/**
 * Whether the component is still on screen, for what settles after it may have gone: a
 * send's answer once its form, panel or screen has closed (design-spec 6.0.6「送っている間に
 * 閉じた送信の失敗」), which must neither move the user nor touch what is no longer there.
 */
export function useIsMounted(): { readonly current: boolean } {
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return isMounted;
}
