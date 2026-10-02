/** Gallery section: dialogs, popovers, trays, tooltips, help, the side panel and toasts. */
import { DIALOG_SIZES, TOAST_VARIANTS } from "@moonx/ui-tokens";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { AlertDialog } from "../components/AlertDialog";
import { Button } from "../components/Button";
import { ContextualHelp } from "../components/ContextualHelp";
import { Dialog } from "../components/Dialog";
import { Panel } from "../components/Panel";
import { Popover } from "../components/Popover";
import { TextField } from "../components/TextField";
import { createToastQueue, ToastRegion } from "../components/Toast";
import { Tooltip } from "../components/Tooltip";
import { Tray } from "../components/Tray";
import { Case, Cases, Component, GallerySection } from "./parts";
import { panelRow } from "./preview.css";

const toasts = createToastQueue();

const PLACEMENTS = ["top", "bottom", "start", "end"] as const;

function PanelDemo() {
  const [isOpen, setOpen] = useState(false);
  return (
    <div className={panelRow}>
      <Button variant="secondary" onPress={() => setOpen(!isOpen)}>
        {isOpen ? "Close panel" : "Open panel"}
      </Button>
      <Panel
        isOpen={isOpen}
        onOpenChange={setOpen}
        title="Comments"
        closeLabel="Close panel"
        footer={<TextField label="Add a comment" />}
      >
        <p>First thread</p>
        <p>Second thread</p>
      </Panel>
    </div>
  );
}

export function OverlaysSection() {
  return (
    <GallerySection id="overlays" title="Overlays">
      <Component
        name="Dialog"
        note="Centered from tablet width; a tray below it, or a full-screen sheet for fullscreen."
      >
        <Cases label="Sizes">
          {DIALOG_SIZES.map((size) => (
            <Case key={size} label={size}>
              <Dialog
                size={size}
                title={`Dialog ${size}`}
                closeLabel="Close dialog"
                trigger={<Button variant="secondary">Open {size}</Button>}
                actions={({ close }) => (
                  <>
                    <Button variant="secondary" onPress={close}>
                      Cancel
                    </Button>
                    <Button onPress={close}>Save</Button>
                  </>
                )}
              >
                <p>Body of the {size} dialog.</p>
              </Dialog>
            </Case>
          ))}
          <Case label="Dismissable (closes on outside press)">
            <Dialog
              isDismissable
              title="Dismissable dialog"
              closeLabel="Close dialog"
              trigger={<Button variant="secondary">Open dismissable</Button>}
            >
              <p>Press outside to close.</p>
            </Dialog>
          </Case>
          <Case label="Without actions">
            <Dialog
              title="Plain dialog"
              closeLabel="Close dialog"
              trigger={<Button variant="secondary">Open plain</Button>}
            >
              <p>Only the close button.</p>
            </Dialog>
          </Case>
        </Cases>
      </Component>

      <Component
        name="AlertDialog"
        note="Has to be answered: it does not close on an outside press."
      >
        <Cases>
          <Case label="confirmation">
            <AlertDialog
              title="Save changes?"
              primaryActionLabel="Save"
              cancelLabel="Cancel"
              trigger={<Button variant="secondary">Open confirmation</Button>}
            >
              The version will be saved.
            </AlertDialog>
          </Case>
          <Case label="negative">
            <AlertDialog
              variant="negative"
              title="Delete idea?"
              primaryActionLabel="Delete"
              cancelLabel="Cancel"
              trigger={<Button variant="negative">Open negative</Button>}
            >
              This cannot be undone.
            </AlertDialog>
          </Case>
        </Cases>
      </Component>

      <Component name="Popover" note="A popover from tablet width, a tray below it.">
        <Cases>
          <Case label="Bottom start">
            <Popover
              aria-label="Details"
              placement="bottom start"
              trigger={<Button variant="secondary">Open popover</Button>}
            >
              <p>Popover content</p>
            </Popover>
          </Case>
          <Case label="With a close action">
            <Popover
              aria-label="Details with action"
              trigger={<Button variant="secondary">Open with action</Button>}
            >
              {({ close }) => <Button onPress={close}>Done</Button>}
            </Popover>
          </Case>
        </Cases>
      </Component>

      <Component name="Tray" note="A bottom sheet at every width.">
        <Cases>
          <Case label="Default">
            <Tray
              aria-label="Tray content"
              trigger={<Button variant="secondary">Open tray</Button>}
            >
              {({ close }) => (
                <>
                  <p>Tray content</p>
                  <Button onPress={close}>Done</Button>
                </>
              )}
            </Tray>
          </Case>
        </Cases>
      </Component>

      <Component name="Tooltip" note="Hover or focus the button.">
        <Cases>
          {PLACEMENTS.map((placement) => (
            <Case key={placement} label={placement}>
              <Tooltip content={`Tooltip ${placement}`} placement={placement}>
                <ActionButton icon={<MessageSquare />} aria-label={`Comments ${placement}`} />
              </Tooltip>
            </Case>
          ))}
          <Case label="Disabled">
            <Tooltip content="Never shown" isDisabled>
              <ActionButton icon={<MessageSquare />} aria-label="Comments disabled tooltip" />
            </Tooltip>
          </Case>
        </Cases>
      </Component>

      <Component name="ContextualHelp">
        <Cases>
          <Case label="help">
            <ContextualHelp variant="help" label="Help" title="How to answer">
              Describe what you saw a customer do.
            </ContextualHelp>
          </Case>
          <Case label="info">
            <ContextualHelp variant="info" label="Information" title="Background">
              Where the figure comes from.
            </ContextualHelp>
          </Case>
        </Cases>
      </Component>

      <Component
        name="Panel"
        note="A side column from desktop width, a drawer on tablet widths and a tray below."
      >
        <PanelDemo />
      </Component>

      <Component name="Toast" note="Press a button to queue a toast; it stays 5 seconds.">
        <Cases>
          {TOAST_VARIANTS.map((variant) => (
            <Case key={variant} label={variant}>
              <Button
                variant="secondary"
                onPress={() =>
                  toasts.add({
                    title: `Toast ${variant}`,
                    description: "Two answers updated",
                    variant,
                  })
                }
              >
                Show {variant}
              </Button>
            </Case>
          ))}
          <Case label="Title only">
            <Button variant="secondary" onPress={() => toasts.add({ title: "Decision recorded" })}>
              Show title only
            </Button>
          </Case>
        </Cases>
        <ToastRegion queue={toasts} label="Notifications" closeLabel="Close toast" />
      </Component>
    </GallerySection>
  );
}
