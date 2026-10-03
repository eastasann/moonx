/** Gallery section: dialogs, popovers, trays, tooltips, help, the panel and toasts. */
import { DIALOG_SIZES, TOAST_VARIANTS } from "@moonx/ui-tokens";
import { MessageSquare } from "lucide-react-native";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { AlertDialog } from "../components/AlertDialog";
import { Button } from "../components/Button";
import { ContextualHelp } from "../components/ContextualHelp";
import { Dialog } from "../components/Dialog";
import { Panel } from "../components/Panel";
import { Popover } from "../components/Popover";
import { ResponsivePopover } from "../components/ResponsivePopover";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { createToastQueue, ToastRegion } from "../components/Toast";
import { Tooltip } from "../components/Tooltip";
import { Tray } from "../components/Tray";
import { Case, Cases, Component, GallerySection } from "./parts";

export const OVERLAYS_COVERAGE = [
  "Dialog",
  "AlertDialog",
  "Popover",
  "ResponsivePopover",
  "Tray",
  "Tooltip",
  "ContextualHelp",
  "Panel",
  "ToastRegion",
] as const;

const toasts = createToastQueue();

const PLACEMENTS = ["top", "bottom", "left", "right"] as const;

function PanelDemo() {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Open panel
      </Button>
      <Panel
        isOpen={isOpen}
        onOpenChange={setOpen}
        title="Comments"
        closeLabel="Close panel"
        footer={<TextField label="Add a comment" />}
      >
        <Text>First thread</Text>
        <Text>Second thread</Text>
      </Panel>
    </>
  );
}

export function OverlaysSection() {
  return (
    <GallerySection id="overlays" title="Overlays">
      <Component
        name="Dialog"
        note="A tray at every size except fullscreen, which covers the screen."
      >
        <Cases label="Sizes">
          {DIALOG_SIZES.map((size) => (
            <Case key={size} label={size}>
              <Dialog
                size={size}
                title={`Dialog ${size}`}
                closeLabel="Close dialog"
                trigger={<Button variant="secondary">{`Open ${size}`}</Button>}
                actions={({ close }) => (
                  <>
                    <Button variant="secondary" onPress={close}>
                      Cancel
                    </Button>
                    <Button onPress={close}>Save</Button>
                  </>
                )}
              >
                <Text>{`Body of the ${size} dialog.`}</Text>
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
              <Text>Press outside to close.</Text>
            </Dialog>
          </Case>
          <Case label="Without actions">
            <Dialog
              title="Plain dialog"
              closeLabel="Close dialog"
              trigger={<Button variant="secondary">Open plain</Button>}
            >
              <Text>Only the close button.</Text>
            </Dialog>
          </Case>
          <Case label="Close button hidden">
            <Dialog
              isCloseHidden
              title="Answer required"
              closeLabel="Close dialog"
              trigger={<Button variant="secondary">Open without close</Button>}
              actions={({ close }) => <Button onPress={close}>Understood</Button>}
            >
              <Text>Only the action closes this one.</Text>
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

      <Component name="Popover" note="Opens as a tray on the phone; placement is ignored.">
        <Cases>
          <Case label="Bottom start">
            <Popover
              aria-label="Details"
              placement="bottom start"
              trigger={<Button variant="secondary">Open popover</Button>}
            >
              <Text>Popover content</Text>
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

      <Component name="ResponsivePopover" note="What Popover, Menu and ContextualHelp open with.">
        <Cases>
          <Case label="Trigger and a close action">
            <ResponsivePopover
              aria-label="Responsive details"
              trigger={<Button variant="secondary">Open responsive</Button>}
            >
              {({ close }) => (
                <>
                  <Text>Responsive content</Text>
                  <Button onPress={close}>Done</Button>
                </>
              )}
            </ResponsivePopover>
          </Case>
        </Cases>
      </Component>

      <Component name="Tray" note="A bottom sheet.">
        <Cases>
          <Case label="Default">
            <Tray
              aria-label="Tray content"
              trigger={<Button variant="secondary">Open tray</Button>}
            >
              {({ close }) => (
                <>
                  <Text>Tray content</Text>
                  <Button onPress={close}>Done</Button>
                </>
              )}
            </Tray>
          </Case>
          <Case label="With a pinned footer">
            <Tray
              aria-label="Tray with footer"
              trigger={<Button variant="secondary">Open with footer</Button>}
              footer={<Button variant="accent">Apply</Button>}
            >
              <Text>Content above the footer</Text>
            </Tray>
          </Case>
          <Case label="Not dismissable">
            <Tray
              aria-label="Tray that must be answered"
              isDismissable={false}
              trigger={<Button variant="secondary">Open not dismissable</Button>}
            >
              {({ close }) => <Button onPress={close}>Close</Button>}
            </Tray>
          </Case>
        </Cases>
      </Component>

      <Component name="Tooltip" note="Long press the button.">
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

      <Component name="Panel" note="A tray with a title, a close button and a pinned footer.">
        <PanelDemo />
      </Component>

      <Component
        name="Toast"
        note="Press a button to queue a toast; it stays 5 seconds."
        includes={["ToastRegion"]}
      >
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
                {`Show ${variant}`}
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
