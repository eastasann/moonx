import {
  contextualHelpSizes,
  dialogSizes,
  popoverSizes,
  sizes,
  sizesWithXS,
} from "@moonx/ui-tokens";
import { Copy, FileDown, FileUp, History, MessageSquare } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Button, ButtonGroup } from "../components/Button";
import { ContextualHelp } from "../components/ContextualHelp";
import { AlertDialog, Dialog, DialogTrigger } from "../components/Dialog";
import { Link } from "../components/Link";
import { ActionMenu, Menu, MenuItem, MenuTrigger } from "../components/Menu";
import { Popover } from "../components/Popover";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { Tooltip, TooltipTrigger } from "../components/Tooltip";
import { Tray } from "../components/Tray";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";

const dialogNames = {
  S: "Save version",
  M: "New idea",
  L: "Evidence",
  fullscreen: "Update template",
} as const;

export function DialogSection() {
  const [last, setLast] = useState("none");
  return (
    <Section title="Dialog and AlertDialog">
      <Specimen name="size S / M / L / fullscreen (a phone: S and M a tray, L and fullscreen a full sheet)">
        <Flex gap="space-200" wrap>
          {dialogSizes.map((size) => (
            <DialogTrigger key={size}>
              <Button variant="secondary">{`Open ${size}`}</Button>
              <Dialog
                title={dialogNames[size]}
                size={size}
                buttons={({ close }) => (
                  <ButtonGroup align="end">
                    <Button variant="secondary" onPress={close}>
                      Cancel
                    </Button>
                    <Button onPress={close}>Save</Button>
                  </ButtonGroup>
                )}
              >
                <Stack gap="space-300">
                  <TextField label="Name" />
                  <Text elementType="p">
                    The body scrolls when it is taller than the dialog; the
                    title and the buttons stay in view.
                  </Text>
                </Stack>
              </Dialog>
            </DialogTrigger>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="isDismissable (close button, press outside)">
        <DialogTrigger>
          <Button variant="secondary">Open dismissable</Button>
          <Dialog title="Share" size="S" isDismissable>
            <Text elementType="p">
              Choose the workspaces to share your self analysis with.
            </Text>
          </Dialog>
        </DialogTrigger>
      </Specimen>
      <Specimen name='AlertDialog variant="destructive" / "error" / "warning" (Escape does not close)'>
        <Flex gap="space-200" wrap alignItems="center">
          <DialogTrigger>
            <Button variant="secondary">Delete row</Button>
            <AlertDialog
              variant="destructive"
              title="Delete this row?"
              primaryActionLabel="Delete"
              cancelLabel="Cancel"
              autoFocusButton="cancel"
              onPrimaryAction={() => setLast("Delete")}
              onCancel={() => setLast("Cancel")}
            >
              The row and its evidence links are removed.
            </AlertDialog>
          </DialogTrigger>
          <DialogTrigger>
            <Button variant="secondary">Show error</Button>
            <AlertDialog
              variant="error"
              title="Something went wrong"
              primaryActionLabel="Retry"
              cancelLabel="Close"
              onPrimaryAction={() => setLast("Retry")}
              onCancel={() => setLast("Close")}
            >
              Ref: 3f2a9c1d
            </AlertDialog>
          </DialogTrigger>
          <DialogTrigger>
            <Button variant="secondary">Show conflict</Button>
            <AlertDialog
              variant="warning"
              title="Paolo updated this answer 3m ago"
              primaryActionLabel="Overwrite with mine"
              secondaryActionLabel="Load theirs"
              onPrimaryAction={() => setLast("Overwrite with mine")}
              onSecondaryAction={() => setLast("Load theirs")}
            >
              Overwriting keeps their version in the history.
            </AlertDialog>
          </DialogTrigger>
          <Text tone="secondary">{`Last answer: ${last}`}</Text>
        </Flex>
      </Specimen>
    </Section>
  );
}

export function PopoverSection() {
  return (
    <Section title="Popover and Tray">
      <Specimen name="Popover (unsized fits its content; a phone shows a tray)">
        <DialogTrigger>
          <Button variant="secondary">Open popover</Button>
          <Popover aria-label="F/A/U">
            <Text>Fact · 2 sources</Text>
          </Popover>
        </DialogTrigger>
      </Specimen>
      <Specimen name="Popover size S / M / L">
        <Flex gap="space-200" wrap>
          {popoverSizes.map((size) => (
            <DialogTrigger key={size}>
              <Button variant="secondary">{`Popover ${size}`}</Button>
              <Popover size={size} aria-label={`Popover ${size}`}>
                <Text elementType="p">{`A popover of width ${size}.`}</Text>
              </Popover>
            </DialogTrigger>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="Tray (a sheet at every width) and isDismissable={false}">
        <Flex gap="space-200" wrap>
          <DialogTrigger>
            <Button variant="secondary">Open tray</Button>
            <Tray aria-label="Tray">{trayContent}</Tray>
          </DialogTrigger>
          <DialogTrigger>
            <Button variant="secondary">Open fixed tray</Button>
            <Tray aria-label="Fixed tray" isDismissable={false}>
              {trayContent}
            </Tray>
          </DialogTrigger>
        </Flex>
      </Specimen>
    </Section>
  );
}

const trayContent = ({ close }: { close: () => void }) => (
  <Stack gap="space-300">
    <Text elementType="p">
      A bottom sheet. Its content scrolls when it is too tall.
    </Text>
    <Button variant="secondary" onPress={close}>
      Close tray
    </Button>
  </Stack>
);

export function MenuSection() {
  const [action, setAction] = useState("none");
  return (
    <Section title="ActionMenu and Menu">
      <Specimen name="ActionMenu size XS / S / M / L / XL">
        <Flex gap="space-200" wrap alignItems="center">
          {sizesWithXS.map((size) => (
            <ActionMenu
              key={size}
              size={size}
              aria-label={`Idea actions ${size}`}
              onAction={(key) => setAction(String(key))}
            >
              <MenuItem id="duplicate" icon={<Copy />}>
                Duplicate
              </MenuItem>
              <MenuItem id="archive">Archive</MenuItem>
              <MenuItem id="update" isDisabled>
                Update template
              </MenuItem>
            </ActionMenu>
          ))}
          <Text tone="secondary">{`Last action: ${action}`}</Text>
        </Flex>
      </Specimen>
      <Specimen name="MenuTrigger with links (AI ▼)">
        <MenuTrigger>
          <Button variant="secondary">AI</Button>
          <Menu>
            <MenuItem id="export" href="#export" icon={<FileUp />}>
              Export for AI
            </MenuItem>
            <MenuItem
              id="import"
              href="#import"
              icon={<FileDown />}
              description="Paste a reply from ChatGPT or Claude"
            >
              Import from AI
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </Specimen>
      <Specimen name="Menu size S / M / L / XL">
        <Flex gap="space-200" wrap>
          {sizes.map((size) => (
            <MenuTrigger key={size}>
              <Button variant="secondary">{`Menu ${size}`}</Button>
              <Menu size={size}>
                <MenuItem id="duplicate">Duplicate</MenuItem>
                <MenuItem id="archive">Archive</MenuItem>
              </Menu>
            </MenuTrigger>
          ))}
        </Flex>
      </Specimen>
    </Section>
  );
}

export function TooltipSection() {
  const [pressed, setPressed] = useState(0);
  return (
    <Section title="Tooltip and ContextualHelp">
      <Specimen name="TooltipTrigger (hover, keyboard focus, or a long press on touch)">
        <Flex gap="space-200" alignItems="center">
          <TooltipTrigger>
            <ActionButton
              isQuiet
              aria-label="Comments"
              onPress={() => setPressed((count) => count + 1)}
            >
              <MessageSquare />
            </ActionButton>
            <Tooltip>Comments</Tooltip>
          </TooltipTrigger>
          <TooltipTrigger>
            <ActionButton isQuiet aria-label="History">
              <History />
            </ActionButton>
            <Tooltip placement="bottom">History</Tooltip>
          </TooltipTrigger>
          <Text tone="secondary">{`Comments pressed: ${pressed}`}</Text>
        </Flex>
      </Specimen>
      <Specimen name='ContextualHelp variant="help" / "info", size XS / S, label'>
        <Flex gap="space-200" wrap alignItems="center">
          {contextualHelpSizes.map((size) => (
            <ContextualHelp
              key={size}
              size={size}
              title="Who exactly is the customer?"
            >
              Name one group you can reach this month.
            </ContextualHelp>
          ))}
          <ContextualHelp variant="info" title="Where the numbers come from">
            Costs and prices are edited in validation only.{" "}
            <Link variant="secondary" href="#costs">
              Open 05 Costs
            </Link>
          </ContextualHelp>
          <ContextualHelp label="Hint" title="Hint">
            Think of the last time they bought a gift box.
          </ContextualHelp>
        </Flex>
      </Specimen>
    </Section>
  );
}
