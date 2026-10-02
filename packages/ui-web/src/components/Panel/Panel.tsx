import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import {
  body,
  close,
  closeIcon,
  dialog,
  drawer,
  footer,
  header,
  overlayBackdrop,
  side,
  title as titleClass,
  tray,
  trayBackdrop,
} from "./Panel.css";
import { usePanelMode } from "./usePanelMode";

export interface PanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Heading and accessible name of the panel, such as "Comments" or "History". */
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  /** Body: the comment threads or the change history. */
  children: ReactNode;
  /** Pinned below the body, such as the comment input. */
  footer?: ReactNode;
}

function Content({
  titleNode,
  closeLabel,
  onClose,
  children,
  footer: footerSlot,
}: {
  titleNode: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className={header}>
        {titleNode}
        <Button className={close} aria-label={closeLabel} onPress={onClose}>
          <X className={closeIcon} aria-hidden />
        </Button>
      </div>
      <div className={body}>{children}</div>
      {footerSlot ? <div className={footer}>{footerSlot}</div> : null}
    </>
  );
}

/**
 * Comment and change-history panel (PNL-1, PNL-2). On desktop it is a fixed-width column at the
 * right that does not take focus or block the page, so the form beside it stays editable. On
 * tablet it is a drawer over the page and below tablet a tray, both modal.
 */
export function Panel({ isOpen, onOpenChange, title, closeLabel, children, footer }: PanelProps) {
  const mode = usePanelMode();
  const titleId = useId();
  const onClose = () => onOpenChange(false);

  if (mode === "side") {
    if (!isOpen) return null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    return (
      <aside className={side} aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <Content
          titleNode={
            <h2 id={titleId} className={titleClass}>
              {title}
            </h2>
          }
          closeLabel={closeLabel}
          onClose={onClose}
          footer={footer}
        >
          {children}
        </Content>
      </aside>
    );
  }

  const isTray = mode === "tray";
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={isTray ? trayBackdrop : overlayBackdrop}
    >
      <Modal className={isTray ? tray : drawer}>
        <Dialog className={dialog}>
          <Content
            titleNode={
              <Heading slot="title" className={titleClass}>
                {title}
              </Heading>
            }
            closeLabel={closeLabel}
            onClose={onClose}
            footer={footer}
          >
            {children}
          </Content>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
