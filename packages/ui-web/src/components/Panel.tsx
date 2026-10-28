import { X } from "lucide-react";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FixedLocale } from "../internal/FixedLocale";
import { OverlayContexts } from "../internal/OverlayContexts";
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
  /**
   * The threads or the changes; they scroll inside the panel. What they put in a
   * {@link PanelFooter} stays under them instead.
   */
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
    <ModalPanel title={title} isOpen={isOpen} onOpenChange={onOpenChange}>
      {children}
    </ModalPanel>
  );
}

/**
 * The panel over the screen, modal: the drawer from the right from the tablet breakpoint
 * up, a tray on a phone. WorksheetPattern opens its results in it on a desktop too, once
 * a docked panel has taken their column (design-spec 4.1 F).
 */
export function ModalPanel({
  title,
  isOpen,
  onOpenChange,
  children,
}: PanelProps) {
  const isNarrow = useIsNarrow();
  return (
    <FixedLocale>
      <ModalOverlay
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        className={isNarrow ? overlay.trayOverlay : styles.drawerOverlay}
      >
        <Modal className={isNarrow ? overlay.tray : styles.drawer}>
          <OverlayContexts>
            <Dialog className={styles.dialog}>
              {({ close }) => (
                <PanelContent title={title} onClose={close} isDialog>
                  {children}
                </PanelContent>
              )}
            </Dialog>
          </OverlayContexts>
        </Modal>
      </ModalOverlay>
    </FixedLocale>
  );
}

/** The panel's footer, where a {@link PanelFooter} in its children puts what it holds. */
const FooterContext = createContext<HTMLElement | null>(null);

/**
 * What stays at the bottom of the panel, under the part that scrolls: the box for a new
 * thread under the threads (PNL-1, design-spec 6.0.4), in the docked column, the
 * drawer and the tray alike. It may sit anywhere among the panel's children, which keeps
 * it in their state; on a phone the tray rises above the on-screen keyboard (4.3), and
 * the footer with it.
 */
export function PanelFooter({ children }: { children: ReactNode }) {
  const footer = useContext(FooterContext);
  return footer === null ? null : createPortal(children, footer);
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
  const { t } = useTranslation(["components"]);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  return (
    <>
      <div className={styles.header}>
        <Heading level={2} id={headingId} slot={isDialog ? "title" : undefined}>
          {title}
        </Heading>
        <ActionButton
          isQuiet
          size="S"
          aria-label={t("components:panel.close")}
          onPress={onClose}
        >
          <X />
        </ActionButton>
      </div>
      <FooterContext.Provider value={footer}>
        <div className={styles.body}>{children}</div>
      </FooterContext.Provider>
      <div ref={setFooter} className={styles.footer} />
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
