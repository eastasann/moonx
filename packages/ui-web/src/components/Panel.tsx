import { i18n } from "@moonx/i18n";
import { X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import * as overlay from "../internal/overlay.css";
import { useIsDesktop } from "../internal/useIsDesktop";
import { useIsNarrow } from "../internal/useIsNarrow";
import { ActionButton } from "./ActionButton";
import { Heading } from "./Heading";
import * as styles from "./Panel.css";

export interface PanelProps {
  /** The panel's name, its heading ("Comments", "History"). */
  title: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The threads or the changes; they scroll inside the panel. */
  children: ReactNode;
}

/**
 * The comments and history panel (PNL-1・PNL-2, design-spec 3.8・4.5): on a desktop a
 * column beside the body, not modal, so the answer stays open beside it; on a tablet a
 * drawer from the right over a scrim; on a phone a tray. The desktop column sits where the
 * screen puts it (AppFrame's right column).
 */
export function Panel({ title, isOpen, onOpenChange, children }: PanelProps) {
  const isDesktop = useIsDesktop();
  const isNarrow = useIsNarrow();
  if (isDesktop) {
    return isOpen ? (
      // A new title is another panel (💬 then 🕘): it takes focus from the button that
      // opened it.
      <DockedPanel
        key={title}
        title={title}
        onClose={() => onOpenChange(false)}
      >
        {children}
      </DockedPanel>
    ) : null;
  }
  return (
    <FixedLocale>
      <ModalOverlay
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        className={isNarrow ? overlay.trayOverlay : styles.drawerOverlay}
      >
        <Modal className={isNarrow ? overlay.tray : styles.drawer}>
          <Dialog className={styles.dialog}>
            {({ close }) => (
              <PanelContent title={title} onClose={close} isDialog>
                {children}
              </PanelContent>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </FixedLocale>
  );
}

function PanelContent({
  title,
  onClose,
  isDialog,
  headingId,
  children,
}: {
  title: string;
  onClose: () => void;
  isDialog: boolean;
  headingId?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className={styles.header}>
        <Heading level={2} id={headingId} slot={isDialog ? "title" : undefined}>
          {title}
        </Heading>
        <ActionButton
          isQuiet
          size="S"
          aria-label={i18n.t("components:panel.close")}
          onPress={onClose}
        >
          <X />
        </ActionButton>
      </div>
      <div className={styles.body}>{children}</div>
    </>
  );
}

/**
 * The desktop's column. Opening moves focus into it and Escape inside closes it,
 * returning focus to where it came from (the 💬 or 🕘 that opened it), as a popover does.
 */
function DockedPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const ref = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    // Kept from the first run: run again (Strict Mode), focus is already in the panel.
    opener.current ??= document.activeElement;
    ref.current?.focus();
  }, []);

  // However it closes (Escape, its button, the screen), focus in the panel goes back to
  // the opener; closed while focus is elsewhere (the 💬 pressed again), it stays there.
  // A layout effect's cleanup runs while the panel is still in the page.
  useLayoutEffect(() => {
    const panel = ref.current;
    return () => {
      const element = opener.current;
      if (
        panel?.contains(document.activeElement) &&
        element instanceof HTMLElement &&
        element.isConnected
      ) {
        element.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    // Escape from a dialog opened in the panel (a portal) is the dialog's, and Escape that
    // ends an IME composition is the composition's (Safari reports it as 229).
    if (
      event.key !== "Escape" ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      !event.currentTarget.contains(event.target as Node)
    ) {
      return;
    }
    event.stopPropagation();
    onClose();
  };

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      className={styles.docked}
    >
      <PanelContent
        title={title}
        onClose={onClose}
        isDialog={false}
        headingId={headingId}
      >
        {children}
      </PanelContent>
    </aside>
  );
}
